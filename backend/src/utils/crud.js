import { pool } from '../config/db.js';

const allowedTables = new Set([
  'customers', 'areas', 'bills', 'payments', 'employees', 'trucks',
  'collection_schedules', 'recycling_records', 'expenses', 'complaints',
  'users', 'incomes', 'cash_box_transactions', 'cash_boxes', 'income_categories', 'app_categories'
]);

const filterableFields = {
  recycling_records: ['transaction_type', 'material_type', 'payment_method'],
  payments: ['status', 'payment_method'],
  bills: ['status'],
  expenses: ['category', 'payment_method'],
  incomes: ['category', 'payment_method', 'reference_type'],
  income_categories: ['name', 'status'],
  app_categories: ['scope', 'name', 'status'],
  cash_box_transactions: ['direction', 'category', 'payment_method', 'cash_box_id'],
  complaints: ['status', 'complaint_type'],
};

function assertTable(table) {
  if (!allowedTables.has(table)) {
    const error = new Error('جدول غیرمجاز است.');
    error.status = 400;
    throw error;
  }
}

function buildFilters(table, query) {
  const allowed = filterableFields[table] || [];
  const clauses = [];
  const params = {};

  allowed.forEach((field, index) => {
    if (query[field] !== undefined && query[field] !== '') {
      const key = `filter${index}`;
      clauses.push(`${field} = :${key}`);
      params[key] = query[field];
    }
  });

  return { clauses, params };
}

function normalizeValue(key, value) {
  if (value === '' || value === undefined) return null;
  if ((key.endsWith('_id') || key === 'id') && (value === 0 || value === '0')) return null;
  return value;
}

export function createCrudHandlers(table, searchable = ['name']) {
  assertTable(table);

  return {
    list: async (req, res, next) => {
      try {
        const page = Math.max(Number(req.query.page || 1), 1);
        const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
        const offset = (page - 1) * limit;
        const search = String(req.query.search || '').trim();
        const { clauses: filterClauses, params: filterParams } = buildFilters(table, req.query);

        const whereParts = [...filterClauses];
        const params = { limit, offset, ...filterParams };

        if (search && searchable.length) {
          whereParts.push(`(${searchable.map((field, i) => `${field} LIKE :search${i}`).join(' OR ')})`);
          searchable.forEach((_, i) => {
            params[`search${i}`] = `%${search}%`;
          });
        }

        const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        const [rows] = await pool.query(
          `SELECT * FROM ${table} ${where} ORDER BY id DESC LIMIT :limit OFFSET :offset`,
          params
        );
        const [countRows] = await pool.query(
          `SELECT COUNT(*) total FROM ${table} ${where}`,
          params
        );

        res.json({
          data: rows,
          pagination: {
            page,
            limit,
            total: countRows[0].total,
            pages: Math.ceil(countRows[0].total / limit) || 1,
          },
        });
      } catch (error) {
        next(error);
      }
    },

    getOne: async (req, res, next) => {
      try {
        const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        res.json(rows[0]);
      } catch (error) {
        next(error);
      }
    },

    create: async (req, res, next) => {
      try {
        const payload = { ...req.body };
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        delete payload.total_amount;

        const keys = Object.keys(payload);
        if (!keys.length) return res.status(400).json({ message: 'اطلاعات معتبر ارسال نشده است.' });

        const placeholders = keys.map(() => '?').join(', ');
        const [result] = await pool.query(
          `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
          keys.map((key) => normalizeValue(key, payload[key]))
        );

        const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId]);
        res.status(201).json(rows[0]);
      } catch (error) {
        next(error);
      }
    },

    update: async (req, res, next) => {
      try {
        const payload = { ...req.body };
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        delete payload.total_amount;

        const keys = Object.keys(payload);
        if (!keys.length) return res.status(400).json({ message: 'اطلاعاتی برای ویرایش وجود ندارد.' });

        const setters = keys.map((key) => `${key} = ?`).join(', ');
        const [result] = await pool.query(
          `UPDATE ${table} SET ${setters} WHERE id = ?`,
          [...keys.map((key) => normalizeValue(key, payload[key])), req.params.id]
        );

        if (!result.affectedRows) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
        res.json(rows[0]);
      } catch (error) {
        next(error);
      }
    },

    remove: async (req, res, next) => {
      try {
        const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        res.json({ message: 'رکورد با موفقیت حذف شد.' });
      } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
          error.status = 409;
          error.message = 'این رکورد در بخش‌های دیگر استفاده شده و قابل حذف نیست.';
        }
        next(error);
      }
    },
  };
}
