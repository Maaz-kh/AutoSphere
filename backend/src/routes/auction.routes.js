const express = require('express');
const AuctionController = require('../controllers/auction-controller');
const TransactionController = require('../controllers/transaction-controller');
const MessageController = require('../controllers/message-controller');
const AuthMiddleware = require('../middleware/auth-middleware');
const Validator = require('../middleware/validator');

const router = express.Router();
const auctionController = AuctionController;
const transactionController = TransactionController;
const messageController = MessageController;
const authMiddleware = AuthMiddleware;
const validator = Validator;

// ---- Public / optional auth (browse) ----
router.get(
  '/',
  authMiddleware.optionalAuth(),
  auctionController.listAuctions.bind(auctionController)
);

// Named routes before /:auctionId so they are not parsed as id
router.get(
  '/watchlist',
  authMiddleware.authenticate(),
  authMiddleware.authorize('buyer', 'vehicle_owner', 'admin'),
  auctionController.getUserWatchlist.bind(auctionController)
);

router.get(
  '/my-bids',
  authMiddleware.authenticate(),
  authMiddleware.authorize('buyer', 'vehicle_owner'),
  auctionController.getMyBids.bind(auctionController)
);

router.get(
  '/eligibility/:vehicleId',
  authMiddleware.authenticate(),
  authMiddleware.authorize('vehicle_owner', 'admin'),
  auctionController.getEligibility.bind(auctionController)
);

// My Auctions (seller) - must be before /:auctionId
router.get(
  '/my-auctions',
  authMiddleware.authenticate(),
  authMiddleware.authorize('vehicle_owner', 'admin'),
  auctionController.getMyAuctions.bind(auctionController)
);
router.get(
  '/my-auctions/:auctionId',
  authMiddleware.authenticate(),
  authMiddleware.authorize('vehicle_owner', 'admin'),
  auctionController.getMyAuctionDetail.bind(auctionController)
);
router.patch(
  '/my-auctions/:auctionId',
  authMiddleware.authenticate(),
  authMiddleware.authorize('vehicle_owner', 'admin'),
  auctionController.updateAuction.bind(auctionController)
);
router.delete(
  '/my-auctions/:auctionId',
  authMiddleware.authenticate(),
  authMiddleware.authorize('vehicle_owner', 'admin'),
  auctionController.deleteDraft.bind(auctionController)
);

// Must be before /:auctionId or "upload-config" is matched as auctionId
router.get(
  '/upload-config',
  authMiddleware.authenticate(),
  authMiddleware.authorize('vehicle_owner', 'admin'),
  auctionController.getUploadConfig.bind(auctionController)
);

router.get(
  '/:auctionId',
  authMiddleware.optionalAuth(),
  auctionController.getAuctionDetail.bind(auctionController)
);

// ---- Authenticated: watchlist add/remove ----
router.post(
  '/:auctionId/watchlist',
  authMiddleware.authenticate(),
  authMiddleware.authorize('buyer', 'vehicle_owner', 'admin'),
  auctionController.addToWatchlist.bind(auctionController)
);

router.delete(
  '/:auctionId/watchlist',
  authMiddleware.authenticate(),
  authMiddleware.authorize('buyer', 'vehicle_owner', 'admin'),
  auctionController.removeFromWatchlist.bind(auctionController)
);

// ---- Authenticated: place bid (buyer, vehicle_owner) ----
router.post(
  '/:auctionId/bids',
  authMiddleware.authenticate(),
  authMiddleware.authorize('buyer', 'vehicle_owner'),
  validator.bidPlaceRules(),
  auctionController.placeBid.bind(auctionController)
);

// ---- UC-EA-05: Transaction (Phase 1 & 2) ----
router.get(
  '/:auctionId/transaction',
  authMiddleware.authenticate(),
  authMiddleware.authorize('buyer', 'vehicle_owner', 'admin'),
  transactionController.getTransaction.bind(transactionController)
);
router.post(
  '/:auctionId/accept-bid',
  authMiddleware.authenticate(),
  authMiddleware.authorize('vehicle_owner', 'admin'),
  transactionController.acceptBid.bind(transactionController)
);
router.post(
  '/:auctionId/decline-bid',
  authMiddleware.authenticate(),
  authMiddleware.authorize('vehicle_owner', 'admin'),
  transactionController.declineBid.bind(transactionController)
);

router.get(
  '/:auctionId/messages',
  authMiddleware.authenticate(),
  authMiddleware.authorize('buyer', 'vehicle_owner', 'admin'),
  messageController.list.bind(messageController)
);
router.post(
  '/:auctionId/messages',
  authMiddleware.authenticate(),
  authMiddleware.authorize('buyer', 'vehicle_owner', 'admin'),
  messageController.send.bind(messageController)
);

router.patch(
  '/:auctionId/transaction/checklist',
  authMiddleware.authenticate(),
  authMiddleware.authorize('buyer', 'vehicle_owner', 'admin'),
  transactionController.updateChecklist.bind(transactionController)
);
router.post(
  '/:auctionId/transaction/confirm-complete',
  authMiddleware.authenticate(),
  authMiddleware.authorize('buyer', 'vehicle_owner', 'admin'),
  transactionController.confirmComplete.bind(transactionController)
);

// ---- Authenticated: seller only (create) ----
// Direct upload: client uploads images to Cloudinary, then sends photo_urls in JSON (no multer)
router.post(
  '/',
  authMiddleware.authenticate(),
  authMiddleware.authorize('vehicle_owner', 'admin'),
  validator.auctionCreateRules(),
  auctionController.createAuction.bind(auctionController)
);

module.exports = router;
