const TransactionRepository = require('../repositories/transaction-repository');
const MessageRepository = require('../repositories/message-repository');

class MessageService {
  /**
   * Check if user can access messages for this auction (must be seller or winner, outcome sold).
   */
  async canAccess(auctionId, userId) {
    const tx = await TransactionRepository.findByAuctionId(auctionId);
    if (!tx) return false;
    const isSeller = tx.seller_id === userId;
    const isWinner = tx.winner_id === userId;
    if (!isSeller && !isWinner) return false;
    return tx.outcome === 'sold';
  }

  async list(auctionId, userId) {
    const allowed = await this.canAccess(auctionId, userId);
    if (!allowed) return null;
    const rows = await MessageRepository.findByAuctionId(auctionId);
    return rows.map((r) => ({
      id: r.id,
      auction_id: r.auction_id,
      sender_id: r.sender_id,
      sender_name: r.sender_name || r.sender_email,
      content: r.content,
      created_at: r.created_at,
      is_mine: r.sender_id === userId
    }));
  }

  async send(auctionId, userId, content) {
    const allowed = await this.canAccess(auctionId, userId);
    if (!allowed) throw new Error('You do not have access to send messages for this auction.');
    const trimmed = (content || '').trim();
    if (!trimmed) throw new Error('Message content is required.');
    if (trimmed.length > 10000) throw new Error('Message is too long.');
    const id = await MessageRepository.create(auctionId, userId, trimmed);
    const rows = await MessageRepository.findByAuctionId(auctionId);
    const row = rows.find((r) => r.id === id);
    return {
      id: row.id,
      auction_id: row.auction_id,
      sender_id: row.sender_id,
      sender_name: row.sender_name || row.sender_email,
      content: row.content,
      created_at: row.created_at,
      is_mine: true
    };
  }
}

module.exports = new MessageService();
