const AuctionRepository = require('../repositories/auction-repository');
const TransactionRepository = require('../repositories/transaction-repository');
const VehicleRepository = require('../repositories/vehicle-repository');
const UserRepository = require('../repositories/user-repository');
const EmailService = require('./email-service');
const database = require('../config/database');

const AUCTION_PHOTOS_MIN = 5;
const AUCTION_PHOTOS_MAX = 10;
const DURATION_DAYS_OPTIONS = [3, 5, 7, 10];
const MAX_ACTIVE_AUCTIONS_PER_SELLER = 5;
const LIST_PAGE_SIZE_DEFAULT = 20;
const LIST_PAGE_SIZE_MAX = 100;
const VALID_SORT = ['newest', 'ending_soon', 'lowest_bid', 'highest_bid', 'most_bids'];
const BID_INCREMENT_PKR = 5000;

class AuctionService {
  constructor() {
    this.auctionRepository = AuctionRepository;
    this.transactionRepository = TransactionRepository;
    this.vehicleRepository = VehicleRepository;
    this.userRepository = UserRepository;
    this.emailService = EmailService;
  }

  getMinimumNextBid(auction) {
    if (!auction) return null;
    const current = auction.current_high_bid != null ? parseFloat(auction.current_high_bid) : null;
    const starting = parseFloat(auction.starting_bid);
    if (current == null) return starting;
    return current + BID_INCREMENT_PKR;
  }

  /**
   * Check if a vehicle is eligible for auction listing (no verification flow for now).
   * Eligibility: vehicle exists, owned by user, is_active, has required docs (registration + images).
   */
  async checkEligibility(vehicleId, userId) {
    const vehicle = await this.vehicleRepository.findById(vehicleId);
    if (!vehicle) {
      return { eligible: false, message: 'Vehicle not found.', missingItems: [] };
    }
    if (vehicle.owner_id !== userId) {
      return { eligible: false, message: 'You can only create auctions for your own vehicles.', missingItems: [] };
    }
    if (!vehicle.is_active) {
      return { eligible: false, message: 'Vehicle is not active.', missingItems: [] };
    }
    const missingItems = [];
    if (!vehicle.registration_certificate_path) missingItems.push('Registration certificate');
    if (!vehicle.front_image_path) missingItems.push('Front image');
    if (!vehicle.back_image_path) missingItems.push('Back image');
    if (!vehicle.interior_image_path) missingItems.push('Interior image');
    if (missingItems.length > 0) {
      return {
        eligible: false,
        message: 'Vehicle is missing required documentation or images.',
        missingItems
      };
    }
    const activeAuction = await this.auctionRepository.findActiveByVehicleId(vehicleId);
    if (activeAuction) {
      return { eligible: false, message: 'This vehicle already has an active auction.', missingItems: [] };
    }
    const activeCount = await this.auctionRepository.countActiveBySeller(userId);
    if (activeCount >= MAX_ACTIVE_AUCTIONS_PER_SELLER) {
      return {
        eligible: false,
        message: `Maximum active auctions (${MAX_ACTIVE_AUCTIONS_PER_SELLER}) reached. Wait for current auctions to end.`,
        missingItems: []
      };
    }
    return { eligible: true, message: 'Vehicle is eligible for auction.', missingItems: [] };
  }

  /**
   * Create auction listing (draft or publish). Photos: 0–10 for draft; 5–10 to publish (see AUCTION_PHOTOS_*).
   */
  async createAuction(data, userId, photoUrls = []) {
    const {
      vehicle_id,
      description,
      reserve_price,
      starting_bid,
      duration_days,
      start_immediate,
      start_at,
      featured,
      terms_accepted,
      status,
      odometer_km: odometerKmInput
    } = data;

    const vehicle = await this.vehicleRepository.findById(vehicle_id);
    if (!vehicle) throw new Error('Vehicle not found.');
    if (vehicle.owner_id !== userId) throw new Error('You can only create auctions for your own vehicles.');
    if (!vehicle.is_active) throw new Error('Vehicle is not active.');

    const activeAuction = await this.auctionRepository.findActiveByVehicleId(vehicle_id);
    if (activeAuction) throw new Error('This vehicle already has an active auction.');

    const activeCount = await this.auctionRepository.countActiveBySeller(userId);
    if (activeCount >= MAX_ACTIVE_AUCTIONS_PER_SELLER) {
      throw new Error(`Maximum active auctions (${MAX_ACTIVE_AUCTIONS_PER_SELLER}) reached.`);
    }

    const isDraftCreate = status === 'draft';
    let reserve, startBid, duration, desc;
    if (isDraftCreate) {
      desc = (description || '').trim();
      reserve = parseFloat(reserve_price);
      startBid = parseFloat(starting_bid);
      duration = parseInt(duration_days, 10);
      if (isNaN(reserve) || reserve <= 0) reserve = 1;
      if (isNaN(startBid) || startBid <= 0) startBid = 1;
      if (!DURATION_DAYS_OPTIONS.includes(duration)) duration = 5;
    } else {
      if (!description || description.trim().length === 0) throw new Error('Description is required.');
      desc = description.trim();
      reserve = parseFloat(reserve_price);
      startBid = parseFloat(starting_bid);
      if (isNaN(reserve) || reserve <= 0) throw new Error('Reserve price must be a positive number.');
      if (isNaN(startBid) || startBid <= 0) throw new Error('Starting bid must be a positive number.');
      if (startBid > reserve) throw new Error('Starting bid cannot exceed reserve price.');
      duration = parseInt(duration_days, 10);
      if (!DURATION_DAYS_OPTIONS.includes(duration)) {
        throw new Error(`Duration must be one of: ${DURATION_DAYS_OPTIONS.join(', ')} days.`);
      }
      if (!terms_accepted) throw new Error('You must accept the auction terms and conditions to publish.');
    }

    const vehicleMileage = vehicle.mileage_km != null ? parseInt(vehicle.mileage_km, 10) : null;
    let odometerKm = null;
    if (odometerKmInput !== undefined && odometerKmInput !== null && odometerKmInput !== '') {
      odometerKm = parseInt(odometerKmInput, 10);
      if (Number.isNaN(odometerKm) || odometerKm < 0) {
        throw new Error('Odometer reading must be a non-negative number.');
      }
      if (vehicleMileage != null && odometerKm < vehicleMileage) {
        throw new Error(`Odometer reading cannot be less than vehicle registration reading (${vehicleMileage} km).`);
      }
    }
    if (isDraftCreate && vehicleMileage != null && odometerKm == null) {
      odometerKm = vehicleMileage;
    }

    const photoCount = Array.isArray(photoUrls) ? photoUrls.length : 0;
    const isDraft = status === 'draft';
    if (photoCount > AUCTION_PHOTOS_MAX) {
      throw new Error(`Maximum ${AUCTION_PHOTOS_MAX} photos allowed.`);
    }
    if (!isDraft && (photoCount < AUCTION_PHOTOS_MIN || photoCount > AUCTION_PHOTOS_MAX)) {
      throw new Error(`Between ${AUCTION_PHOTOS_MIN} and ${AUCTION_PHOTOS_MAX} photos are required to publish.`);
    }
    const uniquePhotoUrls = [...new Set(photoUrls)];
    if (uniquePhotoUrls.length !== photoCount) {
      throw new Error('Duplicate photos are not allowed.');
    }

    const immediate = start_immediate === true || start_immediate === 'true' || start_immediate === '1';
    let startDate = null;
    let endDate = null;
    let auctionStatus = 'draft';

    if (immediate) {
      startDate = new Date();
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + duration);
      auctionStatus = 'active';
    } else if (start_at) {
      startDate = new Date(start_at);
      if (Number.isNaN(startDate.getTime())) throw new Error('Invalid start date.');
      if (startDate <= new Date()) throw new Error('Scheduled start time must be in the future.');
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + duration);
      auctionStatus = 'scheduled';
    }

    if (status === 'draft') {
      auctionStatus = 'draft';
      startDate = null;
      endDate = null;
    }

    const insertData = {
      vehicle_id,
      seller_id: userId,
      status: auctionStatus,
      description: desc,
      reserve_price: reserve,
      starting_bid: startBid,
      current_high_bid: null,
      duration_days: duration,
      start_at: startDate,
      end_at: endDate,
      featured: featured === true || featured === 'true' || featured === '1' ? 1 : 0,
      view_count: 0,
      watchlist_count: 0,
      odometer_km: odometerKm,
      terms_accepted_at: (terms_accepted === true || terms_accepted === 'true' || terms_accepted === '1') ? new Date() : null
    };

    const auctionId = await this.auctionRepository.create(insertData);
    if (uniquePhotoUrls.length > 0) {
      await this.auctionRepository.addPhotos(auctionId, uniquePhotoUrls);
    }
    const auction = await this.auctionRepository.findByIdWithVehicle(auctionId);
    const photos = await this.auctionRepository.findPhotosByAuctionId(auctionId);
    return { ...auction, photos };
  }

  /**
   * Update a draft auction (save draft again or publish). Only drafts owned by userId can be updated.
   */
  async updateAuction(auctionId, userId, data, photoUrls = []) {
    const auction = await this.auctionRepository.findByIdForSeller(auctionId, userId);
    if (!auction) throw new Error('Auction not found.');
    if (auction.status !== 'draft') {
      throw new Error('Only draft auctions can be edited. This auction is already published.');
    }

    const {
      description,
      reserve_price,
      starting_bid,
      duration_days,
      start_immediate,
      start_at,
      featured,
      terms_accepted,
      status,
      odometer_km: odometerKmInput
    } = data;

    const vehicle = await this.vehicleRepository.findById(auction.vehicle_id);
    if (!vehicle) throw new Error('Vehicle not found.');

    const vehicleMileage = vehicle.mileage_km != null ? parseInt(vehicle.mileage_km, 10) : null;
    let odometerKm = auction.odometer_km;
    if (odometerKmInput !== undefined && odometerKmInput !== null && odometerKmInput !== '') {
      odometerKm = parseInt(odometerKmInput, 10);
      if (Number.isNaN(odometerKm) || odometerKm < 0) {
        throw new Error('Odometer reading must be a non-negative number.');
      }
      if (vehicleMileage != null && odometerKm < vehicleMileage) {
        throw new Error(`Odometer reading cannot be less than vehicle registration reading (${vehicleMileage} km).`);
      }
    } else if (odometerKmInput === '' || odometerKmInput === null) {
      odometerKm = null;
    }

    const photoCount = Array.isArray(photoUrls) ? photoUrls.length : 0;
    const uniquePhotoUrls = [...new Set(photoUrls)];
    if (uniquePhotoUrls.length !== photoCount) throw new Error('Duplicate photos are not allowed.');
    if (photoCount > AUCTION_PHOTOS_MAX) throw new Error(`Maximum ${AUCTION_PHOTOS_MAX} photos allowed.`);

    const reserve = parseFloat(reserve_price);
    const startBid = parseFloat(starting_bid);
    const duration = parseInt(duration_days, 10);

    const isPublish = status === 'active' || status === 'scheduled';
    if (!description || description.trim().length === 0) throw new Error('Description is required.');
    if (isNaN(reserve) || reserve <= 0) throw new Error('Reserve price must be a positive number.');
    if (isNaN(startBid) || startBid <= 0) throw new Error('Starting bid must be a positive number.');
    if (startBid > reserve) throw new Error('Starting bid cannot exceed reserve price.');
    if (!DURATION_DAYS_OPTIONS.includes(duration)) {
      throw new Error(`Duration must be one of: ${DURATION_DAYS_OPTIONS.join(', ')} days.`);
    }
    if (isPublish) {
      if (!terms_accepted) throw new Error('You must accept the auction terms and conditions to publish.');
      if (photoCount < AUCTION_PHOTOS_MIN || photoCount > AUCTION_PHOTOS_MAX) {
        throw new Error(`Between ${AUCTION_PHOTOS_MIN} and ${AUCTION_PHOTOS_MAX} photos are required to publish.`);
      }
    }

    const immediate = start_immediate === true || start_immediate === 'true' || start_immediate === '1';
    let startDate = null;
    let endDate = null;
    let newStatus = 'draft';

    if (isPublish) {
      if (immediate) {
        startDate = new Date();
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + duration);
        newStatus = 'active';
      } else if (start_at) {
        startDate = new Date(start_at);
        if (Number.isNaN(startDate.getTime())) throw new Error('Invalid start date.');
        if (startDate <= new Date()) throw new Error('Scheduled start time must be in the future.');
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + duration);
        newStatus = 'scheduled';
      } else {
        throw new Error('Choose immediate start or a future start date to publish.');
      }
    }

    const updateData = {
      description: (description || '').trim(),
      reserve_price: reserve,
      starting_bid: startBid,
      duration_days: duration,
      featured: featured === true || featured === 'true' || featured === '1' ? 1 : 0,
      odometer_km: odometerKm,
      start_at: startDate,
      end_at: endDate,
      status: newStatus,
      terms_accepted_at: (terms_accepted === true || terms_accepted === 'true' || terms_accepted === '1') ? new Date() : auction.terms_accepted_at
    };

    await this.auctionRepository.update(auctionId, updateData);
    await this.auctionRepository.deletePhotosByAuctionId(auctionId);
    if (uniquePhotoUrls.length > 0) {
      await this.auctionRepository.addPhotos(auctionId, uniquePhotoUrls);
    }

    const updated = await this.auctionRepository.findByIdWithVehicle(auctionId);
    const photos = await this.auctionRepository.findPhotosByAuctionId(auctionId);
    return { ...updated, photos };
  }

  async deleteDraft(auctionId, userId) {
    const auction = await this.auctionRepository.findByIdForSeller(auctionId, userId);
    if (!auction) throw new Error('Auction not found.');
    if (auction.status !== 'draft') {
      throw new Error('Only draft auctions can be deleted.');
    }
    await this.auctionRepository.delete(auctionId);
  }

  /**
   * List active auctions with filters, sort, pagination. Excludes seller's own auctions when userRole is vehicle_owner.
   */
  async listAuctions(filters = {}, sort, page, limit, userId = null, userRole = null) {
    const safeSort = VALID_SORT.includes(sort) ? sort : 'ending_soon';
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(LIST_PAGE_SIZE_MAX, Math.max(1, parseInt(limit, 10) || LIST_PAGE_SIZE_DEFAULT));
    const offset = (pageNum - 1) * limitNum;

    const listFilters = { ...filters };
    if (userRole === 'vehicle_owner' && userId) {
      listFilters.excludeSellerId = userId;
    }
    if (filters.min_price != null && filters.min_price !== '') listFilters.min_price = filters.min_price;
    if (filters.max_price != null && filters.max_price !== '') listFilters.max_price = filters.max_price;

    const [auctions, total] = await Promise.all([
      this.auctionRepository.findActiveWithFilters(listFilters, safeSort, limitNum, offset),
      this.auctionRepository.countActiveWithFilters(listFilters)
    ]);

    const watchlistIds = userId
      ? await this.auctionRepository.getUserWatchlistAuctionIds(userId)
      : [];
    const watchlistSet = new Set(watchlistIds);

    const now = new Date();
    const items = auctions.map((a) => {
      const endAt = a.end_at ? new Date(a.end_at) : null;
      const timeRemainingSeconds = endAt && endAt > now ? Math.floor((endAt - now) / 1000) : 0;
      const reserveMet = a.reserve_price != null && a.current_high_bid != null && a.current_high_bid >= a.reserve_price;
      const rowForMin = {
        current_high_bid: a.current_high_bid != null ? parseFloat(a.current_high_bid) : null,
        starting_bid: parseFloat(a.starting_bid)
      };
      const minimumNextBid = this.getMinimumNextBid(rowForMin);
      return {
        id: a.id,
        vehicle_id: a.vehicle_id,
        description: a.description,
        reserve_price: parseFloat(a.reserve_price),
        starting_bid: parseFloat(a.starting_bid),
        current_high_bid: a.current_high_bid != null ? parseFloat(a.current_high_bid) : null,
        status: a.status,
        start_at: a.start_at,
        end_at: a.end_at,
        featured: Boolean(a.featured),
        view_count: a.view_count,
        watchlist_count: a.watchlist_count,
        is_watching: watchlistSet.has(a.id),
        created_at: a.created_at,
        make: a.make,
        model: a.model,
        variant: a.variant,
        model_year: a.model_year,
        mileage_km: a.mileage_km,
        fuel_type: a.fuel_type,
        transmission_type: a.transmission_type,
        registered_city: a.registered_city,
        primary_image_url: a.primary_image_url,
        bid_count: a.bid_count,
        time_remaining_seconds: timeRemainingSeconds,
        reserve_met: reserveMet,
        minimum_next_bid: minimumNextBid,
        bid_increment: BID_INCREMENT_PKR
      };
    });

    return {
      auctions: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 0
      }
    };
  }

  /**
   * Get single auction detail. Increments view count. Optional userId for is_watching.
   */
  async getAuctionDetail(auctionId, userId = null) {
    const auction = await this.auctionRepository.findByIdWithVehicle(auctionId);
    if (!auction) return null;
    if (auction.status !== 'active') return null;
    const endAt = auction.end_at ? new Date(auction.end_at) : null;
    const now = new Date();
    if (endAt && endAt <= now) return null;

    const [photos, bidCount, isWatching] = await Promise.all([
      this.auctionRepository.findPhotosByAuctionId(auctionId),
      this.auctionRepository.getBidCount(auctionId),
      userId ? this.auctionRepository.isInWatchlist(userId, auctionId) : Promise.resolve(false)
    ]);

    await this.auctionRepository.incrementViewCount(auctionId);

    const timeRemainingSeconds = endAt ? Math.max(0, Math.floor((endAt - now) / 1000)) : 0;
    const reserveMet = auction.reserve_price != null && auction.current_high_bid != null &&
      auction.current_high_bid >= auction.reserve_price;
    const minimumNextBid = this.getMinimumNextBid(auction);

    return {
      ...auction,
      reserve_price: parseFloat(auction.reserve_price),
      starting_bid: parseFloat(auction.starting_bid),
      current_high_bid: auction.current_high_bid != null ? parseFloat(auction.current_high_bid) : null,
      view_count: auction.view_count + 1,
      photos,
      bid_count: bidCount,
      time_remaining_seconds: timeRemainingSeconds,
      reserve_met: reserveMet,
      is_watching: isWatching,
      minimum_next_bid: minimumNextBid,
      bid_increment: BID_INCREMENT_PKR
    };
  }

  /**
   * Place bid. Allowed: buyer, vehicle_owner (not seller of this auction). Uses transaction with FOR UPDATE to avoid race.
   */
  async placeBid(auctionId, userId, userRole, amount) {
    const auction = await this.auctionRepository.findByIdWithVehicle(auctionId);
    if (!auction) throw new Error('Auction not found.');
    if (auction.status !== 'active') throw new Error('Auction is not active.');
    const endAt = auction.end_at ? new Date(auction.end_at) : null;
    if (!endAt || endAt <= new Date()) throw new Error('Auction has ended.');
    if (auction.seller_id === userId) throw new Error('You cannot bid on your own auction.');
    const allowedRoles = ['buyer', 'vehicle_owner'];
    if (!allowedRoles.includes(userRole)) throw new Error('Only buyers can place bids on auctions.');
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) throw new Error('Please enter a valid bid amount.');
    const minBid = this.getMinimumNextBid(auction);
    if (amountNum < minBid) throw new Error(`Bid must be at least PKR ${minBid.toLocaleString()}.`);

    const result = await database.transaction(async (connection) => {
      const locked = await this.auctionRepository.findByIdForUpdate(connection, auctionId);
      if (!locked) throw new Error('Auction not found.');
      if (locked.status !== 'active') throw new Error('Auction is not active.');
      const minAgain = this.getMinimumNextBid(locked);
      if (amountNum < minAgain) throw new Error(`Bid must be at least PKR ${minAgain.toLocaleString()}.`);
      const previousHighBidderId = locked.current_high_bidder_id ? parseInt(locked.current_high_bidder_id, 10) : null;
      const bidId = await this.auctionRepository.insertBid(connection, auctionId, userId, amountNum);
      await this.auctionRepository.updateAuctionHighBid(connection, auctionId, amountNum, userId);
      return { bidId, previousHighBidderId, sellerId: locked.seller_id };
    });

    const seller = await this.userRepository.findById(result.sellerId);
    const bidder = await this.userRepository.findById(userId);
    const previousBidder = result.previousHighBidderId ? await this.userRepository.findById(result.previousHighBidderId) : null;
    const auctionForEmail = { make: auction.make, model: auction.model, model_year: auction.model_year };

    if (seller && seller.email) {
      this.emailService.sendNewBidToSeller({
        to: seller.email,
        auction: auctionForEmail,
        amount: amountNum,
        bidderEmail: bidder ? bidder.email : null
      }).catch((err) => console.error('Send new-bid email failed:', err));
    }
    if (previousBidder && previousBidder.email && result.previousHighBidderId !== userId) {
      this.emailService.sendOutbidNotification({
        to: previousBidder.email,
        auction: auctionForEmail,
        newAmount: amountNum
      }).catch((err) => console.error('Send outbid email failed:', err));
    }

    return {
      bid_id: result.bidId,
      amount: amountNum,
      is_high_bidder: true,
      current_high_bid: amountNum,
      message: 'You are the high bidder!'
    };
  }

  async addToWatchlist(userId, auctionId) {
    const auction = await this.auctionRepository.findById(auctionId);
    if (!auction) throw new Error('Auction not found.');
    if (auction.status !== 'active') throw new Error('Auction is not active.');
    await this.auctionRepository.addToWatchlist(userId, auctionId);
  }

  async removeFromWatchlist(userId, auctionId) {
    await this.auctionRepository.removeFromWatchlist(userId, auctionId);
  }

  async getUserWatchlist(userId) {
    const ids = await this.auctionRepository.getUserWatchlistAuctionIds(userId);
    if (ids.length === 0) return { auctions: [], pagination: { page: 1, limit: ids.length, total: 0, totalPages: 0 } };
    const auctions = await this.auctionRepository.findByIdsWithListShape(ids);
    const now = new Date();
    const items = auctions.map((a) => {
      const endAt = a.end_at ? new Date(a.end_at) : null;
      const timeRemainingSeconds = endAt && endAt > now ? Math.floor((endAt - now) / 1000) : 0;
      const reserveMet = a.reserve_price != null && a.current_high_bid != null && a.current_high_bid >= a.reserve_price;
      return {
        id: a.id,
        vehicle_id: a.vehicle_id,
        description: a.description,
        reserve_price: parseFloat(a.reserve_price),
        starting_bid: parseFloat(a.starting_bid),
        current_high_bid: a.current_high_bid != null ? parseFloat(a.current_high_bid) : null,
        status: a.status,
        end_at: a.end_at,
        view_count: a.view_count,
        watchlist_count: a.watchlist_count,
        make: a.make,
        model: a.model,
        variant: a.variant,
        model_year: a.model_year,
        primary_image_url: a.primary_image_url,
        bid_count: a.bid_count,
        time_remaining_seconds: timeRemainingSeconds,
        reserve_met: reserveMet
      };
    });
    return {
      auctions: items,
      pagination: { page: 1, limit: items.length, total: items.length, totalPages: 1 }
    };
  }

  /**
   * My Auctions: list auctions by seller (any status). Optional search, status filter, sort.
   * For ended auctions, includes outcome from auction_transactions (sold | reserve_not_met | no_sale).
   */
  async getMyAuctions(userId, options = {}) {
    const { search, status = 'all', sort = 'newest_first' } = options;
    const rows = await this.auctionRepository.findMyAuctions(userId, { search, status, sort });
    const now = new Date();
    const endedIds = rows.filter((a) => a.status === 'ended').map((a) => a.id);
    const txMap = endedIds.length > 0 ? await this.transactionRepository.findByAuctionIds(endedIds) : new Map();
    const items = rows.map((a) => {
      const startAt = a.start_at ? new Date(a.start_at) : null;
      const endAt = a.end_at ? new Date(a.end_at) : null;
      const timeRemainingEnd = endAt && endAt > now ? Math.floor((endAt - now) / 1000) : null;
      const timeRemainingStart = startAt && startAt > now ? Math.floor((startAt - now) / 1000) : null;
      const reserveMet = a.reserve_price != null && a.current_high_bid != null && a.current_high_bid >= a.reserve_price;
      const tx = a.status === 'ended' ? txMap.get(a.id) : null;
      return {
        id: a.id,
        vehicle_id: a.vehicle_id,
        status: a.status,
        outcome: tx?.outcome ?? null,
        transaction_status: tx?.transaction_status ?? null,
        description: a.description,
        reserve_price: parseFloat(a.reserve_price),
        starting_bid: parseFloat(a.starting_bid),
        current_high_bid: a.current_high_bid != null ? parseFloat(a.current_high_bid) : null,
        start_at: a.start_at,
        end_at: a.end_at,
        featured: Boolean(a.featured),
        view_count: a.view_count,
        watchlist_count: a.watchlist_count,
        bid_count: a.bid_count ?? 0,
        created_at: a.created_at,
        make: a.make,
        model: a.model,
        variant: a.variant,
        model_year: a.model_year,
        primary_image_url: a.primary_image_url,
        time_remaining_end_seconds: timeRemainingEnd,
        time_remaining_start_seconds: timeRemainingStart,
        reserve_met: reserveMet
      };
    });
    return {
      auctions: items,
      pagination: { page: 1, limit: items.length, total: items.length, totalPages: items.length ? 1 : 0 }
    };
  }

  /**
   * Get single auction detail for seller (owner). Any status; includes photos and vehicle specs.
   */
  async getMyAuctionDetail(auctionId, userId) {
    const auction = await this.auctionRepository.findByIdForSeller(auctionId, userId);
    if (!auction) return null;
    const [photos, bidCount] = await Promise.all([
      this.auctionRepository.findPhotosByAuctionId(auctionId),
      this.auctionRepository.getBidCount(auctionId)
    ]);
    const now = new Date();
    const startAt = auction.start_at ? new Date(auction.start_at) : null;
    const endAt = auction.end_at ? new Date(auction.end_at) : null;
    const timeRemainingEnd = endAt && endAt > now ? Math.max(0, Math.floor((endAt - now) / 1000)) : null;
    const timeRemainingStart = startAt && startAt > now ? Math.max(0, Math.floor((startAt - now) / 1000)) : null;
    const reserveMet = auction.reserve_price != null && auction.current_high_bid != null &&
      auction.current_high_bid >= auction.reserve_price;
    const minimumNextBid = auction.status === 'active' ? this.getMinimumNextBid(auction) : null;
    return {
      ...auction,
      reserve_price: parseFloat(auction.reserve_price),
      starting_bid: parseFloat(auction.starting_bid),
      current_high_bid: auction.current_high_bid != null ? parseFloat(auction.current_high_bid) : null,
      featured: Boolean(auction.featured),
      photos,
      bid_count: bidCount,
      time_remaining_end_seconds: timeRemainingEnd,
      time_remaining_start_seconds: timeRemainingStart,
      reserve_met: reserveMet,
      minimum_next_bid: minimumNextBid,
      bid_increment: BID_INCREMENT_PKR
    };
  }

  /**
   * My Bids: auctions where the user has placed at least one bid. For both buyer and vehicle_owner.
   * Includes is_high_bidder and my_last_bid per auction.
   */
  async getMyBids(userId) {
    const [auctionIds, myLastBidByAuction] = await Promise.all([
      this.auctionRepository.getAuctionIdsWhereUserBid(userId),
      this.auctionRepository.getUserLastBidByAuction(userId)
    ]);
    if (auctionIds.length === 0) {
      return { auctions: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } };
    }
    const auctions = await this.auctionRepository.findByIdsWithListShape(auctionIds);
    const now = new Date();
    const endedIds = auctions.filter((a) => a.status === 'ended').map((a) => a.id);
    const txMap = endedIds.length > 0 ? await this.transactionRepository.findByAuctionIds(endedIds) : new Map();
    const items = auctions.map((a) => {
      const endAt = a.end_at ? new Date(a.end_at) : null;
      const timeRemainingSeconds = endAt && endAt > now ? Math.floor((endAt - now) / 1000) : 0;
      const reserveMet = a.reserve_price != null && a.current_high_bid != null && a.current_high_bid >= a.reserve_price;
      const isHighBidder = a.current_high_bidder_id != null && parseInt(a.current_high_bidder_id, 10) === userId;
      const tx = a.status === 'ended' ? txMap.get(a.id) : null;
      return {
        id: a.id,
        vehicle_id: a.vehicle_id,
        description: a.description,
        reserve_price: parseFloat(a.reserve_price),
        starting_bid: parseFloat(a.starting_bid),
        current_high_bid: a.current_high_bid != null ? parseFloat(a.current_high_bid) : null,
        status: a.status,
        outcome: tx?.outcome ?? null,
        transaction_status: tx?.transaction_status ?? null,
        start_at: a.start_at,
        end_at: a.end_at,
        view_count: a.view_count,
        watchlist_count: a.watchlist_count,
        make: a.make,
        model: a.model,
        variant: a.variant,
        model_year: a.model_year,
        primary_image_url: a.primary_image_url,
        bid_count: a.bid_count,
        time_remaining_seconds: timeRemainingSeconds,
        reserve_met: reserveMet,
        is_high_bidder: isHighBidder,
        my_last_bid: myLastBidByAuction[a.id] ?? null
      };
    });
    return {
      auctions: items,
      pagination: { page: 1, limit: items.length, total: items.length, totalPages: 1 }
    };
  }
}

module.exports = new AuctionService();
