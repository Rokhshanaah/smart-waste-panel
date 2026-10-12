import bcrypt from 'bcryptjs';
import { pool } from './config/db.js';
import { ensureFinanceTables } from './utils/ensureFinanceTables.js';
import { ALL_PERMISSION_KEYS } from './utils/permissions.js';

async function seed() {
  await ensureFinanceTables();
  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const permissions = JSON.stringify(ALL_PERMISSION_KEYS);

  await pool.query(
    `INSERT INTO users (full_name, email, phone, password_hash, role, status, permissions)
     VALUES (?, ?, ?, ?, 'admin', 'active', ?)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       password_hash = VALUES(password_hash),
       status = 'active',
       permissions = VALUES(permissions)`,
    ['مدیر سیستم', 'admin@municipality.local', '0700000000', passwordHash, permissions]
  );

  console.log('Admin user is ready.');
  await pool.end();
}

seed().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
