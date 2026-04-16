const database = require('../config/database');

class WorkshopsRepository {
  async findById(workshopId) {
    const id = parseInt(workshopId, 10);
    if (!Number.isFinite(id) || id < 1) return null;
    const rows = await database.query(
      `SELECT *
       FROM workshops
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async findByUserId(userId) {
    const rows = await database.query(
      `SELECT *
       FROM workshops
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }
}

module.exports = new WorkshopsRepository();

