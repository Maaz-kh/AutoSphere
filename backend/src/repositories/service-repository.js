const database = require('../config/database');

class ServiceRepository {
  async listActive() {
    const rows = await database.query(
      `SELECT id, category, name
       FROM services
       WHERE is_active = TRUE
       ORDER BY category ASC, name ASC`
    );
    return rows;
  }

  async findByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = await database.query(
      `SELECT id, category, name, is_active
       FROM services
       WHERE id IN (${placeholders})`,
      ids
    );
    return rows;
  }
}

module.exports = new ServiceRepository();

