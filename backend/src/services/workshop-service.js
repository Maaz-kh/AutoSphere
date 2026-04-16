const PartRepository = require('../repositories/part-repository');
const ServiceRecordRepository = require('../repositories/service-record-repository');
const ProfileService = require('./profile-service');
const ServicesRepository = require('../repositories/service-repository');
const WorkshopsRepository = require('../repositories/workshops-repository');
const WorkshopServicesRepository = require('../repositories/workshop-services-repository');

class WorkshopService {
  constructor() {
    this.partRepository = PartRepository;
    this.serviceRecordRepository = ServiceRecordRepository;
  }

  async getWorkshopProfile(userId) {
    const profile = await ProfileService.getProfile(userId);
    if (profile.role !== 'workshop') {
      throw new Error('Workshop profile is only available for workshop accounts.');
    }
    return profile;
  }

  async listServicesCatalog() {
    return await ServicesRepository.listActive();
  }

  async listMyOfferedServices(userId) {
    const workshop = await WorkshopsRepository.findByUserId(userId);
    if (!workshop) throw new Error('Workshop not found.');
    return await WorkshopServicesRepository.listByWorkshopId(workshop.id);
  }

  async addMyOfferedServices(userId, services = []) {
    const workshop = await WorkshopsRepository.findByUserId(userId);
    if (!workshop) throw new Error('Workshop not found.');

    const serviceIds = services.map((s) => parseInt(s.service_id, 10)).filter((n) => Number.isFinite(n));
    const uniqueServiceIds = [...new Set(serviceIds)];
    if (uniqueServiceIds.length === 0) throw new Error('Please select at least one service.');

    const existing = await ServicesRepository.findByIds(uniqueServiceIds);
    const activeSet = new Set(existing.filter((s) => s.is_active).map((s) => s.id));
    const invalid = uniqueServiceIds.filter((id) => !activeSet.has(id));
    if (invalid.length > 0) throw new Error('One or more selected services are invalid or inactive.');

    const normalized = services
      .map((s) => ({
        service_id: parseInt(s.service_id, 10),
        price_min: s.price_min === '' || s.price_min === null || s.price_min === undefined ? null : parseFloat(s.price_min),
        price_max: s.price_max === '' || s.price_max === null || s.price_max === undefined ? null : parseFloat(s.price_max),
        is_active: s.is_active === undefined ? true : Boolean(s.is_active)
      }))
      .filter((s) => Number.isFinite(s.service_id) && activeSet.has(s.service_id));

    for (const s of normalized) {
      if (s.price_min != null && (!Number.isFinite(s.price_min) || s.price_min < 0)) {
        throw new Error('Price min must be a non-negative number.');
      }
      if (s.price_max != null && (!Number.isFinite(s.price_max) || s.price_max < 0)) {
        throw new Error('Price max must be a non-negative number.');
      }
      if (s.price_min != null && s.price_max != null && s.price_max < s.price_min) {
        throw new Error('Price max cannot be less than price min.');
      }
    }

    await WorkshopServicesRepository.createMany(workshop.id, normalized);
    return await WorkshopServicesRepository.listByWorkshopId(workshop.id);
  }

  async updateMyOfferedService(userId, workshopServiceId, data = {}) {
    const workshop = await WorkshopsRepository.findByUserId(userId);
    if (!workshop) throw new Error('Workshop not found.');
    const id = parseInt(workshopServiceId, 10);
    if (!Number.isFinite(id)) throw new Error('Invalid service ID.');

    const update = {};
    if (data.price_min !== undefined) {
      const val = data.price_min === '' || data.price_min === null ? null : parseFloat(data.price_min);
      if (val != null && (!Number.isFinite(val) || val < 0)) throw new Error('Price min must be a non-negative number.');
      update.price_min = val;
    }
    if (data.price_max !== undefined) {
      const val = data.price_max === '' || data.price_max === null ? null : parseFloat(data.price_max);
      if (val != null && (!Number.isFinite(val) || val < 0)) throw new Error('Price max must be a non-negative number.');
      update.price_max = val;
    }
    if (data.is_active !== undefined) {
      update.is_active = data.is_active === true || data.is_active === 'true' || data.is_active === '1';
    }
    if (update.price_min != null && update.price_max != null && update.price_max < update.price_min) {
      throw new Error('Price max cannot be less than price min.');
    }

    const updated = await WorkshopServicesRepository.updateByIdAndWorkshop(id, workshop.id, update);
    if (!updated) throw new Error('Service not found or access denied.');
    return await WorkshopServicesRepository.listByWorkshopId(workshop.id);
  }

  async removeMyOfferedService(userId, workshopServiceId) {
    const workshop = await WorkshopsRepository.findByUserId(userId);
    if (!workshop) throw new Error('Workshop not found.');
    const id = parseInt(workshopServiceId, 10);
    if (!Number.isFinite(id)) throw new Error('Invalid service ID.');
    const deleted = await WorkshopServicesRepository.deleteByIdAndWorkshop(id, workshop.id);
    if (!deleted) throw new Error('Service not found or access denied.');
    return true;
  }

  async createPart(partData, workshopId) {
    try {
      const { part_name, category, price, quantity } = partData;

      if (!part_name || !category || !price || quantity === undefined) {
        throw new Error('Part name, category, price, and quantity are required');
      }

      if (!['parts', 'fluids', 'filters'].includes(category)) {
        throw new Error('Invalid category. Must be one of: parts, fluids, filters');
      }

      if (price < 0) {
        throw new Error('Price cannot be negative');
      }

      if (quantity < 0) {
        throw new Error('Quantity cannot be negative');
      }

      const partId = await this.partRepository.create({
        workshop_id: workshopId,
        part_name: part_name.trim(),
        category: category,
        price: parseFloat(price),
        quantity: parseInt(quantity, 10)
      });

      return await this.partRepository.findById(partId);
    } catch (error) {
      throw new Error(`Failed to create part: ${error.message}`);
    }
  }

  async getWorkshopParts(workshopId) {
    try {
      return await this.partRepository.findByWorkshop(workshopId);
    } catch (error) {
      throw new Error(`Failed to get workshop parts: ${error.message}`);
    }
  }

  async getPartById(partId, workshopId) {
    try {
      const part = await this.partRepository.findByIdAndWorkshop(partId, workshopId);
      
      if (!part) {
        throw new Error('Part not found or access denied');
      }

      return part;
    } catch (error) {
      throw new Error(`Failed to get part: ${error.message}`);
    }
  }

  async updatePart(partId, partData, workshopId) {
    try {
      // Verify part belongs to workshop
      const existingPart = await this.partRepository.findByIdAndWorkshop(partId, workshopId);
      
      if (!existingPart) {
        throw new Error('Part not found or access denied');
      }

      const updateData = {};

      if (partData.part_name !== undefined) {
        updateData.part_name = partData.part_name.trim();
      }

      if (partData.category !== undefined) {
        if (!['parts', 'fluids', 'filters'].includes(partData.category)) {
          throw new Error('Invalid category. Must be one of: parts, fluids, filters');
        }
        updateData.category = partData.category;
      }

      if (partData.price !== undefined) {
        const price = parseFloat(partData.price);
        if (price < 0) {
          throw new Error('Price cannot be negative');
        }
        updateData.price = price;
      }

      if (partData.quantity !== undefined) {
        const quantity = parseInt(partData.quantity, 10);
        if (quantity < 0) {
          throw new Error('Quantity cannot be negative');
        }
        updateData.quantity = quantity;
      }

      if (Object.keys(updateData).length === 0) {
        throw new Error('No fields to update');
      }

      await this.partRepository.update(partId, updateData);
      return await this.partRepository.findById(partId);
    } catch (error) {
      throw new Error(`Failed to update part: ${error.message}`);
    }
  }

  async deletePart(partId, workshopId) {
    try {
      // Verify part belongs to workshop
      const existingPart = await this.partRepository.findByIdAndWorkshop(partId, workshopId);
      
      if (!existingPart) {
        throw new Error('Part not found or access denied');
      }

      const deleted = await this.partRepository.delete(partId);
      
      if (deleted === 0) {
        throw new Error('Failed to delete part');
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to delete part: ${error.message}`);
    }
  }

  async trackServiceRecord(recordData, workshopId) {
    try {
      const {
        recordId,
        vehicleId,
        transactionHash,
        serviceDate,
        totalCharges
      } = recordData;

      if (!recordId || !vehicleId || !transactionHash || !serviceDate || totalCharges === undefined) {
        throw new Error('All fields are required: recordId, vehicleId, transactionHash, serviceDate, totalCharges');
      }

      // Check if record already exists
      const existing = await this.serviceRecordRepository.findByRecordId(recordId);
      if (existing) {
        throw new Error('Service record already tracked');
      }

      const id = await this.serviceRecordRepository.create({
        record_id: recordId.toString(),
        vehicle_id: vehicleId,
        workshop_id: workshopId,
        transaction_hash: transactionHash,
        service_date: new Date(serviceDate),
        total_charges: parseFloat(totalCharges)
      });

      return await this.serviceRecordRepository.findById(id);
    } catch (error) {
      throw new Error(`Failed to track service record: ${error.message}`);
    }
  }

  async getServiceRecords(workshopId, filters = {}) {
    try {
      const records = await this.serviceRecordRepository.findByWorkshop(workshopId, filters);
      const total = await this.serviceRecordRepository.countByWorkshop(workshopId, filters);
      
      return {
        records,
        total,
        page: filters.page || 1,
        limit: filters.limit || null
      };
    } catch (error) {
      throw new Error(`Failed to get service records: ${error.message}`);
    }
  }
}

module.exports = new WorkshopService();

