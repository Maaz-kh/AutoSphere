const database = require('../config/database');

class WorkshopServicesRepository {
  async listActiveServiceIdsByWorkshopId(workshopId) {
    const rows = await database.query(
      `SELECT service_id
       FROM workshop_services
       WHERE workshop_id = ?
         AND is_active = TRUE`,
      [workshopId]
    );
    return rows.map((row) => Number(row.service_id));
  }

  async listByWorkshopId(workshopId) {
    const rows = await database.query(
      `SELECT ws.id,
              ws.workshop_id,
              ws.service_id,
              ws.price_min,
              ws.price_max,
              ws.is_active,
              s.category,
              s.name
       FROM workshop_services ws
       JOIN services s ON ws.service_id = s.id
       WHERE ws.workshop_id = ?
       ORDER BY s.category ASC, s.name ASC`,
      [workshopId]
    );
    return rows;
  }

  async createMany(workshopId, items) {
    if (!items || items.length === 0) return;
    const values = [];
    const placeholders = items.map(() => '(?, ?, ?, ?, ?)').join(', ');
    for (const it of items) {
      values.push(workshopId);
      values.push(it.service_id);
      values.push(it.price_min ?? null);
      values.push(it.price_max ?? null);
      values.push(it.is_active ?? true);
    }
    await database.query(
      `INSERT INTO workshop_services (workshop_id, service_id, price_min, price_max, is_active)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         price_min = VALUES(price_min),
         price_max = VALUES(price_max),
         is_active = VALUES(is_active),
         updated_at = CURRENT_TIMESTAMP`,
      values
    );
  }

  async updateByIdAndWorkshop(id, workshopId, update) {
    const fields = [];
    const values = [];
    if (update.price_min !== undefined) {
      fields.push('price_min = ?');
      values.push(update.price_min);
    }
    if (update.price_max !== undefined) {
      fields.push('price_max = ?');
      values.push(update.price_max);
    }
    if (update.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(update.is_active ? 1 : 0);
    }
    if (fields.length === 0) return 0;
    values.push(id, workshopId);
    const result = await database.query(
      `UPDATE workshop_services
       SET ${fields.join(', ')}
       WHERE id = ? AND workshop_id = ?`,
      values
    );
    return result.affectedRows || 0;
  }

  async deleteByIdAndWorkshop(id, workshopId) {
    const result = await database.query(
      `DELETE FROM workshop_services WHERE id = ? AND workshop_id = ?`,
      [id, workshopId]
    );
    return result.affectedRows || 0;
  }
}

module.exports = new WorkshopServicesRepository();

