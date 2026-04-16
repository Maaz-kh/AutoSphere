const mysql = require('mysql2/promise');
require('dotenv').config();

const columnExists = async (connection, tableName, columnName) => {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
};

const tableHasRows = async (connection, tableName) => {
  const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(rows?.[0]?.count || 0) > 0;
};

const dropForeignKeyIfExists = async (connection, tableName, columnName) => {
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
    await connection.query(`ALTER TABLE ${tableName} DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`);
  }
};

const dropIndexesForColumnIfExists = async (connection, tableName, columnName) => {
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
};

const migrateWorkshopAppointmentsToMultiService = async (connection) => {
  const hasLegacyColumn = await columnExists(connection, 'workshop_appointments', 'requested_service_id');
  if (!hasLegacyColumn) {
    return;
  }

  const hasRows = await tableHasRows(connection, 'workshop_appointments');
  if (hasRows) {
    throw new Error(
      'Legacy workshop_appointments.requested_service_id column still exists and the table contains data. Clear or migrate the data before continuing.'
    );
  }

  await dropForeignKeyIfExists(connection, 'workshop_appointments', 'requested_service_id');
  await dropIndexesForColumnIfExists(connection, 'workshop_appointments', 'requested_service_id');
  await connection.query('ALTER TABLE workshop_appointments DROP COLUMN requested_service_id');
  console.log('Workshop appointments legacy requested_service_id column removed');
};

const initDatabase = async () => {
  try {
    // Connect without database to create it
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT
    });

    console.log('Connected to MySQL server');

    // Create database if not exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
    console.log(`Database ${process.env.DB_NAME} created or already exists`);

    await connection.query(`USE ${process.env.DB_NAME}`);

    // ============================= USERS TABLE =============================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('vehicle_owner', 'buyer', 'workshop', 'admin') NOT NULL DEFAULT 'vehicle_owner',
        is_verified BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT FALSE,
        accepted_terms_at TIMESTAMP NULL,
        verified_at TIMESTAMP NULL,
        last_login_at TIMESTAMP NULL,
        last_login_ip VARCHAR(45),
        login_count INT DEFAULT 0,
        failed_login_attempts INT DEFAULT 0,
        lockout_until TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role)
      )
    `);
    console.log('Users table created');

    // ============================= USER PROFILES TABLE =============================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT UNIQUE NOT NULL,
        full_name VARCHAR(255),
        phone_number VARCHAR(20),
        address TEXT,
        city VARCHAR(100),
        country VARCHAR(100),
        profile_image VARCHAR(255),
        cnic VARCHAR(20),
        cnic_image VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id)
      )
    `);
    console.log('User Profiles table created');

    // ============================= VEHICLES TABLE =============================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id INT PRIMARY KEY AUTO_INCREMENT,
        owner_id INT NOT NULL,
        registration_number VARCHAR(50) UNIQUE NOT NULL,
        chassis_number VARCHAR(50) UNIQUE NOT NULL,
        engine_number VARCHAR(50) NOT NULL,
        make VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        variant VARCHAR(100) NOT NULL,
        model_year INT NOT NULL,
        body_type VARCHAR(50) NOT NULL,
        fuel_type ENUM('petrol', 'diesel', 'cng', 'lpg', 'electric', 'hybrid') NOT NULL,
        transmission_type ENUM('manual', 'automatic') NOT NULL,
        assembly VARCHAR(50) NOT NULL,
        engine_capacity VARCHAR(20) NOT NULL,
        mileage_km INT,
        color VARCHAR(50),
        registered_city VARCHAR(100),
        purchase_date DATE,
        front_image_path VARCHAR(255) NOT NULL,
        back_image_path VARCHAR(255) NOT NULL,
        interior_image_path VARCHAR(255) NOT NULL,
        registration_certificate_path VARCHAR(255) NOT NULL,
        additional_documents_paths JSON,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_owner_id (owner_id),
        INDEX idx_registration (registration_number),
        INDEX idx_chassis (chassis_number)
      )
    `);
    console.log('Vehicles table created');

    // Create Vehicle History table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vehicle_history (
        id INT PRIMARY KEY AUTO_INCREMENT,
        vehicle_id INT NOT NULL,
        event_type ENUM('ownership_change', 'service', 'condition_update', 'document_update', 'transfer_request', 'transfer_completed', 'transfer_rejected') NOT NULL,
        event_description TEXT NOT NULL,
        event_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        performed_by INT,
        metadata JSON,
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
        FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_vehicle_id (vehicle_id),
        INDEX idx_event_date (event_date)
      )
    `);
    console.log('Vehicle History table created');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS vehicle_transfer_requests (
        id INT PRIMARY KEY AUTO_INCREMENT,
        vehicle_id INT NOT NULL,
        current_owner_id INT NOT NULL,
        new_owner_id INT NOT NULL,
        status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'expired') DEFAULT 'pending',
        expires_at TIMESTAMP NOT NULL,
        responded_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
        FOREIGN KEY (current_owner_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (new_owner_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_vehicle_status (vehicle_id, status),
        INDEX idx_new_owner_status (new_owner_id, status)
      )
    `);
    console.log('Vehicle Transfer Requests table created');

    // ============================= WORKSHOPS TABLE =============================
    await connection.query(`
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
    console.log('Workshops table created');

    // ============================= SERVICES CATALOG =============================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS services (
        id INT PRIMARY KEY AUTO_INCREMENT,
        category ENUM('maintenance', 'repair', 'inspection', 'bodywork') NOT NULL,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_category_name (category, name),
        INDEX idx_category (category),
        INDEX idx_is_active (is_active)
      )
    `);
    console.log('Services table created');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS workshop_services (
        id INT PRIMARY KEY AUTO_INCREMENT,
        workshop_id INT NOT NULL,
        service_id INT NOT NULL,
        price_min DECIMAL(10, 2) NULL,
        price_max DECIMAL(10, 2) NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE KEY unique_workshop_service (workshop_id, service_id),
        INDEX idx_ws_workshop (workshop_id),
        INDEX idx_ws_service (service_id)
      )
    `);
    console.log('Workshop Services table created');

    await connection.query(`
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
    console.log('Workshop Appointments table created');

    await migrateWorkshopAppointmentsToMultiService(connection);

    await connection.query(`
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
    console.log('Workshop Appointment Services table created');

    await connection.query(`
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
    console.log('Workshop Reviews table created');

    // Seed a minimal starter catalog (safe: ignores duplicates)
    await connection.query(`
      INSERT IGNORE INTO services (category, name) VALUES
        ('maintenance', 'Oil change'),
        ('maintenance', 'Air filter replacement'),
        ('maintenance', 'Brake pads replacement'),
        ('maintenance', 'Battery replacement'),
        ('repair', 'Engine diagnostics'),
        ('repair', 'Brake repair'),
        ('repair', 'AC repair'),
        ('repair', 'Suspension repair'),
        ('inspection', 'Vehicle inspection'),
        ('inspection', 'Pre-purchase inspection'),
        ('bodywork', 'Dent repair'),
        ('bodywork', 'Paint job')
    `);
    console.log('Services catalog seeded');

    // ============================= WORKSHOP PARTS TABLE =============================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS workshop_parts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        workshop_id INT NOT NULL,
        part_name VARCHAR(255) NOT NULL,
        category ENUM('parts', 'fluids', 'filters') NOT NULL DEFAULT 'parts',
        price DECIMAL(10, 2) NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (workshop_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_workshop_id (workshop_id),
        INDEX idx_part_name (part_name),
        INDEX idx_category (category)
      )
    `);
    console.log('Workshop Parts table created');

    // Create Password Reset Tokens table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token)
      )
    `);
    console.log('Password Reset Tokens table created');

    // Create Email Verification Tokens table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token)
      )
    `);
    console.log('Email Verification Tokens table created');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS login_activity (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        status ENUM('success', 'failed') NOT NULL DEFAULT 'success',
        is_first_login BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      )
    `);
    console.log('Login Activity table created');

    // Create Service Records tracking table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS service_records (
        id INT PRIMARY KEY AUTO_INCREMENT,
        record_id VARCHAR(50) NOT NULL,
        vehicle_id VARCHAR(17) NOT NULL,
        workshop_id INT NOT NULL,
        transaction_hash VARCHAR(66) NOT NULL,
        service_date DATETIME NOT NULL,
        total_charges DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workshop_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_workshop_id (workshop_id),
        INDEX idx_vehicle_id (vehicle_id),
        INDEX idx_service_date (service_date),
        INDEX idx_record_id (record_id),
        UNIQUE KEY unique_record_id (record_id)
      )
    `);
    console.log('Service Records table created');

    // ============================= AUCTIONS TABLE =============================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS auctions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        vehicle_id INT NOT NULL,
        seller_id INT NOT NULL,
        status ENUM('draft', 'scheduled', 'active', 'ended', 'cancelled') NOT NULL DEFAULT 'draft',
        end_reason ENUM('duration_elapsed', 'seller_ended', 'admin_cancelled') NULL,
        ended_by_user_id INT NULL,
        description TEXT NOT NULL,
        reserve_price DECIMAL(12, 2) NOT NULL,
        starting_bid DECIMAL(12, 2) NOT NULL,
        current_high_bid DECIMAL(12, 2) NULL,
        current_high_bidder_id INT NULL,
        duration_days INT NOT NULL,
        start_at TIMESTAMP NULL,
        end_at TIMESTAMP NULL,
        ended_at TIMESTAMP NULL,
        featured BOOLEAN DEFAULT FALSE,
        view_count INT DEFAULT 0,
        watchlist_count INT DEFAULT 0,
        odometer_km INT NULL,
        reminder_sent_at TIMESTAMP NULL,
        terms_accepted_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
        FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (current_high_bidder_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (ended_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_vehicle_id (vehicle_id),
        INDEX idx_seller_id (seller_id),
        INDEX idx_status (status),
        INDEX idx_end_at (end_at),
        INDEX idx_start_at (start_at),
        INDEX idx_end_reason (end_reason)
      )
    `);
    console.log('Auctions table created');

    // ============================= AUCTION PHOTOS TABLE =============================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS auction_photos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        auction_id INT NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        INDEX idx_auction_id (auction_id)
      )
    `);
    console.log('Auction Photos table created');

    // ============================= AUCTION BIDS TABLE =============================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bids (
        id INT PRIMARY KEY AUTO_INCREMENT,
        auction_id INT NOT NULL,
        user_id INT NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        is_proxy BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_auction_id (auction_id),
        INDEX idx_user_id (user_id)
      )
    `);
    console.log('Bids table created');

    // ============================= AUCTION WATCHLIST TABLE =============================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        auction_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_auction (user_id, auction_id),
        INDEX idx_user_id (user_id),
        INDEX idx_auction_id (auction_id)
      )
    `);
    console.log('Watchlist table created');

    // ============================= AUCTION TRANSACTIONS TABLE =============================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS auction_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        auction_id INT NOT NULL UNIQUE,
        winner_id INT NULL,
        seller_id INT NOT NULL,
        final_amount DECIMAL(12, 2) NULL,
        outcome ENUM('sold', 'reserve_not_met', 'no_sale') NOT NULL,
        transaction_status ENUM('pending_seller_decision', 'pending_completion', 'completed', 'failed') NOT NULL DEFAULT 'pending_completion',
        inspection_completed BOOLEAN DEFAULT FALSE,
        payment_completed BOOLEAN DEFAULT FALSE,
        docs_transferred BOOLEAN DEFAULT FALSE,
        vehicle_delivered BOOLEAN DEFAULT FALSE,
        buyer_confirmed_complete BOOLEAN DEFAULT FALSE,
        seller_confirmed_complete BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_auction_id (auction_id),
        INDEX idx_winner_id (winner_id),
        INDEX idx_seller_id (seller_id)
      )
    `);
    console.log('Auction Transactions table created');

    // ============================= AUCTION MESSAGES TABLE =============================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS auction_messages (
        id INT PRIMARY KEY AUTO_INCREMENT,
        auction_id INT NOT NULL,
        sender_id INT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_auction_created (auction_id, created_at)
      )
    `);
    console.log('Auction Messages table created');

    console.log('\n Database initialization completed successfully!');
    await connection.end();
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
};

initDatabase();