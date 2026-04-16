const database = require('../config/database');

class BaseRepository {
  constructor(tableName) {
    this.tableName = tableName;
    this.db = database;
  }

  async findAll(conditions = {}, orderBy = 'id DESC', limit = null) {
    try {
      let query = `SELECT * FROM ${this.tableName}`;
      const params = [];

      if (Object.keys(conditions).length > 0) {
        const whereClause = Object.keys(conditions)
          .map(key => `${key} = ?`)
          .join(' AND ');
        query += ` WHERE ${whereClause}`;
        params.push(...Object.values(conditions));
      }

      if (orderBy) {
        query += ` ORDER BY ${orderBy}`;
      }

      if (limit) {
        query += ` LIMIT ?`;
        params.push(limit);
      }

      return await this.db.query(query, params);
    } catch (error) {
      throw new Error(`Error finding all from ${this.tableName}: ${error.message}`);
    }
  }

  async findById(id) {
    try {
      const results = await this.db.query(
        `SELECT * FROM ${this.tableName} WHERE id = ?`,
        [id]
      );
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding by ID in ${this.tableName}: ${error.message}`);
    }
  }

  async findOne(conditions) {
    try {
      const whereClause = Object.keys(conditions)
        .map(key => `${key} = ?`)
        .join(' AND ');
      
      const results = await this.db.query(
        `SELECT * FROM ${this.tableName} WHERE ${whereClause}`,
        Object.values(conditions)
      );
      
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Error finding one in ${this.tableName}: ${error.message}`);
    }
  }

  async create(data) {
    try {
      const fields = Object.keys(data).join(', ');
      const placeholders = Object.keys(data).map(() => '?').join(', ');
      
      const result = await this.db.query(
        `INSERT INTO ${this.tableName} (${fields}) VALUES (${placeholders})`,
        Object.values(data)
      );
      
      return result.insertId;
    } catch (error) {
      throw new Error(`Error creating in ${this.tableName}: ${error.message}`);
    }
  }

  async update(id, data) {
    try {
      const setClause = Object.keys(data)
        .map(key => `${key} = ?`)
        .join(', ');
      
      const result = await this.db.query(
        `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`,
        [...Object.values(data), id]
      );
      
      return result.affectedRows;
    } catch (error) {
      throw new Error(`Error updating ${this.tableName}: ${error.message}`);
    }
  }

  async delete(id) {
    try {
      const result = await this.db.query(
        `DELETE FROM ${this.tableName} WHERE id = ?`,
        [id]
      );
      return result.affectedRows;
    } catch (error) {
      throw new Error(`Error deleting from ${this.tableName}: ${error.message}`);
    }
  }

  async count(conditions = {}) {
    try {
      let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
      const params = [];

      if (Object.keys(conditions).length > 0) {
        const whereClause = Object.keys(conditions)
          .map(key => `${key} = ?`)
          .join(' AND ');
        query += ` WHERE ${whereClause}`;
        params.push(...Object.values(conditions));
      }

      const results = await this.db.query(query, params);
      return results[0].count;
    } catch (error) {
      throw new Error(`Error counting in ${this.tableName}: ${error.message}`);
    }
  }

  async exists(conditions) {
    const count = await this.count(conditions);
    return count > 0;
  }
}

module.exports = BaseRepository;