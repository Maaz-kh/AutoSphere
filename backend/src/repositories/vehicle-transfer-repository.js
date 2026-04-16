const BaseRepository = require('./base-repository');

class VehicleTransferRepository extends BaseRepository {
  constructor() {
    super('vehicle_transfer_requests');
  }

  async createRequest(data) {
    return await this.create(data);
  }

  async findActiveByVehicle(vehicleId) {
    const results = await this.db.query(
      `SELECT * FROM vehicle_transfer_requests 
       WHERE vehicle_id = ? AND status = 'pending'
       LIMIT 1`,
      [vehicleId]
    );
    return results.length ? results[0] : null;
  }

  async findPendingForNewOwner(vehicleId, newOwnerId) {
    const results = await this.db.query(
      `SELECT * FROM vehicle_transfer_requests 
       WHERE vehicle_id = ? AND new_owner_id = ? AND status = 'pending'
       LIMIT 1`,
      [vehicleId, newOwnerId]
    );
    return results.length ? results[0] : null;
  }

  async getPendingForUser(userId) {
    return await this.db.query(
      `SELECT vtr.*, v.registration_number, v.make, v.model, v.year
       FROM vehicle_transfer_requests vtr
       JOIN vehicles v ON vtr.vehicle_id = v.id
       WHERE vtr.new_owner_id = ? AND vtr.status = 'pending'
       ORDER BY vtr.created_at DESC`,
      [userId]
    );
  }

  async updateStatus(requestId, status, extraFields = {}) {
    return await this.update(requestId, {
      status,
      ...extraFields
    });
  }

  async markExpired(requestId) {
    return await this.updateStatus(requestId, 'expired', { responded_at: new Date() });
  }
}

module.exports = new VehicleTransferRepository();

