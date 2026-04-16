const TransactionService = require('../services/transaction-service');

class TransactionController {
  async getTransaction(req, res) {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      const summary = await TransactionService.getTransactionSummary(auctionId, userId, userRole);
      if (!summary) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found or you do not have access.'
        });
      }
      return res.json({ success: true, data: summary });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get transaction.'
      });
    }
  }

  async acceptBid(req, res) {
    try {
      const userId = req.user.userId;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      const summary = await TransactionService.acceptBid(auctionId, userId);
      return res.json({
        success: true,
        message: 'Bid accepted. The buyer has been notified.',
        data: summary
      });
    } catch (error) {
      const status = error.message === 'Transaction not found.' ? 404 :
        error.message.includes('Only the seller') ? 403 : 400;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to accept bid.'
      });
    }
  }

  async updateChecklist(req, res) {
    try {
      const userId = req.user.userId;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      const updates = req.body || {};
      const summary = await TransactionService.updateChecklist(auctionId, userId, updates);
      return res.json({ success: true, message: 'Checklist updated.', data: summary });
    } catch (error) {
      const status = error.message === 'Transaction not found.' ? 404 : 400;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to update checklist.'
      });
    }
  }

  async confirmComplete(req, res) {
    try {
      const userId = req.user.userId;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      const summary = await TransactionService.confirmComplete(auctionId, userId);
      return res.json({
        success: true,
        message: summary.transaction_status === 'completed'
          ? 'Transaction completed. Both parties have confirmed.'
          : 'Your confirmation has been recorded.',
        data: summary
      });
    } catch (error) {
      const status = error.message === 'Transaction not found.' ? 404 : 400;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to confirm completion.'
      });
    }
  }

  async declineBid(req, res) {
    try {
      const userId = req.user.userId;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      const summary = await TransactionService.declineBid(auctionId, userId);
      return res.json({
        success: true,
        message: 'Bid declined. All bidders have been notified.',
        data: summary
      });
    } catch (error) {
      const status = error.message === 'Transaction not found.' ? 404 :
        error.message.includes('Only the seller') ? 403 : 400;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to decline bid.'
      });
    }
  }
}

module.exports = new TransactionController();
