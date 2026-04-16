const BaseRepository = require('./base-repository');

class VehicleRepository extends BaseRepository {
  constructor() {
    super('vehicles');
  }

  async findByOwner(ownerId) {
    try {
      return await this.findAll({ owner_id: ownerId, is_active: true }, 'created_at DESC');
    } catch (error) {
      throw new Error(`Error finding vehicles by owner: ${error.message}`);
    }
  }

  async findByRegistrationNumber(registrationNumber) {
    try {
      const results = await this.db.query(
        'SELECT * FROM vehicles WHERE registration_number = ?',
        [registrationNumber]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding vehicle by registration: ${error.message}`);
    }
  }

  async findWithOwnerDetails(vehicleId) {
    try {
      const results = await this.db.query(
        `SELECT v.*, u.email as owner_email, p.full_name as owner_name
         FROM vehicles v
         JOIN users u ON v.owner_id = u.id
         LEFT JOIN user_profiles p ON u.id = p.user_id
         WHERE v.id = ?`,
        [vehicleId]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding vehicle with owner details: ${error.message}`);
    }
  }

  async createWithHistory(vehicleData, userId) {
    return await this.db.transaction(async (connection) => {
      const [vehicleResult] = await connection.query(
        `INSERT INTO vehicles 
         (owner_id, registration_number, chassis_number, engine_number, make, model, variant, 
          model_year, body_type, fuel_type, transmission_type, assembly, engine_capacity,
          mileage_km, color, registered_city, purchase_date, front_image_path, back_image_path, 
          interior_image_path, registration_certificate_path, additional_documents_paths)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vehicleData.owner_id,
          vehicleData.registration_number,
          vehicleData.chassis_number,
          vehicleData.engine_number,
          vehicleData.make,
          vehicleData.model,
          vehicleData.variant,
          vehicleData.model_year,
          vehicleData.body_type,
          vehicleData.fuel_type,
          vehicleData.transmission_type,
          vehicleData.assembly,
          vehicleData.engine_capacity,
          vehicleData.mileage_km || null,
          vehicleData.color || null,
          vehicleData.registered_city || null,
          vehicleData.purchase_date || null,
          vehicleData.front_image_path || null,
          vehicleData.back_image_path || null,
          vehicleData.interior_image_path || null,
          vehicleData.registration_certificate_path,
          vehicleData.additional_documents_paths ? JSON.stringify(vehicleData.additional_documents_paths) : null
        ]
      );

      const vehicleId = vehicleResult.insertId;

      await this.insertHistoryEntry(connection, vehicleId, 'ownership_change', 'Vehicle registered on platform', userId, null);

      return vehicleId;
    });
  }

  async softDelete(vehicleId) {
    try {
      return await this.update(vehicleId, { is_active: false });
    } catch (error) {
      throw new Error(`Error soft deleting vehicle: ${error.message}`);
    }
  }

  async updateCondition(vehicleId, conditionData, userId) {
    return await this.db.transaction(async (connection) => {
      const setClause = Object.keys(conditionData)
        .map(key => `${key} = ?`)
        .join(', ');

      await connection.query(
        `UPDATE vehicles SET ${setClause} WHERE id = ?`,
        [...Object.values(conditionData), vehicleId]
      );

      const updateDescription = Object.keys(conditionData)
        .map(key => `${key} updated`)
        .join(', ');

      await this.insertHistoryEntry(
        connection,
        vehicleId,
        'condition_update',
        updateDescription,
        userId,
        conditionData
      );

      return true;
    });
  }

  async getHistory(vehicleId) {
    try {
      return await this.db.query(
        `SELECT h.*, u.email as performed_by_email, p.full_name as performed_by_name
         FROM vehicle_history h
         LEFT JOIN users u ON h.performed_by = u.id
         LEFT JOIN user_profiles p ON u.id = p.user_id
         WHERE h.vehicle_id = ?
         ORDER BY h.event_date DESC`,
        [vehicleId]
      );
    } catch (error) {
      throw new Error(`Error getting vehicle history: ${error.message}`);
    }
  }

  async findByMakeModel(make, model) {
    try {
      return await this.db.query(
        'SELECT * FROM vehicles WHERE make = ? AND model = ? AND is_active = TRUE',
        [make, model]
      );
    } catch (error) {
      throw new Error(`Error finding vehicles by make/model: ${error.message}`);
    }
  }

  async countByOwner(ownerId) {
    try {
      return await this.count({ owner_id: ownerId, is_active: true });
    } catch (error) {
      throw new Error(`Error counting vehicles by owner: ${error.message}`);
    }
  }

  async findByChassisNumber(chassisNumber) {
    try {
      const results = await this.db.query(
        'SELECT * FROM vehicles WHERE chassis_number = ?',
        [chassisNumber]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding vehicle by chassis number: ${error.message}`);
    }
  }


  async addHistoryEntry(vehicleId, eventType, description, performedBy, metadata = null) {
    try {
      await this.db.query(
        `INSERT INTO vehicle_history 
         (vehicle_id, event_type, event_description, performed_by, metadata)
         VALUES (?, ?, ?, ?, ?)`,
        [
          vehicleId,
          eventType,
          description,
          performedBy || null,
          metadata ? JSON.stringify(metadata) : null
        ]
      );
    } catch (error) {
      throw new Error(`Error writing vehicle history: ${error.message}`);
    }
  }


  async updateOwner(vehicleId, newOwnerId, connection = null) {
    try {
      if (connection) {
        await connection.query(
          'UPDATE vehicles SET owner_id = ? WHERE id = ?',
          [newOwnerId, vehicleId]
        );
        return true;
      }

      return await this.update(vehicleId, { owner_id: newOwnerId });
    } catch (error) {
      throw new Error(`Error updating vehicle owner: ${error.message}`);
    }
  }

  async insertDocumentRecord(connection, vehicleId, document) {
    await connection.query(
      `INSERT INTO vehicle_documents 
       (vehicle_id, document_type, document_name, file_path, expiry_date, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        vehicleId,
        document.document_type,
        document.document_name,
        document.file_path,
        document.expiry_date || null,
        document.metadata ? JSON.stringify(document.metadata) : null
      ]
    );
  }

  async insertHistoryEntry(connection, vehicleId, eventType, description, performedBy, metadata) {
    await connection.query(
      `INSERT INTO vehicle_history 
       (vehicle_id, event_type, event_description, performed_by, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [
        vehicleId,
        eventType,
        description,
        performedBy || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  }
}

module.exports = new VehicleRepository();