const express = require('express');
const WorkshopController = require('../controllers/workshop-controller');
const AuthMiddleware = require('../middleware/auth-middleware');
const Validator = require('../middleware/validator');

const router = express.Router();
const workshopController = WorkshopController;
const authMiddleware = AuthMiddleware;
const validator = Validator;

// All workshop routes require authentication and workshop role
router.use(authMiddleware.authenticate());
router.use(authMiddleware.authorize('workshop', 'admin'));

// Get current workshop profile (owner + workshop details)
router.get('/profile', workshopController.getWorkshopProfile.bind(workshopController));

// Services catalog and workshop offered services (CRUD)
router.get('/services/catalog', workshopController.listServicesCatalog.bind(workshopController));
router.get('/services', workshopController.listMyServices.bind(workshopController));
router.post(
  '/services',
  validator.workshopServicesAddRules(),
  workshopController.addMyServices.bind(workshopController)
);
router.patch(
  '/services/:id',
  validator.workshopServicesUpdateRules(),
  workshopController.updateMyService.bind(workshopController)
);
router.delete('/services/:id', workshopController.removeMyService.bind(workshopController));

// Get all parts for the workshop
router.get('/parts', workshopController.getParts.bind(workshopController));

// Create a new part
router.post(
  '/parts',
  validator.partRules(),
  workshopController.createPart.bind(workshopController)
);

// Get part by ID
router.get(
  '/parts/:partId',
  workshopController.getPartById.bind(workshopController)
);

// Update part
router.put(
  '/parts/:partId',
  validator.partUpdateRules(),
  workshopController.updatePart.bind(workshopController)
);

// Delete part
router.delete(
  '/parts/:partId',
  workshopController.deletePart.bind(workshopController)
);

// Track a service record (called after blockchain submission)
router.post(
  '/service-records/track',
  workshopController.trackServiceRecord.bind(workshopController)
);

// Get service records for the workshop (with filters)
router.get(
  '/service-records',
  workshopController.getServiceRecords.bind(workshopController)
);

module.exports = router;

