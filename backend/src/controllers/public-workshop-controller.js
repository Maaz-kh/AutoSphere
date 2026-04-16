const PublicWorkshopService = require('../services/public-workshop-service');
const ServiceRepository = require('../repositories/service-repository');

class PublicWorkshopController {
  constructor() {
    this.publicWorkshopService = PublicWorkshopService;
  }

  async search(req, res) {
    try {
      const result = await this.publicWorkshopService.search(req.query || {});
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to search workshops.'
      });
    }
  }

  async details(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id < 1) {
        return res.status(400).json({ success: false, message: 'Invalid workshop ID.' });
      }
      const data = await this.publicWorkshopService.getDetails(id, { verified: req.query?.verified });
      if (!data) {
        return res.status(404).json({ success: false, message: 'Workshop not found.' });
      }
      return res.json({ success: true, data });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get workshop details.'
      });
    }
  }

  async servicesCatalog(req, res) {
    try {
      const data = await ServiceRepository.listActive();
      return res.json({ success: true, data });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to load services catalog.'
      });
    }
  }

  async reviews(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id < 1) {
        return res.status(400).json({ success: false, message: 'Invalid workshop ID.' });
      }
      const data = await this.publicWorkshopService.getReviews(id, req.query || {});
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.message === 'Invalid workshop ID.' ? 400 : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to get workshop reviews.'
      });
    }
  }
}

module.exports = new PublicWorkshopController();

