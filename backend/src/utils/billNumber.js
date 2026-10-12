import { pool } from '../config/db.js';

const BILL_START = 100;

/**
 * شماره بل ترتیبی خودکار: از 100 شروع می‌شود و بالا می‌رود.
 */
export async function getNextBillNumber(conn = pool) {
  const [rows] = await conn.query(`SELECT bill_number FROM bills`);
  let max = BILL_START - 1;

  for (const row of rows) {
    const raw = String(row.bill_number || '').trim();
    if (/^\d+$/.test(raw)) {
      max = Math.max(max, Number(raw));
    }
  }

  return String(Math.max(max + 1, BILL_START));
}

export { BILL_START };
