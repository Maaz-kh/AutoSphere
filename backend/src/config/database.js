const mysql = require('mysql2/promise');
require('dotenv').config();

class Database {
  constructor() {
    this.pool = null;
  }

  async columnExists(connection, tableName, columnName) {
    const [rows] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    return rows.length > 0;
  }

  async tableHasRows(connection, tableName) {
    const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM ${tableName}`);
    return Number(rows?.[0]?.count || 0) > 0;
  }

  async dropForeignKeyIfExists(connection, tableName, columnName) {
    const [rows] = await connection.query(
      `SELECT CONSTRAINT_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [tableName, columnName]
    );

    for (const row of rows) {
      await connection.query(
        `ALTER TABLE ${tableName} DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`
      );
    }
  }

  async dropIndexesForColumnIfExists(connection, tableName, columnName) {
    const [rows] = await connection.query(
      `SELECT DISTINCT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?
         AND INDEX_NAME <> 'PRIMARY'`,
      [tableName, columnName]
    );

    for (const row of rows) {
      await connection.query(`ALTER TABLE ${tableName} DROP INDEX ${row.INDEX_NAME}`);
    }
  }

  async migrateWorkshopAppointmentsToMultiService(connection) {
    const hasLegacyColumn = await this.columnExists(connection, 'workshop_appointments', 'requested_service_id');
    if (!hasLegacyColumn) {
      return;
    }

    const hasRows = await this.tableHasRows(connection, 'workshop_appointments');
    if (hasRows) {
      throw new Error(
        'Legacy workshop_appointments.requested_service_id column still exists and the table contains data. Clear or migrate the data before continuing.'
      );
    }

    await this.dropForeignKeyIfExists(connection, 'workshop_appointments', 'requested_service_id');
    await this.dropIndexesForColumnIfExists(connection, 'workshop_appointments', 'requested_service_id');
    await connection.query('ALTER TABLE workshop_appointments DROP COLUMN requested_service_id');
    console.log(' workshop_appointments legacy requested_service_id column removed (migration)');
  }

  async initialize() {
    try {
      this.pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });

      await this.testConnection();
      await this.runAuctionMigrations();
      await this.runWorkshopMigrations();
      console.log(' Database initialized successfully');
    } catch (error) {
      console.error(' Database initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Legacy hook for auction migrations.
   * Schema is now fully defined in initDatabase.js, so this is a no-op for fresh databases.
   */
  async runAuctionMigrations() {
    const conn = await this.pool.getConnection();
    try {
    } finally {
      conn.release();
    }
  }

  async runWorkshopMigrations() {
    const conn = await this.pool.getConnection();
    try {
      // Ensure workshops table exists for environments created before initDatabase changes
      await conn.query(`
        CREATE TABLE IF NOT EXISTS workshops (
          id INT PRIMARY KEY AUTO_INCREMENT,
          user_id INT NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          ntn VARCHAR(50) NOT NULL,
          contact_phone VARCHAR(20),
          address TEXT NOT NULL,
          city VARCHAR(100) NOT NULL,
          country VARCHAR(100) NOT NULL,
          latitude DECIMAL(10, 8) NOT NULL,
          longitude DECIMAL(11, 8) NOT NULL,
          is_verified ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_workshops_city (city),
          INDEX idx_workshops_verified (is_verified)
        )
      `);
      console.log(' workshops table ensured (migration)');

      await conn.query(`
        CREATE TABLE IF NOT EXISTS workshop_appointments (
          id INT PRIMARY KEY AUTO_INCREMENT,
          workshop_id INT NOT NULL,
          vehicle_owner_id INT NOT NULL,
          vehicle_id INT NOT NULL,
          preferred_at DATETIME NULL,
          scheduled_at DATETIME NULL,
          notes TEXT NULL,
          workshop_response_note TEXT NULL,
          status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'completed') NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE,
          FOREIGN KEY (vehicle_owner_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
          INDEX idx_wa_workshop_status (workshop_id, status),
          INDEX idx_wa_owner_status (vehicle_owner_id, status),
          INDEX idx_wa_vehicle (vehicle_id)
        )
      `);
      console.log(' workshop_appointments table ensured (migration)');

      await this.migrateWorkshopAppointmentsToMultiService(conn);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS workshop_appointment_services (
          id INT PRIMARY KEY AUTO_INCREMENT,
          appointment_id INT NOT NULL,
          service_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (appointment_id) REFERENCES workshop_appointments(id) ON DELETE CASCADE,
          FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
          UNIQUE KEY unique_appointment_service (appointment_id, service_id),
          INDEX idx_was_appointment (appointment_id),
          INDEX idx_was_service (service_id)
        )
      `);
      console.log(' workshop_appointment_services table ensured (migration)');

      await conn.query(`
        CREATE TABLE IF NOT EXISTS workshop_reviews (
          id INT PRIMARY KEY AUTO_INCREMENT,
          appointment_id INT NOT NULL UNIQUE,
          workshop_id INT NOT NULL,
          vehicle_owner_id INT NOT NULL,
          rating TINYINT NOT NULL,
          comment TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (appointment_id) REFERENCES workshop_appointments(id) ON DELETE CASCADE,
          FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE,
          FOREIGN KEY (vehicle_owner_id) REFERENCES users(id) ON DELETE CASCADE,
          CHECK (rating >= 1 AND rating <= 5),
          INDEX idx_wr_workshop_created (workshop_id, created_at),
          INDEX idx_wr_workshop_rating (workshop_id, rating)
        )
      `);
      console.log(' workshop_reviews table ensured (migration)');
    } finally {
      conn.release();
    }
  }

  async testConnection() {
    try {
      const connection = await this.pool.getConnection();
      console.log(' Database connection test successful');
      connection.release();
    } catch (error) {
      console.error(' Database connection test failed:', error.message);
      throw error;
    }
  }

  async query(sql, params = []) {
    try {
      const [results] = await this.pool.query(sql, params);
      return results;
    } catch (error) {
      console.error('Query error:', error.message);
      throw error;
    }
  }

  async execute(sql, params = []) {
    try {
      const [results] = await this.pool.execute(sql, params);
      return results;
    } catch (error) {
      console.error('Execute error:', error.message);
      throw error;
    }
  }

  async getConnection() {
    return await this.pool.getConnection();
  }

  async transaction(callback) {
    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  getPool() {
    return this.pool;
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('Database connection pool closed');
    }
  }
}

module.exports = new Database();