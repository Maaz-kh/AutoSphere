const VehicleService = require('../services/vehicle-service');

class VehicleController {
  constructor() {
    this.vehicleService = VehicleService;
  }

  async registerVehicle(req, res) {
    try {
      const vehicle = await this.vehicleService.registerVehicle(
        req.body,
        req.user.userId,
        req.files || {}
      );

      res.status(201).json({
        success: true,
        message: 'Vehicle registered successfully',
        data: vehicle
      });
    } catch (error) {
      console.error('Vehicle registration error:', error.message);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getUserVehicles(req, res) {
    try {
      const vehicles = await this.vehicleService.getUserVehicles(req.user.userId);

      res.json({
        success: true,
        count: vehicles.length,
        data: vehicles
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getVehicleById(req, res) {
    try {
      const { vehicleId } = req.params;
      const vehicle = await this.vehicleService.getVehicleById(
        vehicleId,
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        data: vehicle
      });
    } catch (error) {
      const status = error.message === 'Access denied' ? 403 : 
                     error.message === 'Vehicle not found' ? 404 : 500;
      
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateVehicle(req, res) {
    try {
      const { vehicleId } = req.params;
      const vehicle = await this.vehicleService.updateVehicle(
        vehicleId,
        req.body,
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        message: 'Vehicle updated successfully',
        data: vehicle
      });
    } catch (error) {
      const status = error.message === 'Access denied' ? 403 : 
                     error.message === 'Vehicle not found' ? 404 : 500;
      
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async deleteVehicle(req, res) {
    try {
      const { vehicleId } = req.params;
      await this.vehicleService.deleteVehicle(
        vehicleId,
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        message: 'Vehicle deleted successfully'
      });
    } catch (error) {
      const status = error.message === 'Access denied' ? 403 : 
                     error.message === 'Vehicle not found' ? 404 : 500;
      
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async getVehicleHistory(req, res) {
    try {
      const { vehicleId } = req.params;
      const history = await this.vehicleService.getVehicleHistory(
        vehicleId,
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        count: history.length,
        data: history
      });
    } catch (error) {
      const status = error.message === 'Access denied' ? 403 : 
                     error.message === 'Vehicle not found' ? 404 : 500;
      
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async uploadDocument(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      const { vehicleId } = req.params;
      
      // Get Cloudinary URL from uploaded file
      const fileUrl = req.file.cloudinaryUrl || req.file.path;

      const result = await this.vehicleService.uploadDocument(
        vehicleId,
        fileUrl,
        req.user.userId
      );

      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        data: result
      });
    } catch (error) {
      const status = error.message === 'Access denied' ? 403 : 
                     error.message === 'Vehicle not found' ? 404 : 500;
      
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async getVehicleDocuments(req, res) {
    try {
      const { vehicleId } = req.params;
      const documents = await this.vehicleService.getVehicleDocuments(
        vehicleId,
        req.user.userId,
        req.user.role
      );

      res.json({
        success: true,
        count: documents.length,
        data: documents
      });
    } catch (error) {
      const status = error.message === 'Access denied' ? 403 : 
                     error.message === 'Vehicle not found' ? 404 : 500;
      
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async getVehicleStats(req, res) {
    try {
      const stats = await this.vehicleService.getVehicleStats(req.user.userId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async initiateTransfer(req, res) {
    try {
      const { vehicleId } = req.params;
      const { new_owner_identifier } = req.body;

      const result = await this.vehicleService.initiateOwnershipTransfer(
        vehicleId,
        req.user.userId,
        new_owner_identifier
      );

      res.status(201).json({
        success: true,
        message: 'Transfer request created successfully',
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async acceptTransfer(req, res) {
    try {
      const { vehicleId } = req.params;
      await this.vehicleService.acceptOwnershipTransfer(vehicleId, req.user.userId);

      res.json({
        success: true,
        message: 'Vehicle transfer accepted successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async rejectTransfer(req, res) {
    try {
      const { vehicleId } = req.params;
      await this.vehicleService.rejectOwnershipTransfer(vehicleId, req.user.userId);

      res.json({
        success: true,
        message: 'Vehicle transfer rejected successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getPendingTransfers(req, res) {
    try {
      const transfers = await this.vehicleService.getPendingTransfersForUser(req.user.userId);
      res.json({
        success: true,
        count: transfers.length,
        data: transfers
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async verifyVehicleByChassisNumber(req, res) {
    try {
      const { chassisNumber } = req.params;
      
      if (!chassisNumber || !chassisNumber.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Chassis number is required'
        });
      }

      const result = await this.vehicleService.verifyVehicleByChassisNumber(chassisNumber);

      res.json({
        success: true,
        exists: result.exists,
        data: result.vehicle || null
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getServiceRecordsByChassis(req, res) {
    try {
      const { chassisNumber } = req.params;
      const { dateFrom, dateTo, page, limit } = req.query;

      const filters = {
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        page: page ? parseInt(page, 10) : null,
        limit: limit ? parseInt(limit, 10) : null,
        offset: page && limit ? (parseInt(page, 10) - 1) * parseInt(limit, 10) : null
      };

      const requester = {
        userId: req.user?.userId,
        role: req.user?.role
      };

      const records = await this.vehicleService.getServiceRecordsByChassis(
        chassisNumber,
        filters,
        requester
      );

      res.json({
        success: true,
        data: records
      });
    } catch (error) {
      const status =
        error.message === 'Vehicle not found' ? 404 :
        error.message === 'Access denied' ? 403 : 500;

      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new VehicleController();