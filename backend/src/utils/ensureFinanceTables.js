import { pool } from '../config/db.js';
import { ALL_PERMISSION_KEYS } from './permissions.js';

const DEFAULT_CATEGORIES = {
  income: ['فیس خدمات', 'فروش مواد', 'کمک', 'سایر'],
  expense: ['تیل', 'تعمیر', 'کرایه', 'تجهیزات', 'دفتر', 'سایر'],
  cash_box: ['پرداخت', 'هزینه', 'فروش مواد', 'درآمد', 'تعدیل', 'سایر'],
};

export async function ensureFinanceTables() {
  const connection = await pool.getConnection();

  const q = (sql, params) => connection.query(sql, params);
  const soft = async (sql, params) => {
    try {
      return await q(sql, params);
    } catch (error) {
      console.warn(`[ensureFinanceTables] skipped: ${error.message}`);
      return null;
    }
  };

  const columnExists = async (table, column) => {
    const [rows] = await q(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
    return rows.length > 0;
  };

  const tableExists = async (table) => {
    const [rows] = await q(`SHOW TABLES LIKE ?`, [table]);
    return rows.length > 0;
  };

  const ensureColumn = async (table, column, definition) => {
    if (!(await tableExists(table))) return;
    if (!(await columnExists(table, column))) {
      await soft(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${definition}`);
    }
  };

  try {
    // Keep lock waits short so startup cannot hang forever on one connection.
    await soft('SET SESSION lock_wait_timeout = 5');
    await soft('SET SESSION innodb_lock_wait_timeout = 5');

    await q(`
      CREATE TABLE IF NOT EXISTS app_categories (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        scope VARCHAR(40) NOT NULL,
        name VARCHAR(120) NOT NULL,
        status ENUM('active','inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_scope_name (scope, name),
        INDEX idx_scope_status (scope, status)
      ) ENGINE=InnoDB
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS income_categories (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        status ENUM('active','inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS incomes (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(190) NOT NULL,
        category VARCHAR(120) NOT NULL DEFAULT 'سایر',
        amount DECIMAL(12,2) NOT NULL,
        income_date DATE NOT NULL,
        payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
        customer_id INT UNSIGNED NULL,
        reference_type ENUM('payment','recycling','manual') NOT NULL DEFAULT 'manual',
        reference_id INT UNSIGNED NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_incomes_date (income_date),
        INDEX idx_incomes_ref (reference_type, reference_id)
      ) ENGINE=InnoDB
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS cash_box_transactions (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(190) NOT NULL,
        direction ENUM('in','out') NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        transaction_date DATE NOT NULL,
        category VARCHAR(120) NOT NULL DEFAULT 'سایر',
        payment_method VARCHAR(30) NULL DEFAULT 'cash',
        reference_type VARCHAR(40) NULL,
        reference_id INT UNSIGNED NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_cash_date (transaction_date),
        INDEX idx_cash_ref (reference_type, reference_id)
      ) ENGINE=InnoDB
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    await soft(`ALTER TABLE incomes MODIFY category VARCHAR(120) NOT NULL DEFAULT 'سایر'`);
    await soft(`ALTER TABLE incomes MODIFY payment_method VARCHAR(30) NOT NULL DEFAULT 'cash'`);
    await ensureColumn('incomes', 'customer_id', 'INT UNSIGNED NULL AFTER payment_method');

    await soft(`ALTER TABLE payments MODIFY payment_method VARCHAR(30) NOT NULL DEFAULT 'cash'`);
    await soft(`ALTER TABLE expenses MODIFY category VARCHAR(120) NOT NULL DEFAULT 'سایر'`);
    await ensureColumn('expenses', 'payment_method', "VARCHAR(30) NOT NULL DEFAULT 'cash' AFTER amount");
    await ensureColumn('expenses', 'customer_id', 'INT UNSIGNED NULL AFTER payment_method');

    await soft(`ALTER TABLE cash_box_transactions MODIFY category VARCHAR(120) NOT NULL DEFAULT 'سایر'`);
    await ensureColumn('cash_box_transactions', 'payment_method', "VARCHAR(30) NULL DEFAULT 'cash' AFTER category");

    await q(`
      CREATE TABLE IF NOT EXISTS cash_boxes (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        status ENUM('active','inactive') NOT NULL DEFAULT 'active',
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_cash_box_name (name)
      ) ENGINE=InnoDB
    `);

    await soft(`
      INSERT INTO cash_boxes (name, status, notes)
      SELECT 'صندوق اصلی', 'active', 'صندوق پیش‌فرض سیستم'
      WHERE NOT EXISTS (SELECT 1 FROM cash_boxes LIMIT 1)
    `);

    await ensureColumn('cash_box_transactions', 'cash_box_id', 'INT UNSIGNED NULL AFTER id');
    await ensureColumn('cash_box_transactions', 'customer_id', 'INT UNSIGNED NULL AFTER payment_method');
    await ensureColumn('cash_box_transactions', 'settled_at', 'DATETIME NULL AFTER customer_id');
    await ensureColumn('incomes', 'cash_box_id', 'INT UNSIGNED NULL');
    await ensureColumn('expenses', 'cash_box_id', 'INT UNSIGNED NULL');
    await ensureColumn('expenses', 'employee_id', 'INT UNSIGNED NULL AFTER cash_box_id');
    await ensureColumn('recycling_records', 'cash_box_id', 'INT UNSIGNED NULL');
    await ensureColumn('bills', 'cash_box_id', 'INT UNSIGNED NULL');
    await ensureColumn('bills', 'payment_method', "VARCHAR(30) NULL DEFAULT 'cash'");
    await ensureColumn('incomes', 'settled_at', 'DATETIME NULL');

    // Attach orphan transactions to default box
    await soft(`
      UPDATE cash_box_transactions
      SET cash_box_id = (SELECT id FROM (SELECT id FROM cash_boxes ORDER BY id ASC LIMIT 1) AS t)
      WHERE cash_box_id IS NULL
    `);

    await ensureColumn('recycling_records', 'payment_method', "VARCHAR(30) NOT NULL DEFAULT 'cash' AFTER transaction_type");
    await ensureColumn('recycling_records', 'customer_id', 'INT UNSIGNED NULL AFTER payment_method');

    await soft(`UPDATE payments SET payment_method = 'cash' WHERE LOWER(payment_method) IN ('bank', 'online', 'installment')`);
    await soft(`UPDATE incomes SET payment_method = 'cash' WHERE LOWER(payment_method) IN ('bank', 'online', 'installment')`);
    await soft(`UPDATE expenses SET payment_method = 'cash' WHERE LOWER(payment_method) IN ('bank', 'online', 'installment')`);
    await soft(`UPDATE bills SET payment_method = 'cash' WHERE LOWER(payment_method) IN ('bank', 'online', 'installment')`);
    await soft(`UPDATE recycling_records SET payment_method = 'cash' WHERE LOWER(payment_method) IN ('bank', 'online', 'installment')`);
    await soft(`UPDATE cash_box_transactions SET payment_method = 'cash' WHERE LOWER(payment_method) IN ('bank', 'online', 'installment')`);
    await soft(`UPDATE incomes SET category = 'فیس خدمات' WHERE category = 'service_fee'`);
    await soft(`UPDATE incomes SET category = 'فروش مواد' WHERE category = 'material_sale'`);
    await soft(`UPDATE incomes SET category = 'کمک' WHERE category = 'donation'`);
    await soft(`UPDATE incomes SET category = 'سایر' WHERE category = 'other'`);

    await soft(`UPDATE expenses SET category = 'معاش' WHERE category = 'salary'`);
    await soft(`UPDATE app_categories SET status = 'inactive' WHERE scope = 'expense' AND name IN ('معاش', 'salary')`);
    await soft(`UPDATE expenses SET category = 'تیل' WHERE category = 'fuel'`);
    await soft(`UPDATE expenses SET category = 'تعمیر' WHERE category = 'repair'`);
    await soft(`UPDATE expenses SET category = 'کرایه' WHERE category = 'rent'`);
    await soft(`UPDATE expenses SET category = 'تجهیزات' WHERE category = 'equipment'`);
    await soft(`UPDATE expenses SET category = 'دفتر' WHERE category = 'office'`);
    await soft(`UPDATE expenses SET category = 'سایر' WHERE category = 'other'`);

    await soft(`UPDATE cash_box_transactions SET category = 'پرداخت' WHERE category = 'payment'`);
    await soft(`UPDATE cash_box_transactions SET category = 'هزینه' WHERE category = 'expense'`);
    await soft(`UPDATE cash_box_transactions SET category = 'فروش مواد' WHERE category = 'material_sale'`);
    await soft(`UPDATE cash_box_transactions SET category = 'درآمد' WHERE category = 'income'`);
    await soft(`UPDATE cash_box_transactions SET category = 'تعدیل' WHERE category = 'adjustment'`);
    await soft(`UPDATE cash_box_transactions SET category = 'سایر' WHERE category = 'other'`);

    for (const [en, fa] of [
      ['iron', 'آهن'], ['plastic', 'پلاستیک'], ['aluminum', 'المونیم'],
      ['wood', 'چوب'], ['glass', 'شیشه'], ['other', 'سایر'],
    ]) {
      await soft(`UPDATE cash_box_transactions SET title = REPLACE(title, '(${en})', '(${fa})') WHERE title LIKE '%(${en})%'`);
      await soft(`UPDATE cash_box_transactions SET notes = REPLACE(notes, '(${en})', '(${fa})') WHERE notes LIKE '%(${en})%'`);
      await soft(`UPDATE incomes SET title = REPLACE(title, '(${en})', '(${fa})') WHERE title LIKE '%(${en})%'`);
      await soft(`UPDATE incomes SET notes = REPLACE(notes, '(${en})', '(${fa})') WHERE notes LIKE '%(${en})%'`);
    }

    for (const [scope, names] of Object.entries(DEFAULT_CATEGORIES)) {
      for (const name of names) {
        await q(
          `INSERT IGNORE INTO app_categories (scope, name, status) VALUES (?, ?, 'active')`,
          [scope, name]
        );
      }
    }

    if (await tableExists('income_categories')) {
      const [legacy] = await q(`SELECT name, status FROM income_categories`);
      for (const row of legacy) {
        await q(
          `INSERT IGNORE INTO app_categories (scope, name, status) VALUES ('income', ?, ?)`,
          [row.name, row.status || 'active']
        );
      }
    }

    const [incomeCats] = await q(`SELECT name, status FROM app_categories WHERE scope = 'income'`);
    for (const row of incomeCats) {
      await q(
        `INSERT IGNORE INTO income_categories (name, status) VALUES (?, ?)`,
        [row.name, row.status || 'active']
      );
    }

    await q(`
      CREATE TABLE IF NOT EXISTS area_daily_collections (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        area_id INT UNSIGNED NOT NULL,
        collection_date DATE NOT NULL,
        houses_collected INT UNSIGNED NOT NULL DEFAULT 0,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_area_day (area_id, collection_date),
        INDEX idx_collection_date (collection_date)
      ) ENGINE=InnoDB
    `);

    if (await tableExists('users')) {
      const [columns] = await q(`SHOW COLUMNS FROM users LIKE 'permissions'`);
      if (!columns.length) {
        await soft(`ALTER TABLE users ADD COLUMN permissions LONGTEXT NULL AFTER status`);
      }

      await soft(
        `UPDATE users
         SET permissions = ?
         WHERE role = 'admin' AND (permissions IS NULL OR permissions = '' OR permissions = 'null' OR permissions = '[]')`,
        [JSON.stringify(ALL_PERMISSION_KEYS)]
      );
    }

    const defaults = {
      org_name: 'شاروالی هوشمند',
      org_city: 'هرات',
      currency_label: 'افغانی',
      support_phone: '0700000000',
      backup_note: 'پشتیبان‌گیری منظم توصیه می‌شود.',
    };

    for (const [key, value] of Object.entries(defaults)) {
      await q(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_key = setting_key`,
        [key, value]
      );
    }
  } finally {
    connection.release();
  }
}
