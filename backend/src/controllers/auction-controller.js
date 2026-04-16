const AuctionService = require('../services/auction-service');
const auctionScheduler = require('../jobs/auction-scheduler');

class AuctionController {
  constructor() {
    this.auctionService = AuctionService;
  }

  async listAuctions(req, res) {
    try {
      const { search, min_price, max_price, sort, page, limit } = req.query || {};
      const userId = req.user ? req.user.userId : null;
      const userRole = req.user ? req.user.role : null;
      const result = await this.auctionService.listAuctions(
        { search, min_price, max_price },
        sort,
        page,
        limit,
        userId,
        userRole
      );
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to list auctions.'
      });
    }
  }

  async getAuctionDetail(req, res) {
    try {
      const { auctionId } = req.params;
      const userId = req.user ? req.user.userId : null;
      const id = parseInt(auctionId, 10);
      if (isNaN(id) || id < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      const auction = await this.auctionService.getAuctionDetail(id, userId);
      if (!auction) {
        return res.status(404).json({ success: false, message: 'Auction not found or no longer active.' });
      }
      return res.json({ success: true, data: auction });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get auction detail.'
      });
    }
  }

  async addToWatchlist(req, res) {
    try {
      const userId = req.user.userId;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      await this.auctionService.addToWatchlist(userId, auctionId);
      return res.json({ success: true, message: 'Added to watchlist.' });
    } catch (error) {
      const status = error.message === 'Auction not found.' ? 404 : error.message === 'Auction is not active.' ? 400 : 500;
      return res.status(status).json({ success: false, message: error.message || 'Failed to add to watchlist.' });
    }
  }

  async removeFromWatchlist(req, res) {
    try {
      const userId = req.user.userId;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      await this.auctionService.removeFromWatchlist(userId, auctionId);
      return res.json({ success: true, message: 'Removed from watchlist.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to remove from watchlist.' });
    }
  }

  async getUserWatchlist(req, res) {
    try {
      const userId = req.user.userId;
      const result = await this.auctionService.getUserWatchlist(userId);
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to get watchlist.' });
    }
  }
  
  async getMyAuctions(req, res) {
    try {
      const userId = req.user.userId;
      const { search, status, sort } = req.query || {};
      const result = await this.auctionService.getMyAuctions(userId, { search, status, sort });
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to get my auctions.' });
    }
  }

  async getMyAuctionDetail(req, res) {
    try {
      const userId = req.user.userId;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      const auction = await this.auctionService.getMyAuctionDetail(auctionId, userId);
      if (!auction) {
        return res.status(404).json({ success: false, message: 'Auction not found or you are not the seller.' });
      }
      return res.json({ success: true, data: auction });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to get auction detail.' });
    }
  }

  async getMyBids(req, res) {
    try {
      const userId = req.user.userId;
      const result = await this.auctionService.getMyBids(userId);
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to get my bids.' });
    }
  }

  async placeBid(req, res) {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      const amount = req.body?.amount;
      const result = await this.auctionService.placeBid(auctionId, userId, userRole, amount);
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      const status = error.message === 'Auction not found.' ? 404 :
        error.message === 'Auction is not active.' || error.message === 'Auction has ended.' ? 400 :
        error.message === 'You cannot bid on your own auction.' ? 403 :
        error.message.includes('Bid must be at least') ? 400 : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to place bid.'
      });
    }
  }

  async getEligibility(req, res) {
    try {
      const { vehicleId } = req.params;
      const userId = req.user.userId;
      const vehicleIdNum = parseInt(vehicleId, 10);
      if (isNaN(vehicleIdNum) || vehicleIdNum < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid vehicle ID.'
        });
      }
      const result = await this.auctionService.checkEligibility(vehicleIdNum, userId);
      return res.json({
        success: true,
        data: {
          eligible: result.eligible,
          message: result.message,
          missingItems: result.missingItems || []
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check eligibility.'
      });
    }
  }

  /**
   * Returns Cloudinary config for client-side direct upload (unsigned preset).
   * Create an unsigned upload preset in Cloudinary Dashboard (Settings > Upload) and set CLOUDINARY_UPLOAD_PRESET in .env.
   */
  async getUploadConfig(req, res) {
    try {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
      if (!cloudName || !uploadPreset) {
        return res.status(503).json({
          success: false,
          message: 'Upload configuration is not available. Please set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET (unsigned) on the server.'
        });
      }
      return res.json({
        success: true,
        data: { cloudName, uploadPreset }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get upload config.'
      });
    }
  }

  async createAuction(req, res) {
    try {
      const userId = req.user.userId;
      const body = req.body || {};
      const photoUrls = Array.isArray(body.photo_urls) ? body.photo_urls : [];
      const data = {
        vehicle_id: body.vehicle_id,
        description: body.description,
        reserve_price: body.reserve_price,
        starting_bid: body.starting_bid,
        duration_days: body.duration_days,
        start_immediate: body.start_immediate,
        start_at: body.start_at,
        featured: body.featured,
        terms_accepted: body.terms_accepted,
        status: body.status,
        odometer_km: body.odometer_km
      };
      const auction = await this.auctionService.createAuction(data, userId, photoUrls);
      if (auction.status === 'scheduled') {
        auctionScheduler.ensureRunning().catch((err) => console.error('[AuctionScheduler] ensureRunning after create:', err.message));
      }
      return res.status(201).json({
        success: true,
        message: auction.status === 'draft' ? 'Auction draft saved.' : 'Auction listing created successfully.',
        data: auction
      });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : error.message.includes('only create') ? 403 : 400;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to create auction.'
      });
    }
  }

  async updateAuction(req, res) {
    try {
      const userId = req.user.userId;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      const body = req.body || {};
      const photoUrls = Array.isArray(body.photo_urls) ? body.photo_urls : [];
      const data = {
        description: body.description,
        reserve_price: body.reserve_price,
        starting_bid: body.starting_bid,
        duration_days: body.duration_days,
        start_immediate: body.start_immediate,
        start_at: body.start_at,
        featured: body.featured,
        terms_accepted: body.terms_accepted,
        status: body.status,
        odometer_km: body.odometer_km
      };
      const auction = await this.auctionService.updateAuction(auctionId, userId, data, photoUrls);
      if (auction.status === 'scheduled') {
        auctionScheduler.ensureRunning().catch((err) => console.error('[AuctionScheduler] ensureRunning after publish draft:', err.message));
      }
      return res.json({
        success: true,
        message: auction.status === 'draft' ? 'Draft saved.' : 'Auction published successfully.',
        data: auction
      });
    } catch (error) {
      const status = error.message === 'Auction not found.' || error.message.includes('Only draft') ? 404 :
        error.message.includes('not found') ? 404 : 400;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to update auction.'
      });
    }
  }

  async deleteDraft(req, res) {
    try {
      const userId = req.user.userId;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      await this.auctionService.deleteDraft(auctionId, userId);
      return res.json({ success: true, message: 'Draft deleted.' });
    } catch (error) {
      const status = error.message === 'Auction not found.' ? 404 :
        error.message.includes('Only draft') ? 400 : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to delete draft.'
      });
    }
  }
}

module.exports = new AuctionController();
