const BaseRepository = require('./base-repository');

class UserRepository extends BaseRepository {
  constructor() {
    super('users');
  }

  async findByEmail(email) {
    try {
      const results = await this.db.query(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding user by email: ${error.message}`);
    }
  }

  async findWithProfile(userId) {
    try {
      const results = await this.db.query(
        `SELECT u.*,
                p.full_name,
                p.phone_number,
                p.address,
                p.city,
                p.country,
                p.profile_image,
                p.cnic,
                p.cnic_image,
                w.name AS business_name,
                w.ntn AS workshop_ntn,
                w.address AS workshop_address,
                w.city AS workshop_city,
                w.country AS workshop_country,
                w.latitude AS workshop_latitude,
                w.longitude AS workshop_longitude,
                w.is_verified AS workshop_is_verified
         FROM users u
         LEFT JOIN user_profiles p ON u.id = p.user_id
         LEFT JOIN workshops w ON u.id = w.user_id
         WHERE u.id = ?`,
        [userId]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding user with profile: ${error.message}`);
    }
  }

  async createWithProfile(userData, profileData = {}) {
    return await this.db.transaction(async (connection) => {
      const [userResult] = await connection.query(
        `INSERT INTO users (email, password, role, is_active, accepted_terms_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          userData.email,
          userData.password,
          userData.role,
          userData.is_active ?? false,
          userData.accepted_terms_at || null
        ]
      );

      const userId = userResult.insertId;

      const profileFields = ['user_id'];
      const placeholders = ['?'];
      const values = [userId];

      Object.entries(profileData).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          profileFields.push(key);
          placeholders.push('?');
          values.push(value);
        }
      });

      await connection.query(
        `INSERT INTO user_profiles (${profileFields.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values
      );

      return userId;
    });
  }

  async updateVerificationStatus(userId, isVerified) {
    try {
      return await this.update(userId, { is_verified: isVerified });
    } catch (error) {
      throw new Error(`Error updating verification status: ${error.message}`);
    }
  }

  async updatePassword(userId, newPassword) {
    try {
      return await this.update(userId, { password: newPassword });
    } catch (error) {
      throw new Error(`Error updating password: ${error.message}`);
    }
  }

  async deactivateUser(userId) {
    try {
      return await this.update(userId, { is_active: false });
    } catch (error) {
      throw new Error(`Error deactivating user: ${error.message}`);
    }
  }

  async activateUser(userId) {
    try {
      return await this.update(userId, { is_active: true });
    } catch (error) {
      throw new Error(`Error activating user: ${error.message}`);
    }
  }

  async findByRole(role) {
    try {
      return await this.findAll({ role, is_active: true });
    } catch (error) {
      throw new Error(`Error finding users by role: ${error.message}`);
    }
  }

  async updateLoginMetadata(userId, loginData) {
    try {
      const { last_login_at, last_login_ip, login_count } = loginData;
      return await this.update(userId, {
        last_login_at,
        last_login_ip,
        login_count
      });
    } catch (error) {
      throw new Error(`Error updating login metadata: ${error.message}`);
    }
  }

  async logLoginActivity(activity) {
    try {
      const { user_id, ip_address, user_agent, status, is_first_login } = activity;
      return await this.db.query(
        `INSERT INTO login_activity (user_id, ip_address, user_agent, status, is_first_login) VALUES (?, ?, ?, ?, ?)`,
        [user_id, ip_address || null, user_agent || null, status || 'success', is_first_login ? 1 : 0]
      );
    } catch (error) {
      throw new Error(`Error logging login activity: ${error.message}`);
    }
  }

  async updateFailedLoginMetadata(userId, failedAttempts, lockoutUntil) {
    try {
      return await this.update(userId, {
        failed_login_attempts: failedAttempts,
        lockout_until: lockoutUntil
      });
    } catch (error) {
      throw new Error(`Error updating failed login metadata: ${error.message}`);
    }
  }

  async resetFailedLoginMetadata(userId) {
    try {
      return await this.update(userId, {
        failed_login_attempts: 0,
        lockout_until: null
      });
    } catch (error) {
      throw new Error(`Error resetting failed login metadata: ${error.message}`);
    }
  }
}

module.exports = new UserRepository();