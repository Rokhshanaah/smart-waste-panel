import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, authorize } from '../middleware/auth.js';
import { pool } from '../config/db.js';
import { ALL_PERMISSION_KEYS } from '../utils/permissions.js';

const router = Router();
router.use(authenticate);
router.use(authorize('admin'));

const DATA_TABLES = [
  'complaints',
  'cash_box_transactions',
  'incomes',
  'expenses',
  'recycling_records',
  'collection_schedules',
  'area_daily_collections',
  'house_fee_payments',
  'houses',
  'alleys',
  'passages',
  'districts',
  'payments',
  'bills',
  'trucks',
  'employees',
  'customers',
  'areas',
  'income_categories',
  'app_categories',
];

function escapeSql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) {
    return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM app_settings');
    const settings = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const payload = req.body || {};
    const allowed = ['org_name', 'org_city', 'currency_label', 'support_phone', 'backup_note'];

    for (const key of allowed) {
      if (payload[key] === undefined) continue;
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, String(payload[key] ?? '')]
      );
    }

    const [rows] = await pool.query('SELECT setting_key, setting_value FROM app_settings');
    res.json(Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value])));
  } catch (error) {
    next(error);
  }
});

router.get('/backup', async (req, res, next) => {
  try {
    const tables = [...new Set([...DATA_TABLES, 'users', 'app_settings'])];
    let dump = `-- Smart Waste backup\n-- ${new Date().toISOString()}\nSET FOREIGN_KEY_CHECKS=0;\n\n`;

    for (const table of tables) {
      const [rows] = await pool.query(`SELECT * FROM ${table}`);
      dump += `-- table: ${table}\n`;
      dump += `DELETE FROM \`${table}\`;\n`;

      if (!rows.length) {
        dump += '\n';
        continue;
      }

      const columns = Object.keys(rows[0]);
      for (const row of rows) {
        const values = columns.map((column) => escapeSql(row[column]));
        dump += `INSERT INTO \`${table}\` (\`${columns.join('`, `')}\`) VALUES (${values.join(', ')});\n`;
      }
      dump += '\n';
    }

    dump += 'SET FOREIGN_KEY_CHECKS=1;\n';

    const filename = `smart-waste-backup-${new Date().toISOString().slice(0, 10)}.sql`;
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(dump);
  } catch (error) {
    next(error);
  }
});

router.post('/reset', async (req, res, next) => {
  try {
    const confirm = String(req.body?.confirm || '');
    if (confirm !== 'RESET') {
      return res.status(400).json({ message: 'برای تأیید ریست، کلمه RESET را ارسال کنید.' });
    }

    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of DATA_TABLES) {
      await pool.query(`TRUNCATE TABLE ${table}`);
    }
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');

    await pool.query(`DELETE FROM users WHERE role NOT IN ('admin')`);

    const passwordHash = await bcrypt.hash('Admin@123', 12);
    const [admins] = await pool.query(
      `SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`
    );

    if (admins[0]) {
      await pool.query(
        `UPDATE users
         SET status = 'active',
             permissions = ?
         WHERE role = 'admin'`,
        [JSON.stringify(ALL_PERMISSION_KEYS)]
      );
      await pool.query(
        `UPDATE users
         SET password_hash = ?
         WHERE id = ?`,
        [passwordHash, admins[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO users (full_name, email, phone, password_hash, role, status, permissions)
         VALUES (?, ?, ?, ?, 'admin', 'active', ?)`,
        ['مدیر سیستم', 'admin@municipality.local', '0700000000', passwordHash, JSON.stringify(ALL_PERMISSION_KEYS)]
      );
    }

    // Restore only essential category options (not sample operational data)
    const defaultCategories = {
      income: ['فیس خدمات', 'فروش مواد', 'کمک', 'سایر'],
      expense: ['تیل', 'تعمیر', 'کرایه', 'تجهیزات', 'دفتر', 'سایر'],
      cash_box: ['پرداخت', 'هزینه', 'فروش مواد', 'درآمد', 'تعدیل', 'سایر'],
    };
    for (const [scope, names] of Object.entries(defaultCategories)) {
      for (const name of names) {
        await pool.query(
          `INSERT IGNORE INTO app_categories (scope, name, status) VALUES (?, ?, 'active')`,
          [scope, name]
        );
      }
    }
    for (const name of defaultCategories.income) {
      await pool.query(
        `INSERT IGNORE INTO income_categories (name, status) VALUES (?, 'active')`,
        [name]
      );
    }

    res.json({
      message: 'سیستم ریست شد. همه داده‌های عملیاتی پاک شد و فقط کاربران مدیر باقی ماندند.',
      adminEmail: 'admin@municipality.local',
      adminPassword: 'Admin@123',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
