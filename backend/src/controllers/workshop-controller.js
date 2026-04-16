const WorkshopService = require('../services/workshop-service');

class WorkshopController {
  constructor() {
    this.workshopService = WorkshopService;
  }

  async getWorkshopProfile(req, res) {
    try {
      const data = await this.workshopService.getWorkshopProfile(req.user.userId);
      res.json({
        success: true,
        data
      });
    } catch (error) {
      const status = error.message === 'Profile not found' || error.message.includes('only available')
        ? 404
        : 500;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async listServicesCatalog(req, res) {
    try {
      const data = await this.workshopService.listServicesCatalog();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async listMyServices(req, res) {
    try {
      const data = await this.workshopService.listMyOfferedServices(req.user.userId);
      res.json({ success: true, count: data.length, data });
    } catch (error) {
      const status = error.message === 'Workshop not found.' ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  async addMyServices(req, res) {
    try {
      const data = await this.workshopService.addMyOfferedServices(req.user.userId, req.body.services || []);
      res.status(201).json({ success: true, message: 'Services updated.', count: data.length, data });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateMyService(req, res) {
    try {
      const data = await this.workshopService.updateMyOfferedService(req.user.userId, req.params.id, req.body || {});
      res.json({ success: true, message: 'Service updated.', count: data.length, data });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  async removeMyService(req, res) {
    try {
      await this.workshopService.removeMyOfferedService(req.user.userId, req.params.id);
      res.json({ success: true, message: 'Service removed.' });
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  async createPart(req, res) {
    try {
      const part = await this.workshopService.createPart(
        req.body,
        req.user.userId
      );

      res.status(201).json({
        success: true,
        message: 'Part created successfully',
        data: part
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getParts(req, res) {
    try {
      const parts = await this.workshopService.getWorkshopParts(req.user.userId);

      res.json({
        success: true,
        count: parts.length,
        data: parts
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getPartById(req, res) {
    try {
      const { partId } = req.params;
      const part = await this.workshopService.getPartById(partId, req.user.userId);

      res.json({
        success: true,
        data: part
      });
    } catch (error) {
      const status = error.message === 'Part not found or access denied' ? 404 : 500;
      
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async updatePart(req, res) {
    try {
      const { partId } = req.params;
      const part = await this.workshopService.updatePart(
        partId,
        req.body,
        req.user.userId
      );

      res.json({
        success: true,
        message: 'Part updated successfully',
        data: part
      });
    } catch (error) {
      const status = error.message === 'Part not found or access denied' ? 404 : 400;
      
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async deletePart(req, res) {
    try {
      const { partId } = req.params;
      await this.workshopService.deletePart(partId, req.user.userId);

      res.json({
        success: true,
        message: 'Part deleted successfully'
      });
    } catch (error) {
      const status = error.message === 'Part not found or access denied' ? 404 : 400;
      
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async trackServiceRecord(req, res) {
    try {
      const record = await this.workshopService.trackServiceRecord(
        req.body,
        req.user.userId
      );

      res.status(201).json({
        success: true,
        message: 'Service record tracked successfully',
        data: record
      });
    } catch (error) {
      const status = error.message.includes('already tracked') ? 409 : 400;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async getServiceRecords(req, res) {
    try {
      const filters = {
        chassisNumber: req.query.chassisNumber,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        limit: req.query.limit,
        offset: req.query.offset,
        page: req.query.page
      };

      const result = await this.workshopService.getServiceRecords(
        req.user.userId,
        filters
      );

      res.json({
        success: true,
        count: result.records.length,
        total: result.total,
        data: result.records
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new WorkshopController();

