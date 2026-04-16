const database = require('../config/database');

class MessageRepository {
  async findByAuctionId(auctionId) {
    try {
      const [rows] = await database.getPool().query(
        `SELECT am.id, am.auction_id, am.sender_id, am.content, am.created_at,
                u.email AS sender_email,
                COALESCE(up.full_name, u.email) AS sender_name
         FROM auction_messages am
         JOIN users u ON am.sender_id = u.id
         LEFT JOIN user_profiles up ON u.id = up.user_id
         WHERE am.auction_id = ?
         ORDER BY am.created_at ASC`,
        [auctionId]
      );
      return rows;
    } catch (error) {
      throw new Error(`Error finding messages: ${error.message}`);
    }
  }

  async create(auctionId, senderId, content) {
    try {
      const [result] = await database.getPool().query(
        'INSERT INTO auction_messages (auction_id, sender_id, content) VALUES (?, ?, ?)',
        [auctionId, senderId, content]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error creating message: ${error.message}`);
    }
  }
}

module.exports = new MessageRepository();
