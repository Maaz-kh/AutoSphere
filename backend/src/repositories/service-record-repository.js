const BaseRepository = require('./base-repository');

class ServiceRecordRepository extends BaseRepository {
  constructor() {
    super('service_records');
  }

  async create(recordData) {
    try {
      const {
        record_id,
        vehicle_id,
        workshop_id,
        transaction_hash,
        service_date,
        total_charges
      } = recordData;

      const result = await this.db.query(
        `INSERT INTO service_records 
         (record_id, vehicle_id, workshop_id, transaction_hash, service_date, total_charges)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          record_id,
          vehicle_id,
          workshop_id,
          transaction_hash,
          service_date,
          total_charges
        ]
      );
      return result.insertId;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Service record already tracked');
      }
      throw new Error(`Error creating service record: ${error.message}`);
    }
  }

  async findByWorkshop(workshopId, filters = {}) {
    try {
      let query = 'SELECT * FROM service_records WHERE workshop_id = ?';
      const params = [workshopId];

      // Add chassis number filter
      if (filters.chassisNumber) {
        query += ' AND vehicle_id = ?';
        params.push(filters.chassisNumber);
      }

      // Add date range filter
      if (filters.dateFrom) {
        query += ' AND service_date >= ?';
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        query += ' AND service_date <= ?';
        params.push(filters.dateTo);
      }

      query += ' ORDER BY service_date DESC';

      // Add pagination if needed
      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(filters.limit, 10));
      }

      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(parseInt(filters.offset, 10));
      }

      return await this.db.query(query, params);
    } catch (error) {
      throw new Error(`Error finding service records by workshop: ${error.message}`);
    }
  }

  async countByWorkshop(workshopId, filters = {}) {
    try {
      let query = 'SELECT COUNT(*) as count FROM service_records WHERE workshop_id = ?';
      const params = [workshopId];

      if (filters.chassisNumber) {
        query += ' AND vehicle_id = ?';
        params.push(filters.chassisNumber);
      }

      if (filters.dateFrom) {
        query += ' AND service_date >= ?';
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        query += ' AND service_date <= ?';
        params.push(filters.dateTo);
      }

      const results = await this.db.query(query, params);
      return results[0]?.count || 0;
    } catch (error) {
      throw new Error(`Error counting service records: ${error.message}`);
    }
  }

  async findByRecordId(recordId) {
    try {
      const results = await this.db.query(
        'SELECT * FROM service_records WHERE record_id = ?',
        [recordId]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding service record by record ID: ${error.message}`);
    }
  }

  async findByVehicle(vehicleId, filters = {}) {
    try {
      let query = 'SELECT * FROM service_records WHERE vehicle_id = ?';
      const params = [vehicleId];

      if (filters.dateFrom) {
        query += ' AND service_date >= ?';
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        query += ' AND service_date <= ?';
        params.push(filters.dateTo);
      }

      query += ' ORDER BY service_date DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(filters.limit, 10));
      }

      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(parseInt(filters.offset, 10));
      }

      return await this.db.query(query, params);
    } catch (error) {
      throw new Error(`Error finding service records by vehicle: ${error.message}`);
    }
  }
}

module.exports = new ServiceRecordRepository();

