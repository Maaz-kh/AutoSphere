const database = require('../config/database');

class WorkshopReviewRepository {
  async create({ appointment_id, workshop_id, vehicle_owner_id, rating, comment = null }) {
    const result = await database.query(
      `INSERT INTO workshop_reviews
        (appointment_id, workshop_id, vehicle_owner_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)`,
      [appointment_id, workshop_id, vehicle_owner_id, rating, comment]
    );
    return result.insertId;
  }

  async findByAppointmentId(appointmentId) {
    const id = parseInt(appointmentId, 10);
    if (!Number.isFinite(id) || id < 1) return null;
    const rows = await database.query(
      `SELECT * FROM workshop_reviews WHERE appointment_id = ? LIMIT 1`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async listByWorkshopId(workshopId, { limit = 20, offset = 0 } = {}) {
    const id = parseInt(workshopId, 10);
    if (!Number.isFinite(id) || id < 1) return [];
    return await database.query(
      `SELECT r.id,
              r.appointment_id,
              r.workshop_id,
              r.vehicle_owner_id,
              r.rating,
              r.comment,
              r.created_at,
              up.full_name AS reviewer_name
       FROM workshop_reviews r
       LEFT JOIN user_profiles up ON up.user_id = r.vehicle_owner_id
       WHERE r.workshop_id = ?
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [id, limit, offset]
    );
  }

  async countByWorkshopId(workshopId) {
    const id = parseInt(workshopId, 10);
    if (!Number.isFinite(id) || id < 1) return 0;
    const rows = await database.query(
      `SELECT COUNT(*) AS count FROM workshop_reviews WHERE workshop_id = ?`,
      [id]
    );
    return rows?.[0]?.count ?? 0;
  }
}

module.exports = new WorkshopReviewRepository();

