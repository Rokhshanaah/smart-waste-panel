import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smart_waste',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  dateStrings: true,
  typeCast(field, next) {
    if (field.type === 'TIME') {
      const value = field.string();
      return value ? value.slice(0, 8) : value;
    }
    return next();
  },
});

export async function testDatabaseConnection() {
  const connection = await pool.getConnection();

  try {
    await connection.query('SELECT 1');
    console.log('MySQL database connected successfully.');
  } finally {
    connection.release();
  }
}