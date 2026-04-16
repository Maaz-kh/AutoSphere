const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const UserRepository = require('../repositories/user-repository');
const database = require('../config/database');
const EmailService = require('./email-service');

class UserService {
  constructor() {
    this.userRepository = UserRepository;
    this.emailService = EmailService;
    this.MAX_FAILED_ATTEMPTS = 5;
    this.LOCKOUT_DURATION_MINUTES = 15;
  }

  async register(userData, files = {}) {
    try {
      const {
        email,
        password,
        role,
        termsAccepted
      } = userData;

      // Handle both boolean and string values from FormData
      const isTermsAccepted = termsAccepted === true || termsAccepted === 'true' || termsAccepted === '1';
      if (!isTermsAccepted) {
        throw new Error('You must accept the terms and conditions to continue.');
      }

      const existingUser = await this.userRepository.findByEmail(email);
      if (existingUser) {
        throw new Error('User with this email already exists. Please login or reset your password.');
      }

      const profileData = this.extractProfileData(userData, files);
      if (role === 'workshop') {
        this.ensureWorkshopData(userData);
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const userId = await this.userRepository.createWithProfile(
        {
          email,
          password: hashedPassword,
          role,
          is_active: false,
          accepted_terms_at: new Date()
        },
        profileData
      );

      if (role === 'workshop') {
        const lat = parseFloat(userData.workshop_latitude);
        const lng = parseFloat(userData.workshop_longitude);
        const contactPhone = userData.phone_number || null;
        const wsResult = await database.query(
          `INSERT INTO workshops (user_id, name, ntn, contact_phone, address, city, country, latitude, longitude, is_verified)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [
            userId,
            userData.business_name,
            userData.workshop_ntn,
            contactPhone,
            userData.workshop_address,
            userData.workshop_city,
            userData.workshop_country,
            lat,
            lng
          ]
        );

        // Optional: initial services selection during registration (FormData JSON string)
        const workshopId = wsResult.insertId;
        if (workshopId) {
          let servicesPayload = userData.services;
          if (typeof servicesPayload === 'string' && servicesPayload.trim()) {
            try {
              servicesPayload = JSON.parse(servicesPayload);
            } catch {
              servicesPayload = null;
            }
          }
          if (Array.isArray(servicesPayload) && servicesPayload.length > 0) {
            const serviceIds = [...new Set(servicesPayload.map((s) => parseInt(s.service_id, 10)).filter((n) => Number.isFinite(n) && n > 0))];
            if (serviceIds.length > 0) {
              const placeholders = serviceIds.map(() => '?').join(',');
              const existing = await database.query(
                `SELECT id FROM services WHERE is_active = TRUE AND id IN (${placeholders})`,
                serviceIds
              );
              const activeSet = new Set(existing.map((r) => r.id));
              const items = servicesPayload
                .map((s) => ({
                  service_id: parseInt(s.service_id, 10),
                  price_min: s.price_min === '' || s.price_min === null || s.price_min === undefined ? null : parseFloat(s.price_min),
                  price_max: s.price_max === '' || s.price_max === null || s.price_max === undefined ? null : parseFloat(s.price_max),
                  is_active: s.is_active === undefined ? true : Boolean(s.is_active)
                }))
                .filter((s) => Number.isFinite(s.service_id) && activeSet.has(s.service_id));

              if (items.length > 0) {
                const values = [];
                const rowPlaceholders = items.map(() => '(?, ?, ?, ?, ?)').join(',');
                for (const it of items) {
                  values.push(workshopId, it.service_id, it.price_min, it.price_max, it.is_active ? 1 : 0);
                }
                await database.query(
                  `INSERT INTO workshop_services (workshop_id, service_id, price_min, price_max, is_active)
                   VALUES ${rowPlaceholders}
                   ON DUPLICATE KEY UPDATE
                     price_min = VALUES(price_min),
                     price_max = VALUES(price_max),
                     is_active = VALUES(is_active),
                     updated_at = CURRENT_TIMESTAMP`,
                  values
                );
              }
            }
          }
        }
      }

      await this.invalidateExistingVerificationTokens(userId);

      const { plainToken, hashedToken, expiresAt } = this.generateVerificationArtifacts();
      await this.storeVerificationToken(userId, hashedToken, expiresAt);

      await this.emailService.sendVerificationEmail(email, plainToken);

      return {
        userId,
        email,
        role,
        requiresVerification: true
      };
    } catch (error) {
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  async login({ email, password, ipAddress, userAgent }) {
    try {
      const user = await this.userRepository.findByEmail(email);

      if (!user) {
        throw new Error('Invalid email or password');
      }

      if (user.lockout_until && new Date(user.lockout_until) <= new Date()) {
        await this.userRepository.resetFailedLoginMetadata(user.id);
        user.lockout_until = null;
      }

      if (this.isAccountLocked(user)) {
        const unlockTime = new Date(user.lockout_until).toLocaleString();
        throw new Error(`Account locked due to multiple failed attempts. Try again after ${unlockTime}`);
      }

      if (!user.is_active) {
        throw new Error('Account is deactivated. Please contact support.');
      }

      if (!user.is_verified) {
        throw new Error('Please verify your email before logging in. You can request a new verification email from the login screen.');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        await this.handleFailedLogin(user, ipAddress, userAgent);
        throw new Error('Invalid email or password');
      }

      await this.userRepository.resetFailedLoginMetadata(user.id);

      const token = this.generateJWT(user);
      const isFirstLogin = !user.last_login_at;
      const loginCount = (user.login_count || 0) + 1;
      const lastLoginAt = new Date();

      await this.userRepository.updateLoginMetadata(user.id, {
        last_login_at: lastLoginAt,
        last_login_ip: ipAddress || null,
        login_count: loginCount
      });

      await this.userRepository.logLoginActivity({
        user_id: user.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        status: 'success',
        is_first_login: isFirstLogin
      });

      const withProfile = await this.userRepository.findWithProfile(user.id);

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          is_verified: user.is_verified,
          full_name: withProfile?.full_name || null
        },
        session: {
          first_login: isFirstLogin,
          onboarding_required: isFirstLogin,
          login_count: loginCount,
          last_login_at: lastLoginAt
        }
      };
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  async verifyEmail(token) {
    return await database.transaction(async (connection) => {
      const hashedToken = this.hashVerificationToken(token);
      const [tokens] = await connection.query(
        'SELECT user_id, expires_at, used FROM email_verification_tokens WHERE token = ?',
        [hashedToken]
      );

      if (tokens.length === 0) {
        throw new Error('Invalid verification token');
      }

      const tokenData = tokens[0];

      // If token is already used, check if the account is already verified
      // This handles cases where user clicks link twice or React StrictMode causes double verification
      if (tokenData.used) {
        const [users] = await connection.query(
          'SELECT is_verified FROM users WHERE id = ?',
          [tokenData.user_id]
        );
        
        if (users.length > 0 && users[0].is_verified) {
          // Account is already verified, return success instead of error
          return { alreadyVerified: true };
        }
        
        throw new Error('Token already used');
      }

      if (new Date() > new Date(tokenData.expires_at)) {
        throw new Error('Token expired');
      }

      await connection.query(
        `UPDATE users 
         SET is_verified = TRUE, 
             is_active = TRUE,
             verified_at = NOW(),
             failed_login_attempts = 0,
             lockout_until = NULL
         WHERE id = ?`,
        [tokenData.user_id]
      );

      await connection.query(
        'UPDATE email_verification_tokens SET used = TRUE WHERE token = ?',
        [hashedToken]
      );

      return { alreadyVerified: false };
    });
  }

  async getCurrentUser(userId) {
    try {
      const user = await this.userRepository.findWithProfile(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      throw new Error(`Failed to get current user: ${error.message}`);
    }
  }

  async resendVerificationEmail(email) {
    try {
      const user = await this.userRepository.findByEmail(email);

      if (!user) {
        throw new Error('Account not found for the provided email.');
      }

      if (user.is_verified) {
        throw new Error('Account is already verified.');
      }

      await this.invalidateExistingVerificationTokens(user.id);

      const { plainToken, hashedToken, expiresAt } = this.generateVerificationArtifacts();
      await this.storeVerificationToken(user.id, hashedToken, expiresAt);

      await this.emailService.sendVerificationEmail(email, plainToken);

      return true;
    } catch (error) {
      throw new Error(`Unable to resend verification email: ${error.message}`);
    }
  }

  async changePassword(userId, currentPassword, newPassword) {
    try {
      const user = await this.userRepository.findById(userId);

      if (!user) {
        throw new Error('User not found');
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

      if (!isPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      this.validatePasswordStrength(newPassword);
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.userRepository.updatePassword(userId, hashedPassword);

      return true;
    } catch (error) {
      throw new Error(`Failed to change password: ${error.message}`);
    }
  }

  async deactivateUser(userId) {
    try {
      await this.userRepository.deactivateUser(userId);
      return true;
    } catch (error) {
      throw new Error(`Failed to deactivate user: ${error.message}`);
    }
  }

  async activateUser(userId) {
    try {
      await this.userRepository.activateUser(userId);
      return true;
    } catch (error) {
      throw new Error(`Failed to activate user: ${error.message}`);
    }
  }

  generateJWT(user) {
    return jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
  }

  generateVerificationArtifacts() {
    const plainToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = this.hashVerificationToken(plainToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return { plainToken, hashedToken, expiresAt };
  }

  hashVerificationToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async storeVerificationToken(userId, hashedToken, expiresAt) {
    await database.query(
      'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, hashedToken, expiresAt]
    );
  }

  async invalidateExistingVerificationTokens(userId) {
    await database.query(
      'UPDATE email_verification_tokens SET used = TRUE WHERE user_id = ? AND used = FALSE',
      [userId]
    );
  }

  verifyJWT(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  extractProfileData(data, files = {}) {
    const profileData = {
      full_name: data.full_name,
      phone_number: data.phone_number,
      address: data.address,
      city: data.city,
      country: data.country,
      cnic: data.cnic
    };

    // CNIC image is required; take from file upload
    if (files.cnic_image) {
      profileData.cnic_image = files.cnic_image.cloudinaryUrl || files.cnic_image.path;
    }

    return profileData;
  }

  ensureWorkshopData(data) {
    const requiredFields = [
      'business_name',
      'workshop_ntn',
      'workshop_address',
      'workshop_city',
      'workshop_country'
    ];

    requiredFields.forEach(field => {
      if (!data[field]) {
        throw new Error(`Missing workshop credential: ${field.replace(/_/g, ' ')}`);
      }
    });

    const lat = data.workshop_latitude != null && data.workshop_latitude !== ''
      ? parseFloat(data.workshop_latitude)
      : NaN;
    const lng = data.workshop_longitude != null && data.workshop_longitude !== ''
      ? parseFloat(data.workshop_longitude)
      : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error('Missing workshop credential: workshop location (latitude/longitude)');
    }
  }

  isAccountLocked(user) {
    if (!user.lockout_until) {
      return false;
    }
    return new Date(user.lockout_until) > new Date();
  }

  async handleFailedLogin(user, ipAddress, userAgent) {
    const attempts = (user.failed_login_attempts || 0) + 1;
    let lockoutUntil = user.lockout_until;
    let updatedAttempts = attempts;

    if (attempts >= this.MAX_FAILED_ATTEMPTS) {
      lockoutUntil = new Date(Date.now() + this.LOCKOUT_DURATION_MINUTES * 60 * 1000);
      updatedAttempts = 0;
    }

    await this.userRepository.updateFailedLoginMetadata(user.id, updatedAttempts, lockoutUntil);
    await this.userRepository.logLoginActivity({
      user_id: user.id,
      ip_address: ipAddress,
      user_agent: userAgent,
      status: 'failed'
    });
  }

  validatePasswordStrength(password) {
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!strongPasswordRegex.test(password)) {
      throw new Error('Password must be at least 8 characters and include uppercase, lowercase, and a number.');
    }
  }
}

module.exports = new UserService();