import { pool } from '../config/db.js';

const DEFAULT_HOUSE_FEE = 120;

export async function ensureGeoTables() {
  const connection = await pool.getConnection();
  const q = (sql, params) => connection.query(sql, params);
  const soft = async (sql, params) => {
    try {
      return await q(sql, params);
    } catch (error) {
      console.warn(`[ensureGeoTables] skipped: ${error.message}`);
      return null;
    }
  };

  try {
    await soft('SET SESSION lock_wait_timeout = 5');
    await soft('SET SESSION innodb_lock_wait_timeout = 5');

    await q(`
      CREATE TABLE IF NOT EXISTS districts (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        status ENUM('active','inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_district_name (name)
      ) ENGINE=InnoDB
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS passages (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        district_id INT UNSIGNED NOT NULL,
        name VARCHAR(120) NOT NULL,
        status ENUM('active','inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_passage_district_name (district_id, name),
        INDEX idx_passages_district (district_id),
        CONSTRAINT fk_passages_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS alleys (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        passage_id INT UNSIGNED NOT NULL,
        name VARCHAR(120) NOT NULL,
        status ENUM('active','inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_alley_passage_name (passage_id, name),
        INDEX idx_alleys_passage (passage_id),
        CONSTRAINT fk_alleys_passage FOREIGN KEY (passage_id) REFERENCES passages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS houses (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        alley_id INT UNSIGNED NOT NULL,
        plate_number VARCHAR(60) NOT NULL,
        fee_amount DECIMAL(12,2) NOT NULL DEFAULT ${DEFAULT_HOUSE_FEE},
        owner_name VARCHAR(150) NULL,
        phone VARCHAR(30) NULL,
        notes TEXT NULL,
        status ENUM('active','inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_house_alley_plate (alley_id, plate_number),
        INDEX idx_houses_alley (alley_id),
        CONSTRAINT fk_houses_alley FOREIGN KEY (alley_id) REFERENCES alleys(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS house_fee_payments (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        house_id INT UNSIGNED NOT NULL,
        fee_period VARCHAR(7) NOT NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT ${DEFAULT_HOUSE_FEE},
        status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
        paid_at DATETIME NULL,
        payment_method VARCHAR(30) NULL DEFAULT 'cash',
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_house_period (house_id, fee_period),
        INDEX idx_fee_period_status (fee_period, status),
        CONSTRAINT fk_house_fees_house FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await soft(`
      INSERT INTO app_settings (setting_key, setting_value)
      VALUES ('default_house_fee', '${DEFAULT_HOUSE_FEE}')
      ON DUPLICATE KEY UPDATE setting_key = setting_key
    `);

    // Allow house_fee as income reference (legacy ENUM was payment/recycling/manual)
    await soft(`ALTER TABLE incomes MODIFY reference_type VARCHAR(40) NOT NULL DEFAULT 'manual'`);
    await soft(`ALTER TABLE cash_box_transactions MODIFY reference_type VARCHAR(40) NULL`);

    // Link citizens to houses hierarchy
    try {
      const [cols] = await q(`SHOW COLUMNS FROM customers LIKE 'house_id'`);
      if (!cols.length) {
        await soft(`ALTER TABLE customers ADD COLUMN house_id INT UNSIGNED NULL AFTER area_id`);
        await soft(`ALTER TABLE customers ADD INDEX idx_customers_house (house_id)`);
      }
    } catch (error) {
      console.warn(`[ensureGeoTables] customers.house_id: ${error.message}`);
    }

    try {
      const [cols] = await q(`SHOW COLUMNS FROM houses LIKE 'customer_id'`);
      if (!cols.length) {
        await soft(`ALTER TABLE houses ADD COLUMN customer_id INT UNSIGNED NULL AFTER phone`);
        await soft(`ALTER TABLE houses ADD INDEX idx_houses_customer (customer_id)`);
      }
    } catch (error) {
      console.warn(`[ensureGeoTables] houses.customer_id: ${error.message}`);
    }

    // area_id columns now store geo district ids (legacy FK to areas blocks that)
    const areaFkDrops = [
      ['customers', 'fk_customers_area'],
      ['employees', 'fk_employees_area'],
      ['trucks', 'fk_trucks_area'],
      ['bills', 'fk_bills_area'],
      ['collection_schedules', 'fk_schedule_area'],
      ['expenses', 'fk_expenses_area'],
    ];
    for (const [table, fk] of areaFkDrops) {
      await soft(`ALTER TABLE ${table} DROP FOREIGN KEY ${fk}`);
    }

    try {
      const [cols] = await q(`SHOW COLUMNS FROM complaints LIKE 'house_id'`);
      if (!cols.length) {
        await soft(`ALTER TABLE complaints ADD COLUMN house_id INT UNSIGNED NULL AFTER customer_id`);
        await soft(`ALTER TABLE complaints ADD INDEX idx_complaints_house (house_id)`);
      }
    } catch (error) {
      console.warn(`[ensureGeoTables] complaints.house_id: ${error.message}`);
    }

    try {
      const [cols] = await q(`SHOW COLUMNS FROM bills LIKE 'house_id'`);
      if (!cols.length) {
        await soft(`ALTER TABLE bills ADD COLUMN house_id INT UNSIGNED NULL AFTER area_id`);
        await soft(`ALTER TABLE bills ADD INDEX idx_bills_house (house_id)`);
      }
    } catch (error) {
      console.warn(`[ensureGeoTables] bills.house_id: ${error.message}`);
    }
  } finally {
    connection.release();
  }
}

export { DEFAULT_HOUSE_FEE };
