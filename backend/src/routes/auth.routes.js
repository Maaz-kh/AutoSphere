const express = require('express');
const AuthController = require('../controllers/auth-controller');
const AuthMiddleware = require('../middleware/auth-middleware');
const Validator = require('../middleware/validator');
const FileUploadHandler = require('../utils/fileupload-handler');

const router = express.Router();
const authController = AuthController;
const authMiddleware = AuthMiddleware;
const validator = Validator;
const fileUploadHandler = FileUploadHandler;

// Public routes
router.post(
  '/register',
  fileUploadHandler.uploadCNICImage(),
  validator.registerRules(),
  authController.register.bind(authController)
);

router.post(
  '/login',
  validator.loginRules(),
  authController.login.bind(authController)
);

router.get(
  '/verify-email/:token',
  authController.verifyEmail.bind(authController)
);

router.post(
  '/resend-verification',
  validator.resendVerificationRules(),
  authController.resendVerification.bind(authController)
);

// Protected routes
router.get(
  '/me',
  authMiddleware.authenticate(),
  authController.getCurrentUser.bind(authController)
);

router.post(
  '/change-password',
  authMiddleware.authenticate(),
  authController.changePassword.bind(authController)
);

module.exports = router;

