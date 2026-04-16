const UserService = require('../services/user-service');

class AuthController {
  constructor() {
    this.userService = UserService;
  }

  // Function to register a user.
  async register(req, res) {
    try {
      const files = req.files || {};
      if (req.file) {
        files.cnic_image = req.file;
      }

      if (!files.cnic_image) {
        return res.status(400).json({
          success: false,
          message: 'CNIC image is required for registration'
        });
      }

      const result = await this.userService.register(req.body, files);

      res.status(201).json({
        success: true,
        message: 'User registered successfully. Please verify your email.',
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Function to login a user.
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const result = await this.userService.login({
        email,
        password,
        ipAddress: req.headers['x-forwarded-for'] || req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: error.message
      });
    }
  }

  // Function to verify email
  async verifyEmail(req, res) {
    try {
      const { token } = req.params;
      const result = await this.userService.verifyEmail(token);

      // If account was already verified, return appropriate message
      if (result && result.alreadyVerified) {
        return res.json({
          success: true,
          message: 'Email has already been verified. You can log in to your account.',
          alreadyVerified: true
        });
      }

      res.json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async resendVerification(req, res) {
    try {
      const { email } = req.body;
      await this.userService.resendVerificationEmail(email);

      res.json({
        success: true,
        message: 'Verification email resent successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getCurrentUser(req, res) {
    try {
      const user = await this.userService.getCurrentUser(req.user.userId);

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      await this.userService.changePassword(req.user.userId, currentPassword, newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new AuthController();