const ProfileService = require('../services/profile-service');

class ProfileController {
  constructor() {
    this.profileService = ProfileService;
  }

  async getProfile(req, res) {
    try {
      const profile = await this.profileService.getProfile(req.user.userId);

      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateProfile(req, res) {
    try {
      const profile = await this.profileService.updateProfile(req.user.userId, req.body);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: profile
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateProfileImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }

      const imagePath = req.file.cloudinaryUrl || req.file.path;
      const result = await this.profileService.updateProfileImage(req.user.userId, imagePath);

      res.json({
        success: true,
        message: 'Profile image updated successfully',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getProfileById(req, res) {
    try {
      const { userId } = req.params;
      const profile = await this.profileService.getProfileById(
        parseInt(userId),
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      const status = error.message === 'Access denied' ? 403 : 
                     error.message === 'Profile not found' ? 404 : 500;
      
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async getProfileCompletion(req, res) {
    try {
      const percentage = await this.profileService.getProfileCompletionPercentage(req.user.userId);

      res.json({
        success: true,
        data: {
          completion_percentage: percentage,
          is_complete: percentage === 100
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new ProfileController();