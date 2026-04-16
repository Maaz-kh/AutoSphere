const VehicleRepository = require('../repositories/vehicle-repository');
const VehicleTransferRepository = require('../repositories/vehicle-transfer-repository');
const ServiceRecordRepository = require('../repositories/service-record-repository');
const UserRepository = require('../repositories/user-repository');
const EmailService = require('./email-service');
const database = require('../config/database');

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{11,17}$/i;
const TRANSFER_EXPIRY_HOURS = 48;

class VehicleService {
  constructor() {
    this.vehicleRepository = VehicleRepository;
    this.vehicleTransferRepository = VehicleTransferRepository;
    this.userRepository = UserRepository;
    this.emailService = EmailService;
    this.serviceRecordRepository = ServiceRecordRepository;
  }

  async registerVehicle(vehicleData, userId, uploadedFiles = {}) {
    try {
      if (!vehicleData.chassis_number) {
        throw new Error('Chassis number is required.');
      }

      if (!vehicleData.engine_number) {
        throw new Error('Engine number is required.');
      }

      await this.ensureVehicleUniqueness(
        vehicleData.registration_number,
        vehicleData.chassis_number
      );

      if (!VIN_REGEX.test(vehicleData.chassis_number)) {
        throw new Error('Provided chassis number is invalid. Please double-check and try again.');
      }

      // Validate registration certificate is present
      const registrationCert = uploadedFiles.registration_certificate?.[0];
      if (!registrationCert) {
        throw new Error('Registration certificate is required.');
      }

      const frontImage = uploadedFiles.front_image?.[0];
      const backImage = uploadedFiles.back_image?.[0];
      const interiorImage = uploadedFiles.interior_image?.[0];

      if (!frontImage || !backImage || !interiorImage) {
        throw new Error('Front, back, and interior images are required.');
      }

      // Prepare image paths (Cloudinary URLs)
      const registrationCertPath = registrationCert.cloudinaryUrl || registrationCert.path;
      const additionalDocs = uploadedFiles.additional_documents || [];
      const additionalDocsPaths = additionalDocs.length > 0
        ? additionalDocs.map(file => file.cloudinaryUrl || file.path)
        : null;

      if (vehicleData.purchase_date) {
        const purchaseDate = new Date(vehicleData.purchase_date);
        if (Number.isNaN(purchaseDate.getTime())) {
          throw new Error('Purchase date is invalid.');
        }
        vehicleData.purchase_date = purchaseDate;
      }

      vehicleData.owner_id = userId;
      vehicleData.registration_number = vehicleData.registration_number.trim().toUpperCase();
      vehicleData.chassis_number = vehicleData.chassis_number.trim().toUpperCase();
      vehicleData.engine_number = vehicleData.engine_number.trim().toUpperCase();
      vehicleData.front_image_path = frontImage ? (frontImage.cloudinaryUrl || frontImage.path) : null;
      vehicleData.back_image_path = backImage ? (backImage.cloudinaryUrl || backImage.path) : null;
      vehicleData.interior_image_path = interiorImage ? (interiorImage.cloudinaryUrl || interiorImage.path) : null;
      vehicleData.registration_certificate_path = registrationCertPath;
      vehicleData.additional_documents_paths = additionalDocsPaths;

      const vehicleId = await this.vehicleRepository.createWithHistory(
        vehicleData,
        userId
      );

      const vehicle = await this.vehicleRepository.findWithOwnerDetails(vehicleId);

      return vehicle;
    } catch (error) {
      throw new Error(`Failed to register vehicle: ${error.message}`);
    }
  }

  async getUserVehicles(userId) {
    try {
      return await this.vehicleRepository.findByOwner(userId);
    } catch (error) {
      throw new Error(`Failed to get user vehicles: ${error.message}`);
    }
  }

  async getVehicleById(vehicleId, userId, userRole) {
    try {
      const vehicle = await this.vehicleRepository.findWithOwnerDetails(vehicleId);

      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      // Check ownership or admin access
      if (vehicle.owner_id !== userId && userRole !== 'admin') {
        throw new Error('Access denied');
      }

      return vehicle;
    } catch (error) {
      throw new Error(`Failed to get vehicle: ${error.message}`);
    }
  }

  async updateVehicle(vehicleId, updateData, userId, userRole) {
    try {
      const vehicle = await this.vehicleRepository.findById(vehicleId);

      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      if (vehicle.owner_id !== userId && userRole !== 'admin') {
        throw new Error('Access denied');
      }

      await this.vehicleRepository.updateCondition(vehicleId, updateData, userId);
      
      return await this.vehicleRepository.findById(vehicleId);
    } catch (error) {
      throw new Error(`Failed to update vehicle: ${error.message}`);
    }
  }

  async deleteVehicle(vehicleId, userId, userRole) {
    try {
      const vehicle = await this.vehicleRepository.findById(vehicleId);

      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      if (vehicle.owner_id !== userId && userRole !== 'admin') {
        throw new Error('Access denied');
      }

      await this.vehicleRepository.softDelete(vehicleId);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete vehicle: ${error.message}`);
    }
  }

  async getVehicleHistory(vehicleId, userId, userRole) {
    try {
      const vehicle = await this.vehicleRepository.findById(vehicleId);

      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      if (vehicle.owner_id !== userId && userRole !== 'admin') {
        throw new Error('Access denied');
      }

      return await this.vehicleRepository.getHistory(vehicleId);
    } catch (error) {
      throw new Error(`Failed to get vehicle history: ${error.message}`);
    }
  }

  async uploadDocument(vehicleId, fileUrl, userId) {
    try {
      const vehicle = await this.vehicleRepository.findById(vehicleId);

      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      if (vehicle.owner_id !== userId) {
        throw new Error('Access denied');
      }

      // Get existing additional documents or initialize empty array
      const existingDocs = vehicle.additional_documents_paths
        ? (typeof vehicle.additional_documents_paths === 'string'
            ? JSON.parse(vehicle.additional_documents_paths)
            : vehicle.additional_documents_paths)
        : [];

      // Add new document URL
      existingDocs.push(fileUrl);

      // Update vehicle with new document
      await this.vehicleRepository.update(vehicleId, {
        additional_documents_paths: JSON.stringify(existingDocs)
      });

      await this.vehicleRepository.addHistoryEntry(
        vehicleId,
        'document_update',
        'Additional document uploaded',
        userId,
        { file_path: fileUrl }
      );

      return {
        file_path: fileUrl
      };
    } catch (error) {
      throw new Error(`Failed to upload document: ${error.message}`);
    }
  }

  async getVehicleDocuments(vehicleId, userId, userRole) {
    try {
      const vehicle = await this.vehicleRepository.findById(vehicleId);

      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      if (vehicle.owner_id !== userId && userRole !== 'admin') {
        throw new Error('Access denied');
      }

      // Return documents from vehicle record
      const documents = {
        registration_certificate_path: vehicle.registration_certificate_path,
        additional_documents_paths: vehicle.additional_documents_paths 
          ? (typeof vehicle.additional_documents_paths === 'string' 
              ? JSON.parse(vehicle.additional_documents_paths) 
              : vehicle.additional_documents_paths)
          : []
      };

      return documents;
    } catch (error) {
      throw new Error(`Failed to get vehicle documents: ${error.message}`);
    }
  }

  async getVehicleStats(userId) {
    try {
      const totalVehicles = await this.vehicleRepository.countByOwner(userId);
      const vehicles = await this.vehicleRepository.findByOwner(userId);

      const stats = {
        total_vehicles: totalVehicles,
        by_fuel_type: {},
        by_transmission: {}
      };

      vehicles.forEach(vehicle => {
        if (vehicle.fuel_type) {
          stats.by_fuel_type[vehicle.fuel_type] = (stats.by_fuel_type[vehicle.fuel_type] || 0) + 1;
        }

        if (vehicle.transmission_type) {
          stats.by_transmission[vehicle.transmission_type] =
            (stats.by_transmission[vehicle.transmission_type] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      throw new Error(`Failed to get vehicle stats: ${error.message}`);
    }
  }

  async initiateOwnershipTransfer(vehicleId, ownerId, newOwnerIdentifier) {
    try {
      const vehicle = await this.vehicleRepository.findById(vehicleId);

      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      if (vehicle.owner_id !== ownerId) {
        throw new Error('Only the current owner can initiate a transfer');
      }

      const identifier = (newOwnerIdentifier || '').trim();

      if (!identifier) {
        throw new Error('Please provide the new owner\'s email or user ID.');
      }

      const newOwner = await this.resolveTransferTarget(identifier);

      if (!newOwner) {
        throw new Error('Unable to find the specified user. Please verify the email or user ID.');
      }

      if (!newOwner.is_active || !newOwner.is_verified) {
        throw new Error('The new owner must have an active and verified account.');
      }

      if (newOwner.id === ownerId) {
        throw new Error('You cannot transfer ownership to yourself.');
      }

      const activeRequest = await this.vehicleTransferRepository.findActiveByVehicle(vehicleId);

      if (activeRequest) {
        if (this.isTransferExpired(activeRequest.expires_at)) {
          await this.vehicleTransferRepository.markExpired(activeRequest.id);
        } else {
          throw new Error('A transfer request is already pending for this vehicle.');
        }
      }

      const expiresAt = new Date(Date.now() + TRANSFER_EXPIRY_HOURS * 60 * 60 * 1000);
      const requestId = await this.vehicleTransferRepository.createRequest({
        vehicle_id: vehicleId,
        current_owner_id: ownerId,
        new_owner_id: newOwner.id,
        expires_at: expiresAt
      });

      await this.vehicleRepository.addHistoryEntry(
        vehicleId,
        'transfer_request',
        `Ownership transfer requested for ${newOwner.email}`,
        ownerId,
        { request_id: requestId, new_owner_id: newOwner.id }
      );

      const currentOwner = await this.userRepository.findById(ownerId);
      await this.emailService.sendOwnershipTransferRequestEmail({
        to: newOwner.email,
        vehicle,
        requester: currentOwner,
        expiresAt
      });

      return {
        request_id: requestId,
        status: 'pending',
        expires_at: expiresAt.toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to initiate transfer: ${error.message}`);
    }
  }

  async acceptOwnershipTransfer(vehicleId, userId) {
    try {
      const request = await this.vehicleTransferRepository.findPendingForNewOwner(vehicleId, userId);

      if (!request) {
        throw new Error('No pending transfer request found for this vehicle.');
      }

      if (this.isTransferExpired(request.expires_at)) {
        await this.vehicleTransferRepository.markExpired(request.id);
        throw new Error('This transfer request has expired.');
      }

      await database.transaction(async (connection) => {
        await this.vehicleRepository.updateOwner(vehicleId, userId, connection);
        await connection.query(
          `UPDATE vehicle_transfer_requests 
           SET status = 'accepted', responded_at = NOW() 
           WHERE id = ?`,
          [request.id]
        );

        await this.vehicleRepository.insertHistoryEntry(
          connection,
          vehicleId,
          'transfer_completed',
          'Vehicle ownership transferred to new owner',
          userId,
          {
            request_id: request.id,
            previous_owner_id: request.current_owner_id,
            new_owner_id: userId
          }
        );
      });

      const vehicle = await this.vehicleRepository.findById(vehicleId);
      const currentOwner = await this.userRepository.findById(request.current_owner_id);
      const newOwner = await this.userRepository.findById(userId);

      await this.emailService.sendOwnershipTransferStatusEmail({
        vehicle,
        request,
        status: 'accepted',
        currentOwner,
        newOwner
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to accept transfer: ${error.message}`);
    }
  }

  async rejectOwnershipTransfer(vehicleId, userId) {
    try {
      const request = await this.vehicleTransferRepository.findPendingForNewOwner(vehicleId, userId);

      if (!request) {
        throw new Error('No pending transfer request found for this vehicle.');
      }

      if (this.isTransferExpired(request.expires_at)) {
        await this.vehicleTransferRepository.markExpired(request.id);
        throw new Error('This transfer request has expired.');
      }

      await database.transaction(async (connection) => {
        await connection.query(
          `UPDATE vehicle_transfer_requests 
           SET status = 'rejected', responded_at = NOW() 
           WHERE id = ?`,
          [request.id]
        );

        await this.vehicleRepository.insertHistoryEntry(
          connection,
          vehicleId,
          'transfer_rejected',
          'Vehicle ownership transfer was rejected by the recipient',
          userId,
          {
            request_id: request.id,
            previous_owner_id: request.current_owner_id,
            rejecting_user_id: userId
          }
        );
      });

      const vehicle = await this.vehicleRepository.findById(vehicleId);
      const currentOwner = await this.userRepository.findById(request.current_owner_id);
      const newOwner = await this.userRepository.findById(userId);

      await this.emailService.sendOwnershipTransferStatusEmail({
        vehicle,
        request,
        status: 'rejected',
        currentOwner,
        newOwner
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to reject transfer: ${error.message}`);
    }
  }

  async getPendingTransfersForUser(userId) {
    try {
      return await this.vehicleTransferRepository.getPendingForUser(userId);
    } catch (error) {
      throw new Error(`Failed to load pending transfers: ${error.message}`);
    }
  }

  async ensureVehicleUniqueness(registrationNumber, chassisNumber) {
    const existingRegistration = await this.vehicleRepository.findByRegistrationNumber(registrationNumber);
    if (existingRegistration) {
      throw new Error('Vehicle with this registration number already exists.');
    }

    const normalizedChassis = chassisNumber.trim().toUpperCase();
    const existingChassis = await this.vehicleRepository.findByChassisNumber(normalizedChassis);

    if (existingChassis) {
      throw new Error('Vehicle with this chassis number already exists on the platform.');
    }
  }

  async verifyVehicleByChassisNumber(chassisNumber) {
    try {
      if (!chassisNumber || !chassisNumber.trim()) {
        return { exists: false, vehicle: null };
      }

      const normalizedChassis = chassisNumber.trim().toUpperCase();
      const vehicle = await this.vehicleRepository.findByChassisNumber(normalizedChassis);

      if (!vehicle) {
        return { exists: false, vehicle: null };
      }

      // Check if vehicle is active
      if (vehicle.is_active === false || vehicle.is_active === 0) {
        return { exists: false, vehicle: null };
      }

      return { exists: true, vehicle };
    } catch (error) {
      throw new Error(`Failed to verify vehicle: ${error.message}`);
    }
  }

  async resolveTransferTarget(identifier) {
    if (!identifier) {
      return null;
    }

    if (/^\d+$/.test(identifier)) {
      const user = await this.userRepository.findById(parseInt(identifier, 10));
      return user;
    }

    return await this.userRepository.findByEmail(identifier.toLowerCase());
  }

  isTransferExpired(expiresAt) {
    return new Date(expiresAt) <= new Date();
  }

  async getServiceRecordsByChassis(chassisNumber, filters = {}, requester) {
    try {
      if (!chassisNumber || !chassisNumber.trim()) {
        throw new Error('Chassis number is required');
      }

      const normalizedChassis = chassisNumber.trim().toUpperCase();
      const vehicle = await this.vehicleRepository.findByChassisNumber(normalizedChassis);

      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      // Authorization: owner or admin
      if (requester?.role !== 'admin' && vehicle.owner_id !== requester?.userId) {
        throw new Error('Access denied');
      }

      const records = await this.serviceRecordRepository.findByVehicle(normalizedChassis, filters);
      return records;
    } catch (error) {
      throw new Error(`Failed to get service records: ${error.message}`);
    }
  }
}

module.exports = new VehicleService();