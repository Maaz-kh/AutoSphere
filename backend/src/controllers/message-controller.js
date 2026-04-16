const MessageService = require('../services/message-service');

class MessageController {
  async list(req, res) {
    try {
      const userId = req.user.userId;
      const auctionId = parseInt(req.params.auctionId, 10);
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      const messages = await MessageService.list(auctionId, userId);
      if (messages === null) {
        return res.status(404).json({
          success: false,
          message: 'Auction not found or you do not have access to messages.'
        });
      }
      return res.json({ success: true, data: { messages } });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to load messages.'
      });
    }
  }

  async send(req, res) {
    try {
      const userId = req.user.userId;
      const auctionId = parseInt(req.params.auctionId, 10);
      const content = req.body?.content;
      if (isNaN(auctionId) || auctionId < 1) {
        return res.status(400).json({ success: false, message: 'Invalid auction ID.' });
      }
      const message = await MessageService.send(auctionId, userId, content);
      return res.status(201).json({
        success: true,
        message: 'Message sent.',
        data: message
      });
    } catch (error) {
      const status = error.message?.includes('access') ? 403 : 400;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to send message.'
      });
    }
  }
}

module.exports = new MessageController();
