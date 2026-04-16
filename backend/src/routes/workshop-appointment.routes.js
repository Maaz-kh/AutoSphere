const express = require('express');
const AuthMiddleware = require('../middleware/auth-middleware');
const Validator = require('../middleware/validator');
const WorkshopAppointmentController = require('../controllers/workshop-appointment-controller');

const router = express.Router();
const auth = AuthMiddleware;
const validator = Validator;
const controller = WorkshopAppointmentController;

router.use(auth.authenticate());

// Vehicle owner endpoints
router.post(
  '/owner/appointments',
  auth.authorize('vehicle_owner', 'admin'),
  validator.ownerAppointmentCreateRules(),
  controller.createOwnerAppointment.bind(controller)
);
router.get(
  '/owner/appointments',
  auth.authorize('vehicle_owner', 'admin'),
  controller.listOwnerAppointments.bind(controller)
);
router.patch(
  '/owner/appointments/:id/cancel',
  auth.authorize('vehicle_owner', 'admin'),
  controller.cancelOwnerAppointment.bind(controller)
);
router.post(
  '/owner/appointments/:id/review',
  auth.authorize('vehicle_owner', 'admin'),
  validator.ownerReviewCreateRules(),
  controller.createOwnerReview.bind(controller)
);

// Workshop endpoints
router.get(
  '/workshop/appointments',
  auth.authorize('workshop', 'admin'),
  controller.listWorkshopAppointments.bind(controller)
);
router.patch(
  '/workshop/appointments/:id',
  auth.authorize('workshop', 'admin'),
  validator.workshopAppointmentUpdateRules(),
  controller.updateWorkshopAppointment.bind(controller)
);
router.patch(
  '/workshop/appointments/:id/complete',
  auth.authorize('workshop', 'admin'),
  controller.completeWorkshopAppointment.bind(controller)
);
router.patch(
  '/workshop/appointments/:id/cancel',
  auth.authorize('workshop', 'admin'),
  controller.cancelWorkshopAppointment.bind(controller)
);

module.exports = router;

