const express = require("express");
const VehicleController = require("../controllers/vehicle-controller");
const AuthMiddleware = require("../middleware/auth-middleware");
const Validator = require("../middleware/validator");
const FileUploadHandler = require("../utils/fileupload-handler");

const router = express.Router();
const vehicleController = VehicleController;
const authMiddleware = AuthMiddleware;
const validator = Validator;
const fileUploadHandler = FileUploadHandler;

// All vehicle routes require authentication
router.use(authMiddleware.authenticate());

// Vehicle registration (vehicle_owner/admin only)
router.post(
  "/",
  authMiddleware.authorize("vehicle_owner", "admin"),
  fileUploadHandler.uploadVehicleRegistrationFiles(),
  validator.vehicleRegistrationRules(),
  vehicleController.registerVehicle.bind(vehicleController)
);

// Get user's vehicles
router.get("/", vehicleController.getUserVehicles.bind(vehicleController));

// Vehicle statistics
router.get("/stats", vehicleController.getVehicleStats.bind(vehicleController));

// Pending transfer requests
router.get(
  "/transfers/pending",
  vehicleController.getPendingTransfers.bind(vehicleController)
);

// Verify vehicle by chassis number (must be before /:vehicleId route)
router.get(
  "/verify/:chassisNumber",
  vehicleController.verifyVehicleByChassisNumber.bind(vehicleController)
);

// Service history by chassis (vehicle_owner/admin)
router.get(
  "/:chassisNumber/service-records",
  vehicleController.getServiceRecordsByChassis.bind(vehicleController)
);

// Vehicle by ID
router.get(
  "/:vehicleId",
  vehicleController.getVehicleById.bind(vehicleController)
);

// Update vehicle
router.put(
  "/:vehicleId",
  validator.vehicleUpdateRules(),
  vehicleController.updateVehicle.bind(vehicleController)
);

// Delete vehicle
router.delete(
  "/:vehicleId",
  vehicleController.deleteVehicle.bind(vehicleController)
);

// Vehicle history
router.get(
  "/:vehicleId/history",
  vehicleController.getVehicleHistory.bind(vehicleController)
);

// Upload document
router.post(
  "/:vehicleId/documents",
  fileUploadHandler.uploadDocument(),
  vehicleController.uploadDocument.bind(vehicleController)
);

// Get vehicle documents
router.get(
  "/:vehicleId/documents",
  vehicleController.getVehicleDocuments.bind(vehicleController)
);

// Initiate ownership transfer (vehicle_owner/admin only)
router.post(
  "/:vehicleId/transfer",
  authMiddleware.authorize("vehicle_owner", "admin"),
  validator.vehicleTransferInitiateRules(),
  vehicleController.initiateTransfer.bind(vehicleController)
);

// Accept transfer request
router.post(
  "/:vehicleId/transfer/accept",
  vehicleController.acceptTransfer.bind(vehicleController)
);

// Reject transfer request
router.post(
  "/:vehicleId/transfer/reject",
  vehicleController.rejectTransfer.bind(vehicleController)
);

module.exports = router;
