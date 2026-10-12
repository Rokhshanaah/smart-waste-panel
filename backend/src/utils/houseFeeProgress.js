import { pool } from '../config/db.js';
import { currentFeePeriod, isoToFeePeriod } from './shamsi.js';

export { currentFeePeriod, isoToFeePeriod };

/**
 * House fee progress for geo hierarchy (ناحیه → گذر → کوچه → خانه).
 * @param {string} [period] shamsi YYYY-MM e.g. 1405-05
 */
export async function getHouseFeeProgress(period = currentFeePeriod()) {
  const [[totals]] = await pool.query(
    `SELECT
       COUNT(*) AS houses_total,
       SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'paid' THEN 1 ELSE 0 END) AS houses_paid,
       SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'unpaid' THEN 1 ELSE 0 END) AS houses_unpaid,
       SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'paid' THEN COALESCE(f.amount, h.fee_amount) ELSE 0 END) AS amount_paid,
       SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'unpaid' THEN h.fee_amount ELSE 0 END) AS amount_unpaid
     FROM houses h
     LEFT JOIN house_fee_payments f
       ON f.house_id = h.id AND f.fee_period = ?
     WHERE h.status = 'active'`,
    [period]
  );

  const [[geoCounts]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM districts WHERE status = 'active') AS districts,
       (SELECT COUNT(*) FROM passages WHERE status = 'active') AS passages,
       (SELECT COUNT(*) FROM alleys WHERE status = 'active') AS alleys,
       (SELECT COUNT(*) FROM houses WHERE status = 'active') AS houses`
  );

  const [byDistrict] = await pool.query(
    `SELECT
       d.id,
       d.name,
       COUNT(h.id) AS houses_total,
       SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'paid' THEN 1 ELSE 0 END) AS houses_paid,
       SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'unpaid' THEN 1 ELSE 0 END) AS houses_unpaid,
       SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'paid' THEN COALESCE(f.amount, h.fee_amount) ELSE 0 END) AS amount_paid,
       SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'unpaid' THEN h.fee_amount ELSE 0 END) AS amount_unpaid
     FROM districts d
     LEFT JOIN passages p ON p.district_id = d.id AND p.status = 'active'
     LEFT JOIN alleys a ON a.passage_id = p.id AND a.status = 'active'
     LEFT JOIN houses h ON h.alley_id = a.id AND h.status = 'active'
     LEFT JOIN house_fee_payments f
       ON f.house_id = h.id AND f.fee_period = ?
     WHERE d.status = 'active'
     GROUP BY d.id, d.name
     ORDER BY d.name ASC`,
    [period]
  );

  const housesTotal = Number(totals?.houses_total || 0);
  const housesPaid = Number(totals?.houses_paid || 0);
  const housesUnpaid = Number(totals?.houses_unpaid || 0);
  const amountPaid = Number(totals?.amount_paid || 0);
  const amountUnpaid = Number(totals?.amount_unpaid || 0);
  const amountTotal = amountPaid + amountUnpaid;
  const progressPercent = housesTotal > 0 ? Math.round((housesPaid / housesTotal) * 100) : 0;

  return {
    period,
    counts: {
      districts: Number(geoCounts?.districts || 0),
      passages: Number(geoCounts?.passages || 0),
      alleys: Number(geoCounts?.alleys || 0),
      houses: Number(geoCounts?.houses || 0),
    },
    totals: {
      housesTotal,
      housesPaid,
      housesUnpaid,
      amountPaid,
      amountUnpaid,
      amountTotal,
      progressPercent,
    },
    districts: byDistrict.map((row) => {
      const total = Number(row.houses_total || 0);
      const paid = Number(row.houses_paid || 0);
      return {
        id: row.id,
        name: row.name,
        housesTotal: total,
        housesPaid: paid,
        housesUnpaid: Number(row.houses_unpaid || 0),
        amountPaid: Number(row.amount_paid || 0),
        amountUnpaid: Number(row.amount_unpaid || 0),
        amountTotal: Number(row.amount_paid || 0) + Number(row.amount_unpaid || 0),
        progressPercent: total > 0 ? Math.round((paid / total) * 100) : 0,
      };
    }),
  };
}
