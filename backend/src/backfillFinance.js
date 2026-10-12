import { pool } from './config/db.js';
import { ensureFinanceTables } from './utils/ensureFinanceTables.js';
import {
  applyExpenseSideEffects,
  applyPaymentSideEffects,
  applyRecyclingSideEffects,
} from './utils/finance.js';

async function backfill() {
  await ensureFinanceTables();

  const [payments] = await pool.query(`SELECT * FROM payments`);
  for (const payment of payments) {
    await applyPaymentSideEffects(payment);
  }

  const [expenses] = await pool.query(`SELECT * FROM expenses`);
  for (const expense of expenses) {
    await applyExpenseSideEffects(expense);
  }

  const [records] = await pool.query(`SELECT * FROM recycling_records`);
  for (const record of records) {
    await applyRecyclingSideEffects(record);
  }

  console.log('Finance backfill completed.');
  await pool.end();
}

backfill().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
