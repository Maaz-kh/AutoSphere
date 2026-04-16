const BaseRepository = require('./base-repository');
const database = require('../config/database');

class AuctionRepository extends BaseRepository {
  constructor() {
    super('auctions');
  }

  async findByIdWithVehicle(auctionId) {
    try {
      const results = await this.db.query(
        `SELECT a.*, v.make, v.model, v.variant, v.model_year, v.chassis_number, v.mileage_km,
                v.fuel_type, v.transmission_type, v.body_type, v.engine_capacity, v.color, v.registered_city,
                v.front_image_path AS vehicle_front_image, v.back_image_path AS vehicle_back_image, v.interior_image_path AS vehicle_interior_image
         FROM auctions a
         JOIN vehicles v ON a.vehicle_id = v.id
         WHERE a.id = ?`,
        [auctionId]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding auction with vehicle: ${error.message}`);
    }
  }

  async getBidCount(auctionId) {
    try {
      const results = await this.db.query(
        'SELECT COUNT(*) AS count FROM bids WHERE auction_id = ?',
        [auctionId]
      );
      return results[0].count;
    } catch (error) {
      throw new Error(`Error getting bid count: ${error.message}`);
    }
  }

  /**
   * Lock auction row for update (use inside transaction). Returns auction with vehicle make/model.
   */
  async findByIdForUpdate(connection, auctionId) {
    const [results] = await connection.query(
      `SELECT a.*, v.make, v.model, v.variant, v.model_year
       FROM auctions a
       JOIN vehicles v ON a.vehicle_id = v.id
       WHERE a.id = ?
       FOR UPDATE`,
      [auctionId]
    );
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Insert bid (use inside transaction).
   */
  async insertBid(connection, auctionId, userId, amount) {
    const [result] = await connection.query(
      'INSERT INTO bids (auction_id, user_id, amount, is_proxy) VALUES (?, ?, ?, FALSE)',
      [auctionId, userId, amount]
    );
    return result.insertId;
  }

  /**
   * Update auction's current high bid and bidder (use inside transaction).
   */
  async updateAuctionHighBid(connection, auctionId, amount, userId) {
    const [result] = await connection.query(
      'UPDATE auctions SET current_high_bid = ?, current_high_bidder_id = ? WHERE id = ?',
      [amount, userId, auctionId]
    );
    return result.affectedRows;
  }

  async findActiveByVehicleId(vehicleId) {
    try {
      const results = await this.db.query(
        "SELECT * FROM auctions WHERE vehicle_id = ? AND status = 'active' LIMIT 1",
        [vehicleId]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding active auction by vehicle: ${error.message}`);
    }
  }

  async countActiveBySeller(sellerId) {
    try {
      const results = await this.db.query(
        "SELECT COUNT(*) as count FROM auctions WHERE seller_id = ? AND status IN ('active', 'scheduled')",
        [sellerId]
      );
      return results[0].count;
    } catch (error) {
      throw new Error(`Error counting active auctions by seller: ${error.message}`);
    }
  }

  /**
   * Find scheduled auctions whose start_at has passed (ready to activate).
   */
  /**
   * Count auctions with status = 'active'. Used to decide whether cron should run (for processEndedAuctions).
   */
  async countActiveAuctions() {
    try {
      const results = await this.db.query(
        "SELECT COUNT(*) AS count FROM auctions WHERE status = 'active'"
      );
      return results[0].count;
    } catch (error) {
      throw new Error('Error counting active auctions');
    }
  }

  /**
   * Count auctions with status = 'scheduled'. Used to decide whether cron should run.
   */
  async countScheduledAuctions() {
    try {
      const results = await this.db.query(
        "SELECT COUNT(*) AS count FROM auctions WHERE status = 'scheduled'"
      );
      return results[0].count;
    } catch (error) {
      throw new Error(`Error counting scheduled auctions: ${error.message}`);
    }
  }

  async findScheduledToActivate() {
    try {
      const results = await this.db.query(
        `SELECT a.id, a.seller_id, a.vehicle_id, a.duration_days, a.start_at, a.reserve_price, a.starting_bid,
                v.make, v.model, v.variant, v.model_year
         FROM auctions a
         JOIN vehicles v ON a.vehicle_id = v.id
         WHERE a.status = 'scheduled' AND a.start_at <= NOW()`
      );
      return results;
    } catch (error) {
      throw new Error(`Error finding scheduled auctions to activate: ${error.message}`);
    }
  }

  /**
   * Activate a scheduled auction: set status to active and end_at = start_at + duration_days.
   */
  async activateScheduledAuction(auctionId) {
    try {
      const result = await this.db.query(
        `UPDATE auctions
         SET status = 'active', end_at = DATE_ADD(start_at, INTERVAL duration_days DAY)
         WHERE id = ? AND status = 'scheduled'`,
        [auctionId]
      );
      return result && result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error activating scheduled auction: ${error.message}`);
    }
  }

  /**
   * Find scheduled auctions that start in ~24 hours and have not had a reminder sent.
   * Window: start_at between 23 and 25 hours from now.
   */
  async findScheduledForReminder() {
    try {
      const results = await this.db.query(
        `SELECT a.id, a.seller_id, a.vehicle_id, a.start_at, a.duration_days,
                v.make, v.model, v.variant, v.model_year
         FROM auctions a
         JOIN vehicles v ON a.vehicle_id = v.id
         WHERE a.status = 'scheduled'
           AND a.reminder_sent_at IS NULL
           AND a.start_at >= DATE_ADD(NOW(), INTERVAL 23 HOUR)
           AND a.start_at <= DATE_ADD(NOW(), INTERVAL 25 HOUR)`
      );
      return results;
    } catch (error) {
      throw new Error(`Error finding scheduled auctions for reminder: ${error.message}`);
    }
  }

  /**
   * Find active auctions whose end_at has passed (ready to end).
   */
  async findActiveToEnd() {
    try {
      const results = await this.db.query(
        `SELECT a.id, a.seller_id, a.vehicle_id, a.reserve_price, a.current_high_bid, a.current_high_bidder_id,
                v.make, v.model, v.variant, v.model_year
         FROM auctions a
         JOIN vehicles v ON a.vehicle_id = v.id
         WHERE a.status = 'active' AND a.end_at <= NOW()`
      );
      return results;
    } catch (error) {
      throw new Error(`Error finding active auctions to end: ${error.message}`);
    }
  }

  /**
   * Mark auction as ended.
   */
  async endAuction(auctionId) {
    try {
      const result = await this.db.query(
        "UPDATE auctions SET status = 'ended', end_reason = 'duration_elapsed', ended_at = NOW(), ended_by_user_id = NULL WHERE id = ? AND status = 'active'",
        [auctionId]
      );
      return result && result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error ending auction: ${error.message}`);
    }
  }

  /**
   * Get all unique bidder user IDs for an auction (for decline notifications).
   */
  async getBiddersForAuction(auctionId) {
    try {
      const rows = await this.db.query(
        'SELECT DISTINCT user_id FROM bids WHERE auction_id = ?',
        [auctionId]
      );
      return rows.map((r) => r.user_id);
    } catch (error) {
      throw new Error(`Error getting bidders: ${error.message}`);
    }
  }

  /**
   * Mark that the 1-day reminder has been sent for an auction.
   */
  async markReminderSent(auctionId) {
    try {
      const result = await this.db.query(
        'UPDATE auctions SET reminder_sent_at = NOW() WHERE id = ?',
        [auctionId]
      );
      return result && result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error marking reminder sent: ${error.message}`);
    }
  }

  /**
   * List auctions by seller (my auctions). Optional: search, status filter, sort.
   */
  async findMyAuctions(sellerId, options = {}) {
    try {
      const { search, status, sort = 'newest_first' } = options;
      const conditions = ['a.seller_id = ?'];
      const params = [sellerId];

      if (status && status !== 'all') {
        conditions.push('a.status = ?');
        params.push(status);
      }
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push('(v.make LIKE ? OR v.model LIKE ? OR v.variant LIKE ? OR a.description LIKE ? OR CAST(v.model_year AS CHAR) LIKE ?)');
        params.push(term, term, term, term, term);
      }

      const orderMap = {
        newest_first: 'ORDER BY a.created_at DESC',
        ending_soon: 'ORDER BY a.end_at IS NULL, a.end_at ASC, a.created_at DESC',
        start_soon: 'ORDER BY a.start_at IS NULL, a.start_at ASC, a.created_at DESC'
      };
      const orderClause = orderMap[sort] || orderMap.newest_first;

      const query = `
        SELECT a.id, a.vehicle_id, a.seller_id, a.status, a.description, a.reserve_price, a.starting_bid,
               a.current_high_bid, a.duration_days, a.start_at, a.end_at, a.featured, a.view_count, a.watchlist_count, a.created_at,
               v.make, v.model, v.variant, v.model_year,
               (SELECT ap.image_url FROM auction_photos ap WHERE ap.auction_id = a.id ORDER BY ap.sort_order ASC, ap.id ASC LIMIT 1) AS primary_image_url,
               (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS bid_count
        FROM auctions a
        JOIN vehicles v ON a.vehicle_id = v.id
        WHERE ${conditions.join(' AND ')}
        ${orderClause}
      `;
      return await this.db.query(query, params);
    } catch (error) {
      throw new Error(`Error finding my auctions: ${error.message}`);
    }
  }

  /**
   * Get single auction by id only if seller_id matches (for owner detail view, any status).
   */
  async findByIdForSeller(auctionId, sellerId) {
    try {
      const results = await this.db.query(
        `SELECT a.*, v.make, v.model, v.variant, v.model_year, v.body_type, v.fuel_type, v.transmission_type,
                v.engine_capacity, v.mileage_km, v.color, v.registered_city
         FROM auctions a
         JOIN vehicles v ON a.vehicle_id = v.id
         WHERE a.id = ? AND a.seller_id = ?`,
        [auctionId, sellerId]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding auction for seller: ${error.message}`);
    }
  }

  async findPhotosByAuctionId(auctionId) {
    try {
      return await this.db.query(
        'SELECT * FROM auction_photos WHERE auction_id = ? ORDER BY sort_order ASC, id ASC',
        [auctionId]
      );
    } catch (error) {
      throw new Error(`Error finding auction photos: ${error.message}`);
    }
  }

  async addPhoto(auctionId, imageUrl, sortOrder = 0) {
    try {
      const result = await this.db.query(
        'INSERT INTO auction_photos (auction_id, image_url, sort_order) VALUES (?, ?, ?)',
        [auctionId, imageUrl, sortOrder]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error adding auction photo: ${error.message}`);
    }
  }

  async addPhotos(auctionId, imageUrls) {
    try {
      const values = imageUrls.map((url, index) => [auctionId, url, index]);
      if (values.length === 0) return [];
      const placeholders = values.map(() => '(?, ?, ?)').join(', ');
      const flat = values.flat();
      await this.db.query(
        `INSERT INTO auction_photos (auction_id, image_url, sort_order) VALUES ${placeholders}`,
        flat
      );
      return await this.findPhotosByAuctionId(auctionId);
    } catch (error) {
      throw new Error(`Error adding auction photos: ${error.message}`);
    }
  }

  async deletePhotosByAuctionId(auctionId) {
    try {
      await this.db.query('DELETE FROM auction_photos WHERE auction_id = ?', [auctionId]);
    } catch (error) {
      throw new Error(`Error deleting auction photos: ${error.message}`);
    }
  }

  /**
   * List active auctions with filters, sort, pagination. Includes vehicle fields, primary image, bid count.
  */
  async findActiveWithFilters(filters, sort, limit, offset) {
    try {
      const { search, min_price, max_price, excludeSellerId } = filters;
      const conditions = ["a.status = 'active'", 'a.end_at > NOW()'];
      const params = [];

      if (excludeSellerId != null) {
        conditions.push('a.seller_id != ?');
        params.push(excludeSellerId);
      }
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push('(v.make LIKE ? OR v.model LIKE ? OR v.variant LIKE ? OR a.description LIKE ? OR CAST(v.model_year AS CHAR) LIKE ?)');
        params.push(term, term, term, term, term);
      }

      if (min_price != null && min_price !== '' && !isNaN(parseFloat(min_price))) {
        conditions.push('(COALESCE(a.current_high_bid, a.starting_bid) >= ?)');
        params.push(parseFloat(min_price));
      }
      if (max_price != null && max_price !== '' && !isNaN(parseFloat(max_price))) {
        conditions.push('(COALESCE(a.current_high_bid, a.starting_bid) <= ?)');
        params.push(parseFloat(max_price));
      }

      const whereClause = conditions.join(' AND ');
      const orderClause = this._orderClauseForSort(sort);
      const query = `
        SELECT a.id, a.vehicle_id, a.description, a.reserve_price, a.starting_bid, a.current_high_bid,
               a.status, a.start_at, a.end_at, a.featured, a.view_count, a.watchlist_count, a.created_at,
               v.make, v.model, v.variant, v.model_year, v.mileage_km, v.fuel_type, v.transmission_type, v.registered_city,
               (SELECT ap.image_url FROM auction_photos ap WHERE ap.auction_id = a.id ORDER BY ap.sort_order ASC, ap.id ASC LIMIT 1) AS primary_image_url,
               (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS bid_count
        FROM auctions a
        JOIN vehicles v ON a.vehicle_id = v.id
        WHERE ${whereClause}
        ${orderClause}
        LIMIT ? OFFSET ?
      `;
      return await this.db.query(query, [...params, limit, offset]);
    } catch (error) {
      throw new Error(`Error finding active auctions: ${error.message}`);
    }
  }

  _orderClauseForSort(sort) {
    const map = {
      newest: 'ORDER BY a.created_at DESC',
      ending_soon: 'ORDER BY a.end_at ASC',
      lowest_bid: 'ORDER BY (a.current_high_bid IS NULL) ASC, a.current_high_bid ASC',
      highest_bid: 'ORDER BY a.current_high_bid DESC',
      most_bids: 'ORDER BY (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) DESC'
    };
    const orderBy = map[sort] || map.ending_soon;
    return orderBy;
  }
  
  async countActiveWithFilters(filters) {
    try {
      const { search, min_price, max_price, excludeSellerId } = filters;
      const conditions = ["a.status = 'active'", 'a.end_at > NOW()'];
      const params = [];

      if (excludeSellerId != null) {
        conditions.push('a.seller_id != ?');
        params.push(excludeSellerId);
      }
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push('(v.make LIKE ? OR v.model LIKE ? OR v.variant LIKE ? OR a.description LIKE ? OR CAST(v.model_year AS CHAR) LIKE ?)');
        params.push(term, term, term, term, term);
      }
      if (min_price != null && min_price !== '' && !isNaN(parseFloat(min_price))) {
        conditions.push('(COALESCE(a.current_high_bid, a.starting_bid) >= ?)');
        params.push(parseFloat(min_price));
      }
      if (max_price != null && max_price !== '' && !isNaN(parseFloat(max_price))) {
        conditions.push('(COALESCE(a.current_high_bid, a.starting_bid) <= ?)');
        params.push(parseFloat(max_price));
      }

      const whereClause = conditions.join(' AND ');
      const query = `
        SELECT COUNT(*) AS count
        FROM auctions a
        JOIN vehicles v ON a.vehicle_id = v.id
        WHERE ${whereClause}
      `;
      const results = await this.db.query(query, params);
      return results[0].count;
    } catch (error) {
      throw new Error(`Error counting active auctions: ${error.message}`);
    }
  }

  async incrementViewCount(auctionId) {
    try {
      await this.db.query(
        'UPDATE auctions SET view_count = view_count + 1 WHERE id = ?',
        [auctionId]
      );
    } catch (error) {
      throw new Error(`Error incrementing view count: ${error.message}`);
    }
  }

  async isInWatchlist(userId, auctionId) {
    try {
      const results = await this.db.query(
        'SELECT 1 FROM watchlist WHERE user_id = ? AND auction_id = ? LIMIT 1',
        [userId, auctionId]
      );
      return results.length > 0;
    } catch (error) {
      throw new Error(`Error checking watchlist: ${error.message}`);
    }
  }

  async addToWatchlist(userId, auctionId) {
    try {
      await this.db.query(
        'INSERT INTO watchlist (user_id, auction_id) VALUES (?, ?)',
        [userId, auctionId]
      );
      await this.db.query(
        'UPDATE auctions SET watchlist_count = watchlist_count + 1 WHERE id = ?',
        [auctionId]
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return;
      throw new Error(`Error adding to watchlist: ${error.message}`);
    }
  }

  async removeFromWatchlist(userId, auctionId) {
    try {
      const result = await this.db.query(
        'DELETE FROM watchlist WHERE user_id = ? AND auction_id = ?',
        [userId, auctionId]
      );
      if (result.affectedRows > 0) {
        await this.db.query(
          'UPDATE auctions SET watchlist_count = GREATEST(0, watchlist_count - 1) WHERE id = ?',
          [auctionId]
        );
      }
    } catch (error) {
      throw new Error(`Error removing from watchlist: ${error.message}`);
    }
  }

  async getUserWatchlistAuctionIds(userId) {
    try {
      const rows = await this.db.query(
        'SELECT auction_id FROM watchlist WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
      return rows.map((r) => r.auction_id);
    } catch (error) {
      throw new Error(`Error getting user watchlist: ${error.message}`);
    }
  }

  /**
   * Fetch auctions by IDs with same list shape (vehicle, primary image, bid count). Preserves order of ids.
   * Includes current_high_bidder_id for My Bids (is_high_bidder).
   */
  async findByIdsWithListShape(auctionIds) {
    if (!auctionIds || auctionIds.length === 0) return [];
    try {
      const placeholders = auctionIds.map(() => '?').join(',');
      const query = `
        SELECT a.id, a.vehicle_id, a.description, a.reserve_price, a.starting_bid, a.current_high_bid,
               a.current_high_bidder_id, a.status, a.start_at, a.end_at, a.featured, a.view_count, a.watchlist_count, a.created_at,
               v.make, v.model, v.variant, v.model_year, v.mileage_km, v.fuel_type, v.transmission_type, v.registered_city,
               (SELECT ap.image_url FROM auction_photos ap WHERE ap.auction_id = a.id ORDER BY ap.sort_order ASC, ap.id ASC LIMIT 1) AS primary_image_url,
               (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS bid_count
        FROM auctions a
        JOIN vehicles v ON a.vehicle_id = v.id
        WHERE a.id IN (${placeholders})
      `;
      const rows = await this.db.query(query, auctionIds);
      const byId = {};
      rows.forEach((r) => { byId[r.id] = r; });
      return auctionIds.map((id) => byId[id]).filter(Boolean);
    } catch (error) {
      throw new Error(`Error finding auctions by ids: ${error.message}`);
    }
  }

  /**
   * Auction IDs where user has placed at least one bid, ordered by most recent bid first.
   */
  async getAuctionIdsWhereUserBid(userId) {
    try {
      const rows = await this.db.query(
        `SELECT auction_id FROM bids WHERE user_id = ? GROUP BY auction_id ORDER BY MAX(created_at) DESC`,
        [userId]
      );
      return rows.map((r) => r.auction_id);
    } catch (error) {
      throw new Error(`Error getting auction ids for user bids: ${error.message}`);
    }
  }

  /**
   * User's highest bid per auction (for My Bids). Returns map: auctionId -> amount.
   */
  async getUserLastBidByAuction(userId) {
    try {
      const rows = await this.db.query(
        'SELECT auction_id, MAX(amount) AS my_last_bid FROM bids WHERE user_id = ? GROUP BY auction_id',
        [userId]
      );
      const map = {};
      rows.forEach((r) => { map[r.auction_id] = parseFloat(r.my_last_bid); });
      return map;
    } catch (error) {
      throw new Error(`Error getting user last bid by auction: ${error.message}`);
    }
  }
}

class AuctionPhotoRepository extends BaseRepository {
  constructor() {
    super('auction_photos');
  }
}

module.exports = new AuctionRepository();
module.exports.AuctionPhotoRepository = new AuctionPhotoRepository();
