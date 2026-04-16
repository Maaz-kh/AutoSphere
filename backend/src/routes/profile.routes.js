const express = require('express');
const ProfileController = require('../controllers/profile-controller');
const AuthMiddleware = require('../middleware/auth-middleware');
const Validator = require('../middleware/validator');
const FileUploadHandler = require('../utils/fileupload-handler');

const router = express.Router();
const profileController = ProfileController;
const authMiddleware = AuthMiddleware;
const validator = Validator;
const fileUploadHandler = FileUploadHandler;

// All profile routes require authentication
router.use(authMiddleware.authenticate());

router.get(
  '/',
  profileController.getProfile.bind(profileController)
);

router.put(
  '/',
  validator.profileUpdateRules(),
  profileController.updateProfile.bind(profileController)
);

router.post(
  '/image',
  fileUploadHandler.uploadProfileImage(),
  profileController.updateProfileImage.bind(profileController)
);

router.get(
  '/completion',
  profileController.getProfileCompletion.bind(profileController)
);

// Admin only route
router.get(
  '/:userId',
  authMiddleware.authorize('admin'),
  profileController.getProfileById.bind(profileController)
);

module.exports = router;

