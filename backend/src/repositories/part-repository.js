const BaseRepository = require('./base-repository');

class PartRepository extends BaseRepository {
  constructor() {
    super('workshop_parts');
  }

  async findByWorkshop(workshopId) {
    try {
      return await this.findAll({ workshop_id: workshopId }, 'created_at DESC');
    } catch (error) {
      throw new Error(`Error finding parts by workshop: ${error.message}`);
    }
  }

  async findByIdAndWorkshop(partId, workshopId) {
    try {
      const results = await this.db.query(
        'SELECT * FROM workshop_parts WHERE id = ? AND workshop_id = ?',
        [partId, workshopId]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding part by ID and workshop: ${error.message}`);
    }
  }

  async updateQuantity(partId, quantity) {
    try {
      const result = await this.db.query(
        'UPDATE workshop_parts SET quantity = ? WHERE id = ?',
        [quantity, partId]
      );
      return result.affectedRows;
    } catch (error) {
      throw new Error(`Error updating part quantity: ${error.message}`);
    }
  }
}

module.exports = new PartRepository();

