const database = require('../config/database');

class TransactionRepository {
  async create(data) {
    try {
      const [result] = await database.getPool().query(
        `INSERT INTO auction_transactions (auction_id, winner_id, seller_id, final_amount, outcome, transaction_status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          data.auction_id,
          data.winner_id ?? null,
          data.seller_id,
          data.final_amount ?? null,
          data.outcome,
          data.transaction_status
        ]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error creating transaction: ${error.message}`);
    }
  }

  async findByAuctionId(auctionId) {
    try {
      const [rows] = await database.getPool().query(
        'SELECT * FROM auction_transactions WHERE auction_id = ?',
        [auctionId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw new Error(`Error finding transaction: ${error.message}`);
    }
  }

  /** Get transactions for multiple auction IDs. Returns Map<auctionId, { outcome, transaction_status }>. */
  async findByAuctionIds(auctionIds) {
    if (!auctionIds || auctionIds.length === 0) return new Map();
    try {
      const placeholders = auctionIds.map(() => '?').join(', ');
      const [rows] = await database.getPool().query(
        `SELECT auction_id, outcome, transaction_status FROM auction_transactions WHERE auction_id IN (${placeholders})`,
        auctionIds
      );
      const map = new Map();
      for (const r of rows) {
        map.set(r.auction_id, { outcome: r.outcome, transaction_status: r.transaction_status });
      }
      return map;
    } catch (error) {
      throw new Error(`Error finding transactions: ${error.message}`);
    }
  }

  async updateOutcome(auctionId, outcome, transactionStatus) {
    try {
      const [result] = await database.getPool().query(
        'UPDATE auction_transactions SET outcome = ?, transaction_status = ?, updated_at = NOW() WHERE auction_id = ?',
        [outcome, transactionStatus, auctionId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error updating transaction outcome: ${error.message}`);
    }
  }

  async transactionExists(auctionId) {
    const t = await this.findByAuctionId(auctionId);
    return t != null;
  }

  async updateChecklist(auctionId, updates) {
    try {
      const allowed = ['inspection_completed', 'payment_completed', 'docs_transferred', 'vehicle_delivered'];
      const setParts = [];
      const params = [];
      for (const key of allowed) {
        if (updates[key] !== undefined) {
          setParts.push(`${key} = ?`);
          params.push(updates[key] === true || updates[key] === 1 || updates[key] === '1');
        }
      }
      if (setParts.length === 0) return false;
      params.push(auctionId);
      const [result] = await database.getPool().query(
        `UPDATE auction_transactions SET ${setParts.join(', ')}, updated_at = NOW() WHERE auction_id = ?`,
        params
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error updating checklist: ${error.message}`);
    }
  }

  async confirmComplete(auctionId, isBuyer) {
    try {
      const col = isBuyer ? 'buyer_confirmed_complete' : 'seller_confirmed_complete';
      const [result] = await database.getPool().query(
        `UPDATE auction_transactions SET ${col} = TRUE, updated_at = NOW() WHERE auction_id = ?`,
        [auctionId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error confirming complete: ${error.message}`);
    }
  }

  async setTransactionCompleted(auctionId) {
    try {
      const [result] = await database.getPool().query(
        "UPDATE auction_transactions SET transaction_status = 'completed', updated_at = NOW() WHERE auction_id = ?",
        [auctionId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error setting transaction completed: ${error.message}`);
    }
  }
}

module.exports = new TransactionRepository();
