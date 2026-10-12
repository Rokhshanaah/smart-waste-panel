import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { DEFAULT_HOUSE_FEE } from '../utils/ensureGeoTables.js';
import {
  deleteCashByReference,
  deleteIncomeByReference,
  upsertCashFromReference,
  upsertIncomeFromReference,
} from '../utils/finance.js';
import { attachCitizenToHouse, syncHouseCitizenLink } from '../utils/houseCitizenSync.js';

const router = Router();
router.use(authenticate);

function periodOk(period) {
  return /^\d{4}-\d{2}$/.test(String(period || ''));
}

async function getDefaultFee() {
  try {
    const [[row]] = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'default_house_fee' LIMIT 1`
    );
    const value = Number(row?.setting_value);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_HOUSE_FEE;
  } catch {
    return DEFAULT_HOUSE_FEE;
  }
}

router.get('/citizens', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const params = [];
    let where = `WHERE status = 'active'`;
    if (search) {
      where += ` AND (full_name LIKE ? OR phone LIKE ? OR IFNULL(citizen_code, '') LIKE ?)`;
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const [rows] = await pool.query(
      `SELECT id, full_name, phone, citizen_code, house_id, district, street, alley, house_number
       FROM customers
       ${where}
       ORDER BY full_name
       LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

/* ---------- Districts (ناحیه) ---------- */
router.get('/districts', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*,
        (SELECT COUNT(*) FROM passages p WHERE p.district_id = d.id) AS passages_count,
        (SELECT COUNT(*) FROM houses h
          INNER JOIN alleys a ON a.id = h.alley_id
          INNER JOIN passages p ON p.id = a.passage_id
          WHERE p.district_id = d.id AND h.status = 'active') AS houses_count
       FROM districts d
       ORDER BY d.name`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/districts', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'نام ناحیه الزامی است.' });
    const [result] = await pool.query(
      `INSERT INTO districts (name, status) VALUES (?, ?)`,
      [name, req.body.status === 'inactive' ? 'inactive' : 'active']
    );
    res.status(201).json({ id: result.insertId, name });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'این ناحیه از قبل ثبت شده است.' });
    }
    next(error);
  }
});

router.put('/districts/:id', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'نام ناحیه الزامی است.' });
    await pool.query(
      `UPDATE districts SET name = ?, status = ? WHERE id = ?`,
      [name, req.body.status === 'inactive' ? 'inactive' : 'active', req.params.id]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/districts/:id', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM districts WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ---------- Passages (گذر) ---------- */
router.get('/passages', async (req, res, next) => {
  try {
    const districtId = Number(req.query.district_id);
    if (!districtId) return res.status(400).json({ message: 'ناحیه الزامی است.' });
    const [rows] = await pool.query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM alleys a WHERE a.passage_id = p.id) AS alleys_count,
        (SELECT COUNT(*) FROM houses h
          INNER JOIN alleys a ON a.id = h.alley_id
          WHERE a.passage_id = p.id AND h.status = 'active') AS houses_count
       FROM passages p
       WHERE p.district_id = ?
       ORDER BY p.name`,
      [districtId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/passages', async (req, res, next) => {
  try {
    const districtId = Number(req.body.district_id);
    const name = String(req.body.name || '').trim();
    if (!districtId || !name) {
      return res.status(400).json({ message: 'ناحیه و نام گذر الزامی است.' });
    }
    const [result] = await pool.query(
      `INSERT INTO passages (district_id, name, status) VALUES (?, ?, ?)`,
      [districtId, name, req.body.status === 'inactive' ? 'inactive' : 'active']
    );
    res.status(201).json({ id: result.insertId, name, district_id: districtId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'این گذر در این ناحیه از قبل ثبت شده است.' });
    }
    next(error);
  }
});

router.put('/passages/:id', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'نام گذر الزامی است.' });
    await pool.query(
      `UPDATE passages SET name = ?, status = ? WHERE id = ?`,
      [name, req.body.status === 'inactive' ? 'inactive' : 'active', req.params.id]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/passages/:id', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM passages WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ---------- Alleys (کوچه) ---------- */
router.get('/alleys', async (req, res, next) => {
  try {
    const passageId = Number(req.query.passage_id);
    if (!passageId) return res.status(400).json({ message: 'گذر الزامی است.' });
    const [rows] = await pool.query(
      `SELECT a.*,
        (SELECT COUNT(*) FROM houses h WHERE h.alley_id = a.id AND h.status = 'active') AS houses_count
       FROM alleys a
       WHERE a.passage_id = ?
       ORDER BY a.name`,
      [passageId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/alleys', async (req, res, next) => {
  try {
    const passageId = Number(req.body.passage_id);
    const name = String(req.body.name || '').trim();
    if (!passageId || !name) {
      return res.status(400).json({ message: 'گذر و نام کوچه الزامی است.' });
    }
    const [result] = await pool.query(
      `INSERT INTO alleys (passage_id, name, status) VALUES (?, ?, ?)`,
      [passageId, name, req.body.status === 'inactive' ? 'inactive' : 'active']
    );
    res.status(201).json({ id: result.insertId, name, passage_id: passageId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'این کوچه در این گذر از قبل ثبت شده است.' });
    }
    next(error);
  }
});

router.put('/alleys/:id', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'نام کوچه الزامی است.' });
    await pool.query(
      `UPDATE alleys SET name = ?, status = ? WHERE id = ?`,
      [name, req.body.status === 'inactive' ? 'inactive' : 'active', req.params.id]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/alleys/:id', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM alleys WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ---------- Houses (خانه با پلاک) ---------- */
router.get('/houses', async (req, res, next) => {
  try {
    const alleyId = Number(req.query.alley_id);
    const period = String(req.query.period || '');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const feeStatus = String(req.query.fee_status || '').trim();
    const availableOnly = String(req.query.available || '') === '1';
    const includeHouseId = Number(req.query.include_house_id) || null;

    if (!alleyId) return res.status(400).json({ message: 'کوچه الزامی است.' });
    if (!periodOk(period)) return res.status(400).json({ message: 'ماه فیس معتبر نیست (مثال: 1405-05).' });

    const where = [`h.alley_id = ?`, `h.status = 'active'`];
    const params = [alleyId];

    if (availableOnly) {
      if (includeHouseId) {
        where.push(`(h.customer_id IS NULL OR h.id = ?)`);
        params.push(includeHouseId);
      } else {
        where.push(`h.customer_id IS NULL`);
      }
    }
    if (search) {
      where.push(`(h.plate_number LIKE ? OR h.owner_name LIKE ? OR IFNULL(h.phone, '') LIKE ? OR IFNULL(c.full_name, '') LIKE ?)`);
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    if (feeStatus === 'paid') {
      where.push(`f.status = 'paid'`);
    } else if (feeStatus === 'unpaid') {
      where.push(`(f.id IS NULL OR f.status = 'unpaid')`);
    }

    const whereSql = where.join(' AND ');

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM houses h
       LEFT JOIN customers c ON c.id = h.customer_id
       LEFT JOIN house_fee_payments f
         ON f.house_id = h.id AND f.fee_period = ?
       WHERE ${whereSql}`,
      [period, ...params]
    );

    const [rows] = await pool.query(
      `SELECT h.*,
        d.name AS district_name,
        p.name AS passage_name,
        a.name AS alley_name,
        COALESCE(c.full_name, h.owner_name) AS citizen_name,
        c.full_name AS customer_name,
        c.phone AS customer_phone,
        c.id AS linked_customer_id,
        COALESCE(f.amount, h.fee_amount) AS period_amount,
        COALESCE(f.status, 'unpaid') AS fee_status,
        f.paid_at,
        f.payment_method,
        f.id AS fee_id
       FROM houses h
       INNER JOIN alleys a ON a.id = h.alley_id
       INNER JOIN passages p ON p.id = a.passage_id
       INNER JOIN districts d ON d.id = p.district_id
       LEFT JOIN customers c ON c.id = h.customer_id
       LEFT JOIN house_fee_payments f
         ON f.house_id = h.id AND f.fee_period = ?
       WHERE ${whereSql}
       ORDER BY
         CASE WHEN h.plate_number REGEXP '^[0-9]+$' THEN 0 ELSE 1 END,
         CAST(h.plate_number AS UNSIGNED),
         h.plate_number
       LIMIT ? OFFSET ?`,
      [period, ...params, limit, offset]
    );

    const [[stats]] = await pool.query(
      `SELECT
         COUNT(*) AS houses_total,
         SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'paid' THEN 1 ELSE 0 END) AS houses_paid,
         SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'unpaid' THEN 1 ELSE 0 END) AS houses_unpaid,
         SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'paid' THEN COALESCE(f.amount, h.fee_amount) ELSE 0 END) AS amount_paid,
         SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'unpaid' THEN h.fee_amount ELSE 0 END) AS amount_unpaid
       FROM houses h
       LEFT JOIN house_fee_payments f
         ON f.house_id = h.id AND f.fee_period = ?
       WHERE h.alley_id = ? AND h.status = 'active'`,
      [period, alleyId]
    );

    res.json({
      data: rows,
      pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) || 1 },
      stats: {
        housesTotal: Number(stats?.houses_total || 0),
        housesPaid: Number(stats?.houses_paid || 0),
        housesUnpaid: Number(stats?.houses_unpaid || 0),
        amountPaid: Number(stats?.amount_paid || 0),
        amountUnpaid: Number(stats?.amount_unpaid || 0),
      },
      period,
      defaultFee: await getDefaultFee(),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/houses', async (req, res, next) => {
  try {
    const alleyId = Number(req.body.alley_id);
    const plate = String(req.body.plate_number || '').trim();
    const fee = Number(req.body.fee_amount);
    const customerId = Number(req.body.customer_id) || null;
    const defaultFee = await getDefaultFee();
    if (!alleyId || !plate) {
      return res.status(400).json({ message: 'کوچه و پلاک خانه الزامی است.' });
    }

    let ownerName = req.body.owner_name || null;
    let phone = req.body.phone || null;
    if (customerId) {
      const [[citizen]] = await pool.query(`SELECT full_name, phone FROM customers WHERE id = ?`, [customerId]);
      if (!citizen) return res.status(400).json({ message: 'شهروند انتخاب‌شده پیدا نشد.' });
      ownerName = citizen.full_name;
      phone = citizen.phone || phone;
    }

    const [result] = await pool.query(
      `INSERT INTO houses (alley_id, plate_number, fee_amount, owner_name, phone, customer_id, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        alleyId,
        plate,
        Number.isFinite(fee) && fee > 0 ? fee : defaultFee,
        ownerName,
        phone,
        customerId,
        req.body.notes || null,
      ]
    );

    if (customerId) {
      await attachCitizenToHouse(result.insertId, customerId);
    }

    res.status(201).json({ id: result.insertId, plate_number: plate, customer_id: customerId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'این پلاک در این کوچه از قبل ثبت شده است.' });
    }
    next(error);
  }
});

router.post('/houses/bulk', async (req, res, next) => {
  try {
    const alleyId = Number(req.body.alley_id);
    const from = Number(req.body.from_plate);
    const to = Number(req.body.to_plate);
    const fee = Number(req.body.fee_amount);
    const defaultFee = await getDefaultFee();
    const amount = Number.isFinite(fee) && fee > 0 ? fee : defaultFee;

    if (!alleyId || !Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) {
      return res.status(400).json({ message: 'محدوده پلاک معتبر نیست.' });
    }
    if (to - from > 5000) {
      return res.status(400).json({ message: 'حداکثر ۵۰۰۰ خانه در هر ثبت دسته‌ای مجاز است.' });
    }

    const values = [];
    const params = [];
    for (let n = from; n <= to; n += 1) {
      values.push('(?, ?, ?, NULL, NULL, NULL, \'active\')');
      params.push(alleyId, String(n), amount);
    }

    const [result] = await pool.query(
      `INSERT IGNORE INTO houses (alley_id, plate_number, fee_amount, owner_name, phone, notes, status)
       VALUES ${values.join(',')}`,
      params
    );

    res.status(201).json({
      ok: true,
      requested: to - from + 1,
      inserted: result.affectedRows,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/houses/:id', async (req, res, next) => {
  try {
    const houseId = Number(req.params.id);
    const plate = String(req.body.plate_number || '').trim();
    if (!plate) return res.status(400).json({ message: 'پلاک الزامی است.' });
    const fee = Number(req.body.fee_amount);
    const customerId = req.body.customer_id === '' || req.body.customer_id === null || req.body.customer_id === undefined
      ? null
      : Number(req.body.customer_id) || null;

    let ownerName = req.body.owner_name || null;
    let phone = req.body.phone || null;
    if (customerId) {
      const [[citizen]] = await pool.query(`SELECT full_name, phone FROM customers WHERE id = ?`, [customerId]);
      if (!citizen) return res.status(400).json({ message: 'شهروند انتخاب‌شده پیدا نشد.' });
      ownerName = citizen.full_name;
      phone = citizen.phone || phone;
    }

    await pool.query(
      `UPDATE houses
       SET plate_number = ?, fee_amount = ?, owner_name = ?, phone = ?, customer_id = ?, notes = ?, status = ?
       WHERE id = ?`,
      [
        plate,
        Number.isFinite(fee) && fee > 0 ? fee : DEFAULT_HOUSE_FEE,
        ownerName,
        phone,
        customerId,
        req.body.notes || null,
        req.body.status === 'inactive' ? 'inactive' : 'active',
        houseId,
      ]
    );

    await attachCitizenToHouse(houseId, customerId);
    res.json({ ok: true });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'این پلاک تکراری است.' });
    }
    next(error);
  }
});

router.delete('/houses/:id', async (req, res, next) => {
  try {
    const houseId = Number(req.params.id);
    const [fees] = await pool.query(`SELECT id FROM house_fee_payments WHERE house_id = ?`, [houseId]);
    for (const fee of fees) {
      await deleteIncomeByReference('house_fee', fee.id);
      await deleteCashByReference('house_fee', fee.id);
    }
    await pool.query(`DELETE FROM houses WHERE id = ?`, [houseId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/houses/:id/context', async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT h.id AS house_id, h.plate_number, h.fee_amount, h.owner_name, h.phone, h.customer_id,
              c.full_name AS customer_name, c.phone AS customer_phone,
              a.id AS alley_id, a.name AS alley_name,
              p.id AS passage_id, p.name AS passage_name,
              d.id AS district_id, d.name AS district_name
       FROM houses h
       LEFT JOIN customers c ON c.id = h.customer_id
       INNER JOIN alleys a ON a.id = h.alley_id
       INNER JOIN passages p ON p.id = a.passage_id
       INNER JOIN districts d ON d.id = p.district_id
       WHERE h.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'خانه پیدا نشد.' });
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.post('/houses/bulk-delete', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.house_ids)
      ? [...new Set(req.body.house_ids.map(Number).filter(Boolean))]
      : [];
    if (!ids.length) {
      return res.status(400).json({ message: 'لیست خانه‌ها خالی است.' });
    }

    const [fees] = await pool.query(
      `SELECT id FROM house_fee_payments WHERE house_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    for (const fee of fees) {
      await deleteIncomeByReference('house_fee', fee.id);
      await deleteCashByReference('house_fee', fee.id);
    }

    const [result] = await pool.query(
      `DELETE FROM houses WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );

    res.json({ ok: true, deleted: result.affectedRows });
  } catch (error) {
    next(error);
  }
});

/* ---------- Fee paid / unpaid ---------- */
async function setHouseFeeStatus({ houseId, period, status, paymentMethod = 'cash', notes = null }) {
  const [[house]] = await pool.query(
    `SELECT h.*, a.name AS alley_name, p.name AS passage_name, d.name AS district_name
     FROM houses h
     INNER JOIN alleys a ON a.id = h.alley_id
     INNER JOIN passages p ON p.id = a.passage_id
     INNER JOIN districts d ON d.id = p.district_id
     WHERE h.id = ?`,
    [houseId]
  );
  if (!house) {
    const err = new Error('خانه پیدا نشد.');
    err.status = 404;
    throw err;
  }

  const amount = Number(house.fee_amount) || DEFAULT_HOUSE_FEE;
  const paidAt = status === 'paid' ? new Date() : null;

  const [existing] = await pool.query(
    `SELECT id FROM house_fee_payments WHERE house_id = ? AND fee_period = ? LIMIT 1`,
    [houseId, period]
  );

  let feeId;
  if (existing.length) {
    feeId = existing[0].id;
    await pool.query(
      `UPDATE house_fee_payments
       SET amount = ?, status = ?, paid_at = ?, payment_method = ?, notes = ?
       WHERE id = ?`,
      [amount, status, paidAt, paymentMethod, notes, feeId]
    );
  } else {
    const [result] = await pool.query(
      `INSERT INTO house_fee_payments
        (house_id, fee_period, amount, status, paid_at, payment_method, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [houseId, period, amount, status, paidAt, paymentMethod, notes]
    );
    feeId = result.insertId;
  }

  const title = `فیس خانه پلاک ${house.plate_number} — ${house.alley_name} / ${house.passage_name}`;
  const isoToday = new Date().toISOString().slice(0, 10);

  if (status === 'paid') {
    await upsertIncomeFromReference({
      title,
      category: 'فیس خدمات',
      amount,
      incomeDate: isoToday,
      paymentMethod,
      referenceType: 'house_fee',
      referenceId: feeId,
      notes: `${house.district_name} › ${house.passage_name} › ${house.alley_name} › پلاک ${house.plate_number} (${period})`,
    });
    await upsertCashFromReference({
      title,
      direction: 'in',
      amount,
      transactionDate: isoToday,
      category: 'پرداخت',
      referenceType: 'house_fee',
      referenceId: feeId,
      notes: `دوره ${period}`,
      paymentMethod,
      customerId: house.customer_id || null,
    });
  } else {
    await deleteIncomeByReference('house_fee', feeId);
    await deleteCashByReference('house_fee', feeId);
  }

  return { feeId, amount, status };
}

router.post('/houses/:id/fee', async (req, res, next) => {
  try {
    const houseId = Number(req.params.id);
    const period = String(req.body.period || '');
    const status = req.body.status === 'paid' ? 'paid' : 'unpaid';
    if (!periodOk(period)) {
      return res.status(400).json({ message: 'ماه فیس معتبر نیست.' });
    }
    const result = await setHouseFeeStatus({
      houseId,
      period,
      status,
      paymentMethod: req.body.payment_method || 'cash',
      notes: req.body.notes || null,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
});

router.post('/houses/fees/bulk', async (req, res, next) => {
  try {
    const period = String(req.body.period || '');
    const status = req.body.status === 'paid' ? 'paid' : 'unpaid';
    const ids = Array.isArray(req.body.house_ids)
      ? req.body.house_ids.map(Number).filter(Boolean)
      : [];
    if (!periodOk(period) || !ids.length) {
      return res.status(400).json({ message: 'ماه و لیست خانه‌ها الزامی است.' });
    }
    let updated = 0;
    for (const houseId of ids) {
      await setHouseFeeStatus({
        houseId,
        period,
        status,
        paymentMethod: req.body.payment_method || 'cash',
      });
      updated += 1;
    }
    res.json({ ok: true, updated });
  } catch (error) {
    next(error);
  }
});

async function feeStatsForScope({ scopeWhereSql, scopeParams, period }) {
  const [[stats]] = await pool.query(
    `SELECT
        COUNT(*) AS houses_total,
        SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'paid' THEN 1 ELSE 0 END) AS houses_paid,
        SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'unpaid' THEN 1 ELSE 0 END) AS houses_unpaid,
        SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'paid' THEN COALESCE(f.amount, h.fee_amount) ELSE 0 END) AS amount_paid,
        SUM(CASE WHEN COALESCE(f.status, 'unpaid') = 'unpaid' THEN h.fee_amount ELSE 0 END) AS amount_unpaid
     FROM houses h
     LEFT JOIN house_fee_payments f
       ON f.house_id = h.id AND f.fee_period = ?
     INNER JOIN alleys a ON a.id = h.alley_id
     INNER JOIN passages p ON p.id = a.passage_id
     INNER JOIN districts d ON d.id = p.district_id
     WHERE ${scopeWhereSql} AND h.status = 'active'`,
    [period, ...scopeParams]
  );

  return {
    housesTotal: Number(stats?.houses_total || 0),
    housesPaid: Number(stats?.houses_paid || 0),
    housesUnpaid: Number(stats?.houses_unpaid || 0),
    amountPaid: Number(stats?.amount_paid || 0),
    amountUnpaid: Number(stats?.amount_unpaid || 0),
  };
}

router.get('/summary/district', async (req, res, next) => {
  try {
    const period = String(req.query.period || '');
    const districtId = Number(req.query.district_id || 0);
    if (!districtId) return res.status(400).json({ message: 'ناحیه الزامی است.' });
    if (!periodOk(period)) return res.status(400).json({ message: 'ماه فیس معتبر نیست.' });

    const stats = await feeStatsForScope({
      period,
      scopeWhereSql: 'd.id = ?',
      scopeParams: [districtId],
    });

    res.json({ period, defaultFee: await getDefaultFee(), stats });
  } catch (error) {
    next(error);
  }
});

router.get('/summary/passage', async (req, res, next) => {
  try {
    const period = String(req.query.period || '');
    const passageId = Number(req.query.passage_id || 0);
    if (!passageId) return res.status(400).json({ message: 'گذر الزامی است.' });
    if (!periodOk(period)) return res.status(400).json({ message: 'ماه فیس معتبر نیست.' });

    const stats = await feeStatsForScope({
      period,
      scopeWhereSql: 'p.id = ?',
      scopeParams: [passageId],
    });

    res.json({ period, defaultFee: await getDefaultFee(), stats });
  } catch (error) {
    next(error);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    const period = String(req.query.period || '');
    if (!periodOk(period)) {
      return res.status(400).json({ message: 'ماه فیس معتبر نیست.' });
    }

    const [[totals]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM districts WHERE status = 'active') AS districts,
         (SELECT COUNT(*) FROM passages WHERE status = 'active') AS passages,
         (SELECT COUNT(*) FROM alleys WHERE status = 'active') AS alleys,
         (SELECT COUNT(*) FROM houses WHERE status = 'active') AS houses`
    );

    const [[fees]] = await pool.query(
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

    res.json({
      period,
      defaultFee: await getDefaultFee(),
      counts: {
        districts: Number(totals.districts || 0),
        passages: Number(totals.passages || 0),
        alleys: Number(totals.alleys || 0),
        houses: Number(totals.houses || 0),
      },
      fees: {
        housesTotal: Number(fees?.houses_total || 0),
        housesPaid: Number(fees?.houses_paid || 0),
        housesUnpaid: Number(fees?.houses_unpaid || 0),
        amountPaid: Number(fees?.amount_paid || 0),
        amountUnpaid: Number(fees?.amount_unpaid || 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
