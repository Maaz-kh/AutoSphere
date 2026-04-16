const database = require('../config/database');

class WorkshopAppointmentRepository {
  async create(data) {
    return await database.transaction(async (connection) => {
      const [result] = await connection.query(
        `INSERT INTO workshop_appointments
          (workshop_id, vehicle_owner_id, vehicle_id, preferred_at, notes, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [
          data.workshop_id,
          data.vehicle_owner_id,
          data.vehicle_id,
          data.preferred_at || null,
          data.notes || null
        ]
      );

      const appointmentId = result.insertId;
      if (Array.isArray(data.requested_service_ids) && data.requested_service_ids.length > 0) {
        const placeholders = data.requested_service_ids.map(() => '(?, ?)').join(', ');
        const values = [];
        for (const serviceId of data.requested_service_ids) {
          values.push(appointmentId, serviceId);
        }
        await connection.query(
          `INSERT INTO workshop_appointment_services (appointment_id, service_id)
           VALUES ${placeholders}`,
          values
        );
      }

      return appointmentId;
    });
  }

  async findById(appointmentId) {
    const id = parseInt(appointmentId, 10);
    if (!Number.isFinite(id) || id < 1) return null;
    const rows = await database.query(
      `SELECT a.*,
              w.name AS workshop_name,
              w.city AS workshop_city,
              w.country AS workshop_country,
              v.registration_number,
              v.make,
              v.model,
              v.variant,
              v.model_year,
              v.fuel_type,
              v.transmission_type,
              v.body_type,
              v.mileage_km,
              v.color,
              up.full_name AS owner_name,
              u.email AS owner_email,
              up.phone_number AS owner_phone
       FROM workshop_appointments a
       JOIN workshops w ON w.id = a.workshop_id
       JOIN users u ON u.id = a.vehicle_owner_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN vehicles v ON v.id = a.vehicle_id
       WHERE a.id = ?
       LIMIT 1`,
      [id]
    );
    if (rows.length === 0) return null;
    const [appointment] = await this.attachRequestedServices(rows);
    return appointment || null;
  }

  async listByOwnerUserId(ownerUserId, { status = null, limit = 20, offset = 0 } = {}) {
    const where = ['a.vehicle_owner_id = ?'];
    const params = [ownerUserId];
    if (status) {
      where.push('a.status = ?');
      params.push(status);
    }
    const rows = await database.query(
      `SELECT a.*,
              w.name AS workshop_name,
              w.city AS workshop_city,
              w.country AS workshop_country,
              r.id AS review_id
       FROM workshop_appointments a
       JOIN workshops w ON w.id = a.workshop_id
       LEFT JOIN workshop_reviews r ON r.appointment_id = a.id
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return await this.attachRequestedServices(rows);
  }

  async listByWorkshopId(workshopId, { status = null, limit = 20, offset = 0 } = {}) {
    const where = ['a.workshop_id = ?'];
    const params = [workshopId];
    if (status) {
      where.push('a.status = ?');
      params.push(status);
    }
    const rows = await database.query(
      `SELECT a.*,
              v.registration_number,
              v.make,
              v.model,
              v.variant,
              v.model_year,
              v.fuel_type,
              v.transmission_type,
              v.body_type,
              v.mileage_km,
              v.color,
              up.full_name AS owner_name,
              u.email AS owner_email,
              up.phone_number AS owner_phone
       FROM workshop_appointments a
       JOIN users u ON u.id = a.vehicle_owner_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN vehicles v ON v.id = a.vehicle_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return await this.attachRequestedServices(rows);
  }

  async countByOwnerUserId(ownerUserId, { status = null } = {}) {
    const where = ['vehicle_owner_id = ?'];
    const params = [ownerUserId];
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const rows = await database.query(
      `SELECT COUNT(*) AS count
       FROM workshop_appointments
       WHERE ${where.join(' AND ')}`,
      params
    );
    return rows?.[0]?.count ?? 0;
  }

  async countByWorkshopId(workshopId, { status = null } = {}) {
    const where = ['workshop_id = ?'];
    const params = [workshopId];
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const rows = await database.query(
      `SELECT COUNT(*) AS count
       FROM workshop_appointments
       WHERE ${where.join(' AND ')}`,
      params
    );
    return rows?.[0]?.count ?? 0;
  }

  async updateById(appointmentId, patch = {}) {
    const id = parseInt(appointmentId, 10);
    if (!Number.isFinite(id) || id < 1) return 0;
    const keys = Object.keys(patch);
    if (keys.length === 0) return 0;
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const result = await database.query(
      `UPDATE workshop_appointments SET ${setClause} WHERE id = ?`,
      [...keys.map((k) => patch[k]), id]
    );
    return result.affectedRows || 0;
  }

  async listRequestedServicesByAppointmentIds(appointmentIds = []) {
    if (!Array.isArray(appointmentIds) || appointmentIds.length === 0) {
      return [];
    }

    const placeholders = appointmentIds.map(() => '?').join(', ');
    return await database.query(
      `SELECT was.appointment_id,
              was.service_id,
              s.category,
              s.name
       FROM workshop_appointment_services was
       JOIN services s ON s.id = was.service_id
       WHERE was.appointment_id IN (${placeholders})
       ORDER BY s.category ASC, s.name ASC`,
      appointmentIds
    );
  }

  async attachRequestedServices(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const appointmentIds = rows.map((row) => row.id);
    const linkedServices = await this.listRequestedServicesByAppointmentIds(appointmentIds);
    const servicesByAppointmentId = new Map();

    for (const service of linkedServices) {
      const appointmentId = Number(service.appointment_id);
      if (!servicesByAppointmentId.has(appointmentId)) {
        servicesByAppointmentId.set(appointmentId, []);
      }
      servicesByAppointmentId.get(appointmentId).push({
        id: Number(service.service_id),
        name: service.name,
        category: service.category
      });
    }

    return rows.map((row) => {
      const requestedServices = servicesByAppointmentId.get(Number(row.id)) || [];
      return {
        ...row,
        requested_services: requestedServices,
        requested_service_ids: requestedServices.map((service) => service.id),
        requested_service_name: requestedServices.map((service) => service.name).join(', ') || null
      };
    });
  }
}

module.exports = new WorkshopAppointmentRepository();

