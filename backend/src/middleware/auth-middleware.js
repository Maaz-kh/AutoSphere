const UserService = require('../services/user-service');
const UserRepository = require('../repositories/user-repository');

class AuthMiddleware {
  constructor() {
    this.userService = UserService;
    this.userRepository = UserRepository;
  }

  authenticate() {
    return async (req, res, next) => {
      try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
          return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
          });
        }

        const decoded = this.userService.verifyJWT(token);
        
        const user = await this.userRepository.findById(decoded.userId);

        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'Invalid token. User not found.'
          });
        }

        if (!user.is_active) {
          return res.status(401).json({
            success: false,
            message: 'Account is deactivated.'
          });
        }

        req.user = {
          userId: decoded.userId,
          email: user.email,
          role: user.role
        };

        next();
      } catch (error) {
        if (error.message === 'Invalid or expired token') {
          return res.status(401).json({
            success: false,
            message: error.message
          });
        }
        
        res.status(500).json({
          success: false,
          message: 'Internal server error.',
          error: error.message
        });
      }
    };
  }

  authorize(...allowedRoles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized. Please authenticate.'
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. Insufficient permissions.'
        });
      }

      next();
    };
  }

  optionalAuth() {
    return async (req, res, next) => {
      try {
        const token = req.headers.authorization?.split(' ')[1];

        if (token) {
          try {
            const decoded = this.userService.verifyJWT(token);
            const user = await this.userRepository.findById(decoded.userId);

            if (user && user.is_active) {
              req.user = {
                userId: decoded.userId,
                email: user.email,
                role: user.role
              };
            }
          } catch (error) {
            // Invalid token, continue without authentication
          }
        }

        next();
      } catch (error) {
        next();
      }
    };
  }
}

module.exports = new AuthMiddleware();