import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, authorize } from '../middleware/auth.js';
import { createCrudHandlers } from '../utils/crud.js';
import { pool } from '../config/db.js';
import { normalizePermissions } from '../utils/permissions.js';
import {
  applyExpenseSideEffects,
  applyManualIncomeSideEffects,
  applyPaymentSideEffects,
  applyRecyclingSideEffects,
  applyBillPaymentSideEffects,
  removeExpenseSideEffects,
  removeManualIncomeSideEffects,
  removePaymentSideEffects,
  removeRecyclingSideEffects,
  deleteIncomeByReference,
  deleteCashByReference,
  settleCreditTransaction,
  syncBillFromPayments,
} from '../utils/finance.js';
import { attachCitizenToHouse, syncHouseCitizenLink } from '../utils/houseCitizenSync.js';
import { assertSaleWithinStock, getMaterialStockSummary } from '../utils/materialStock.js';
import {
  getEmployeesPayroll,
  payEmployeeSalary,
  listEmployeeSalaryPayments,
  getPayrollMonthsOverview,
} from '../utils/employeePayroll.js';
import { getNextBillNumber } from '../utils/billNumber.js';
import { isoToFeePeriod, todayIso } from '../utils/shamsi.js';

const definitions = {
  customers: ['full_name', 'phone', 'email', 'citizen_code'],
  areas: ['name', 'district'],
  bills: ['bill_number', 'month_name', 'status'],
  payments: ['receipt_number', 'payment_method', 'status'],
  employees: ['full_name', 'phone', 'job_title'],
  trucks: ['plate_number', 'truck_type', 'driver_name'],
  collection_schedules: ['days', 'collection_time'],
  recycling_records: ['material_type', 'notes'],
  expenses: ['title', 'category'],
  complaints: ['title', 'complaint_type', 'status'],
  users: ['full_name', 'email', 'phone', 'role'],
  incomes: ['title', 'category', 'notes'],
  income_categories: ['name'],
  app_categories: ['name', 'scope'],
  cash_box_transactions: ['title', 'category', 'notes'],
  cash_boxes: ['name', 'notes'],
};

const router = Router();
router.use(authenticate);

async function getRow(table, id) {
  const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  return rows[0] || null;
}

function sanitizeUser(row) {
  if (!row) return row;
  const { password_hash, ...rest } = row;
  return {
    ...rest,
    permissions: normalizePermissions(rest.role, rest.permissions),
  };
}

function normalizeUserCredentials(body = {}) {
  let email = String(body.email || body.username || '').trim();
  let phone = String(body.phone || '').trim();

  if (!email && phone.includes('@')) {
    email = phone;
    phone = '';
  }

  if (!email || !email.includes('@')) {
    const error = new Error('ایمیل (نام کاربری) الزامی است و باید معتبر باشد.');
    error.status = 400;
    throw error;
  }

  if (phone.includes('@')) {
    const error = new Error('شماره تماس نباید ایمیل باشد.');
    error.status = 400;
    throw error;
  }

  return { email, phone: phone || null };
}

for (const [table, searchable] of Object.entries(definitions)) {
  const handlers = createCrudHandlers(table, searchable);

  if (table === 'customers') {
    router.get(`/${table}`, async (req, res, next) => {
      try {
        const page = Math.max(Number(req.query.page || 1), 1);
        const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
        const offset = (page - 1) * limit;
        const search = String(req.query.search || '').trim();
        const whereParts = [];
        const params = [];

        if (search) {
          whereParts.push(`(
            c.full_name LIKE ? OR c.phone LIKE ? OR c.citizen_code LIKE ?
            OR c.district LIKE ? OR c.street LIKE ? OR c.alley LIKE ?
            OR c.house_number LIKE ? OR h.plate_number LIKE ?
          )`);
          const like = `%${search}%`;
          params.push(like, like, like, like, like, like, like, like);
        }

        const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
        const [rows] = await pool.query(
          `SELECT c.*,
                  COALESCE(NULLIF(c.house_number, ''), h.plate_number) AS house_number
           FROM customers c
           LEFT JOIN houses h ON h.id = c.house_id
           ${where}
           ORDER BY c.id DESC
           LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );
        const [[{ total }]] = await pool.query(
          `SELECT COUNT(*) AS total
           FROM customers c
           LEFT JOIN houses h ON h.id = c.house_id
           ${where}`,
          params
        );

        res.json({
          data: rows,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit) || 1,
          },
        });
      } catch (error) {
        next(error);
      }
    });
    router.get(`/${table}/:id`, handlers.getOne);

    router.post(`/${table}`, async (req, res, next) => {
      try {
        const payload = { ...req.body };
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        delete payload.alley_id;
        delete payload.pending_plate;
        delete payload.district_id;
        if (payload.house_id === '' || payload.house_id === 0) payload.house_id = null;
        if (payload.house_id) payload.house_id = Number(payload.house_id);

        if (!payload.house_id) {
          return res.status(400).json({ message: 'پلاک خانه الزامی است.' });
        }

        // اگر پلاک خالی بود از خانه بگیر
        if (!payload.house_number) {
          const [[house]] = await pool.query(`SELECT plate_number FROM houses WHERE id = ?`, [payload.house_id]);
          if (house?.plate_number) payload.house_number = house.plate_number;
        }

        const keys = Object.keys(payload);
        if (!keys.length) return res.status(400).json({ message: 'اطلاعات معتبر ارسال نشده است.' });

        const [result] = await pool.query(
          `INSERT INTO customers (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map((key) => (payload[key] === '' ? null : payload[key]))
        );

        if (payload.house_id) {
          await attachCitizenToHouse(payload.house_id, result.insertId);
        }
        await syncHouseCitizenLink({ customerId: result.insertId });

        const row = await getRow('customers', result.insertId);
        res.status(201).json(row);
      } catch (error) {
        next(error);
      }
    });

    router.put(`/${table}/:id`, async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        const existing = await getRow('customers', id);
        if (!existing) return res.status(404).json({ message: 'رکورد پیدا نشد.' });

        const payload = { ...req.body };
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        delete payload.alley_id;
        delete payload.pending_plate;
        delete payload.district_id;
        if (payload.house_id === '' || payload.house_id === 0) payload.house_id = null;
        if (payload.house_id) payload.house_id = Number(payload.house_id);

        if (!payload.house_id) {
          return res.status(400).json({ message: 'پلاک خانه الزامی است.' });
        }

        if (!payload.house_number) {
          const [[house]] = await pool.query(`SELECT plate_number FROM houses WHERE id = ?`, [payload.house_id]);
          if (house?.plate_number) payload.house_number = house.plate_number;
        }

        const keys = Object.keys(payload);
        if (!keys.length) return res.status(400).json({ message: 'اطلاعات معتبر ارسال نشده است.' });

        // If house changed, clear old reverse link first
        if (existing.house_id && existing.house_id !== payload.house_id) {
          await pool.query(
            `UPDATE houses SET customer_id = NULL WHERE id = ? AND customer_id = ?`,
            [existing.house_id, id]
          );
        }

        await pool.query(
          `UPDATE customers SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
          [...keys.map((key) => (payload[key] === '' ? null : payload[key])), id]
        );

        if (payload.house_id) {
          await attachCitizenToHouse(payload.house_id, id);
        } else {
          await pool.query(`UPDATE houses SET customer_id = NULL WHERE customer_id = ?`, [id]);
        }
        await syncHouseCitizenLink({ customerId: id });

        res.json(await getRow('customers', id));
      } catch (error) {
        next(error);
      }
    });

    router.delete(`/${table}/:id`, authorize('admin', 'accountant'), async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        await pool.query(`UPDATE houses SET customer_id = NULL WHERE customer_id = ?`, [id]);
        await pool.query(`DELETE FROM customers WHERE id = ?`, [id]);
        res.json({ message: 'رکورد با موفقیت حذف شد.' });
      } catch (error) {
        next(error);
      }
    });
    continue;
  }

  if (table === 'users') {
    router.get(`/${table}`, authorize('admin'), async (req, res, next) => {
      try {
        const originalJson = res.json.bind(res);
        res.json = (payload) => {
          if (payload?.data) {
            payload = {
              ...payload,
              data: payload.data.map(sanitizeUser),
            };
          }
          return originalJson(payload);
        };
        return handlers.list(req, res, next);
      } catch (error) {
        next(error);
      }
    });

    router.get(`/${table}/:id`, authorize('admin'), async (req, res, next) => {
      try {
        const row = await getRow('users', req.params.id);
        if (!row) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        res.json(sanitizeUser(row));
      } catch (error) {
        next(error);
      }
    });

    router.post(`/${table}`, authorize('admin'), async (req, res, next) => {
      try {
        const { email, phone } = normalizeUserCredentials(req.body);
        const role = req.body.role || 'employee';
        const permissions = normalizePermissions(role, req.body.permissions);
        const passwordHash = await bcrypt.hash(req.body.password || 'ChangeMe123!', 12);

        const [result] = await pool.query(
          `INSERT INTO users (full_name, email, phone, password_hash, role, status, permissions)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            req.body.full_name,
            email,
            phone,
            passwordHash,
            role,
            req.body.status || 'active',
            JSON.stringify(permissions),
          ]
        );

        const user = await getRow('users', result.insertId);
        res.status(201).json(sanitizeUser(user));
      } catch (error) {
        next(error);
      }
    });

    router.put(`/${table}/:id`, authorize('admin'), async (req, res, next) => {
      try {
        const existing = await getRow('users', req.params.id);
        if (!existing) return res.status(404).json({ message: 'رکورد پیدا نشد.' });

        const { email, phone } = normalizeUserCredentials({
          email: req.body.email ?? existing.email,
          phone: req.body.phone ?? existing.phone,
          username: req.body.username,
        });
        const role = req.body.role || existing.role;
        const permissions = normalizePermissions(role, req.body.permissions ?? existing.permissions);
        const fields = {
          full_name: req.body.full_name ?? existing.full_name,
          email,
          phone,
          role,
          status: req.body.status ?? existing.status,
        };

        let passwordSql = '';
        const params = [
          fields.full_name,
          fields.email,
          fields.phone,
          fields.role,
          fields.status,
          JSON.stringify(permissions),
        ];

        if (req.body.password) {
          passwordSql = ', password_hash = ?';
          params.push(await bcrypt.hash(req.body.password, 12));
        }

        params.push(req.params.id);
        await pool.query(
          `UPDATE users
           SET full_name = ?, email = ?, phone = ?, role = ?, status = ?, permissions = ?${passwordSql}
           WHERE id = ?`,
          params
        );

        const user = await getRow('users', req.params.id);
        res.json(sanitizeUser(user));
      } catch (error) {
        next(error);
      }
    });

    router.delete(`/${table}/:id`, authorize('admin'), async (req, res, next) => {
      try {
        if (Number(req.params.id) === Number(req.user.id)) {
          return res.status(400).json({ message: 'نمی‌توانید حساب خودتان را حذف کنید.' });
        }
        return handlers.remove(req, res, next);
      } catch (error) {
        next(error);
      }
    });
    continue;
  }

  if (table !== 'expenses') {
    router.get(`/${table}`, handlers.list);
  }

  if (table === 'recycling_records') {
    router.get(`/${table}/stock-summary`, async (req, res, next) => {
      try {
        res.json(await getMaterialStockSummary());
      } catch (error) {
        next(error);
      }
    });
  }

  if (table === 'employees') {
    router.get(`/${table}/payroll`, async (req, res, next) => {
      try {
        const period = req.query.period || isoToFeePeriod(todayIso());
        res.json(await getEmployeesPayroll(period));
      } catch (error) {
        next(error);
      }
    });

    router.get(`/${table}/payroll-months`, async (req, res, next) => {
      try {
        const count = Math.min(Math.max(Number(req.query.count) || 6, 1), 12);
        res.json(await getPayrollMonthsOverview(count));
      } catch (error) {
        next(error);
      }
    });

    router.get(`/${table}/:id/salary-payments`, async (req, res, next) => {
      try {
        const period = req.query.period || isoToFeePeriod(todayIso());
        res.json(await listEmployeeSalaryPayments(Number(req.params.id), period));
      } catch (error) {
        next(error);
      }
    });

    router.post(`/${table}/:id/pay-salary`, authorize('admin', 'accountant'), async (req, res, next) => {
      try {
        const result = await payEmployeeSalary({
          employeeId: Number(req.params.id),
          amount: req.body.amount,
          cashBoxId: req.body.cash_box_id,
          paymentMethod: req.body.payment_method || 'cash',
          expenseDate: req.body.expense_date,
          notes: req.body.notes,
          period: req.body.period,
        });
        res.status(201).json(result);
      } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        next(error);
      }
    });
  }

  if (table === 'bills') {
    router.get(`/${table}/next-number`, async (req, res, next) => {
      try {
        const bill_number = await getNextBillNumber();
        res.json({ bill_number });
      } catch (error) {
        next(error);
      }
    });
  }

  router.get(`/${table}/:id`, handlers.getOne);

  if (table === 'cash_box_transactions') {
    router.post(`/${table}/:id/settle`, async (req, res, next) => {
      try {
        const updated = await settleCreditTransaction(Number(req.params.id));
        res.json(updated);
      } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        next(error);
      }
    });
  }

  if (table === 'bills') {
    const BILL_COLUMNS = new Set([
      'bill_number', 'customer_id', 'area_id', 'house_id', 'cash_box_id',
      'billing_type', 'month_name', 'amount', 'paid_amount', 'due_date',
      'status', 'payment_method',
    ]);

    const sanitizeBill = (body = {}) => {
      const payload = {};
      for (const key of BILL_COLUMNS) {
        if (body[key] === undefined) continue;
        let value = body[key];
        if (value === '' || value === undefined) value = null;
        if (['customer_id', 'area_id', 'house_id', 'cash_box_id'].includes(key)) {
          value = value === null || value === 0 ? null : Number(value);
        }
        if (['amount', 'paid_amount'].includes(key)) {
          value = value === null ? (key === 'paid_amount' ? 0 : null) : Number(value);
        }
        payload[key] = value;
      }
      if (payload.paid_amount == null) payload.paid_amount = 0;
      if (!payload.status) payload.status = 'unpaid';
      if (!payload.billing_type) payload.billing_type = 'monthly';
      return payload;
    };

    router.post(`/${table}`, async (req, res, next) => {
      try {
        const payload = sanitizeBill(req.body);
        if (!payload.bill_number) {
          payload.bill_number = await getNextBillNumber();
        }
        if (!payload.customer_id || payload.amount == null) {
          return res.status(400).json({ message: 'مشتری و مبلغ الزامی است.' });
        }
        const keys = Object.keys(payload);
        const [result] = await pool.query(
          `INSERT INTO bills (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map((key) => payload[key])
        );
        const bill = await getRow('bills', result.insertId);
        await applyBillPaymentSideEffects(bill);
        res.status(201).json(bill);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ message: 'این شماره بل از قبل ثبت شده است.' });
        }
        next(error);
      }
    });

    router.put(`/${table}/:id`, async (req, res, next) => {
      try {
        const payload = sanitizeBill(req.body);
        const keys = Object.keys(payload);
        if (!keys.length) return res.status(400).json({ message: 'اطلاعات معتبر ارسال نشده است.' });
        const [result] = await pool.query(
          `UPDATE bills SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
          [...keys.map((key) => payload[key]), req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        const bill = await getRow('bills', req.params.id);
        await applyBillPaymentSideEffects(bill);
        res.json(bill);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ message: 'این شماره بل از قبل ثبت شده است.' });
        }
        next(error);
      }
    });

    router.delete(`/${table}/:id`, authorize('admin', 'accountant'), async (req, res, next) => {
      try {
        const bill = await getRow('bills', req.params.id);
        if (!bill) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        await pool.query('DELETE FROM bills WHERE id = ?', [req.params.id]);
        await deleteIncomeByReference('bill', bill.id);
        await deleteCashByReference('bill', bill.id);
        res.json({ message: 'رکورد با موفقیت حذف شد.' });
      } catch (error) {
        next(error);
      }
    });
    continue;
  }

  if (table === 'payments') {
    router.post(`/${table}`, async (req, res, next) => {
      try {
        const payload = { ...req.body };
        delete payload.id;
        const keys = Object.keys(payload);
        const [result] = await pool.query(
          `INSERT INTO payments (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map((key) => (payload[key] === '' ? null : payload[key]))
        );
        const payment = await getRow('payments', result.insertId);
        await applyPaymentSideEffects(payment);
        res.status(201).json(payment);
      } catch (error) {
        next(error);
      }
    });

    router.put(`/${table}/:id`, async (req, res, next) => {
      try {
        const previous = await getRow('payments', req.params.id);
        if (!previous) return res.status(404).json({ message: 'رکورد پیدا نشد.' });

        const payload = { ...req.body };
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        const keys = Object.keys(payload);
        await pool.query(
          `UPDATE payments SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
          [...keys.map((key) => (payload[key] === '' ? null : payload[key])), req.params.id]
        );

        const payment = await getRow('payments', req.params.id);
        await applyPaymentSideEffects(payment);
        if (Number(previous.bill_id) !== Number(payment.bill_id)) {
          await syncBillFromPayments(previous.bill_id);
        }
        res.json(payment);
      } catch (error) {
        next(error);
      }
    });

    router.delete(`/${table}/:id`, authorize('admin', 'accountant'), async (req, res, next) => {
      try {
        const payment = await getRow('payments', req.params.id);
        if (!payment) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        await pool.query('DELETE FROM payments WHERE id = ?', [req.params.id]);
        await removePaymentSideEffects(payment);
        res.json({ message: 'رکورد با موفقیت حذف شد.' });
      } catch (error) {
        next(error);
      }
    });
    continue;
  }

  if (table === 'expenses') {
    router.get(`/${table}`, async (req, res, next) => {
      try {
        const page = Math.max(Number(req.query.page || 1), 1);
        const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
        const offset = (page - 1) * limit;
        const search = String(req.query.search || '').trim();
        const whereParts = [`category <> 'معاش'`, `category <> 'salary'`];
        const params = {};

        if (req.query.category && !['معاش', 'salary'].includes(String(req.query.category))) {
          whereParts.push('category = :filterCategory');
          params.filterCategory = req.query.category;
        }
        if (req.query.payment_method) {
          whereParts.push('payment_method = :filterMethod');
          params.filterMethod = req.query.payment_method;
        }
        if (search) {
          whereParts.push('(title LIKE :search0 OR category LIKE :search1 OR notes LIKE :search2)');
          params.search0 = `%${search}%`;
          params.search1 = `%${search}%`;
          params.search2 = `%${search}%`;
        }

        const where = `WHERE ${whereParts.join(' AND ')}`;
        params.limit = limit;
        params.offset = offset;

        const [rows] = await pool.query(
          `SELECT * FROM expenses ${where} ORDER BY id DESC LIMIT :limit OFFSET :offset`,
          params
        );
        const [countRows] = await pool.query(
          `SELECT COUNT(*) total FROM expenses ${where}`,
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
    });

    router.get(`/${table}/:id`, handlers.getOne);

    router.post(`/${table}`, async (req, res, next) => {
      try {
        const payload = { ...req.body };
        delete payload.id;
        delete payload.employee_id;
        if (['معاش', 'salary'].includes(String(payload.category || ''))) {
          return res.status(400).json({
            message: 'پرداخت معاش فقط از صفحه کارمندان انجام می‌شود.',
          });
        }
        const keys = Object.keys(payload);
        const [result] = await pool.query(
          `INSERT INTO expenses (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map((key) => (payload[key] === '' ? null : payload[key]))
        );
        const expense = await getRow('expenses', result.insertId);
        await applyExpenseSideEffects(expense);
        res.status(201).json(expense);
      } catch (error) {
        next(error);
      }
    });

    router.put(`/${table}/:id`, async (req, res, next) => {
      try {
        const existing = await getRow('expenses', req.params.id);
        if (!existing) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        if (['معاش', 'salary'].includes(String(existing.category || ''))) {
          return res.status(400).json({
            message: 'معاش کارمند را از صفحه کارمندان مدیریت کنید.',
          });
        }

        const payload = { ...req.body };
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        delete payload.employee_id;
        if (['معاش', 'salary'].includes(String(payload.category || ''))) {
          return res.status(400).json({
            message: 'پرداخت معاش فقط از صفحه کارمندان انجام می‌شود.',
          });
        }
        const keys = Object.keys(payload);
        const [result] = await pool.query(
          `UPDATE expenses SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
          [...keys.map((key) => (payload[key] === '' ? null : payload[key])), req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        const expense = await getRow('expenses', req.params.id);
        await applyExpenseSideEffects(expense);
        res.json(expense);
      } catch (error) {
        next(error);
      }
    });

    router.delete(`/${table}/:id`, authorize('admin', 'accountant'), async (req, res, next) => {
      try {
        const expense = await getRow('expenses', req.params.id);
        if (!expense) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        if (['معاش', 'salary'].includes(String(expense.category || ''))) {
          return res.status(400).json({
            message: 'معاش کارمند را از صفحه کارمندان مدیریت کنید.',
          });
        }
        await pool.query('DELETE FROM expenses WHERE id = ?', [req.params.id]);
        await removeExpenseSideEffects(expense.id);
        res.json({ message: 'رکورد با موفقیت حذف شد.' });
      } catch (error) {
        next(error);
      }
    });
    continue;
  }

  if (table === 'recycling_records') {
    const sanitizeRecycling = (body = {}, { forceStock = false } = {}) => {
      const payload = { ...body };
      delete payload.id;
      delete payload.total_amount;
      delete payload.created_at;
      delete payload.updated_at;

      if (forceStock || payload.transaction_type === 'stock') {
        payload.transaction_type = 'stock';
        delete payload.payment_method;
        delete payload.cash_box_id;
        delete payload.customer_id;
        if (payload.price_per_kg === undefined || payload.price_per_kg === '') {
          payload.price_per_kg = 0;
        }
      }

      for (const key of Object.keys(payload)) {
        if (payload[key] === '') payload[key] = null;
      }
      return payload;
    };

    router.post(`/${table}`, async (req, res, next) => {
      try {
        const forceStock = String(req.query.mode || '') === 'stock'
          || req.body.transaction_type === 'stock'
          || !req.body.transaction_type;
        const payload = sanitizeRecycling(req.body, {
          forceStock: forceStock && req.body.transaction_type !== 'sale',
        });

        if (payload.transaction_type === 'sale') {
          await assertSaleWithinStock(payload);
          if (!payload.payment_method) payload.payment_method = 'cash';
        } else {
          payload.transaction_type = 'stock';
          delete payload.payment_method;
          delete payload.cash_box_id;
          delete payload.customer_id;
          payload.price_per_kg = payload.price_per_kg ?? 0;
        }

        const keys = Object.keys(payload);
        const [result] = await pool.query(
          `INSERT INTO recycling_records (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map((key) => payload[key])
        );
        const record = await getRow('recycling_records', result.insertId);
        await applyRecyclingSideEffects(record);
        res.status(201).json(record);
      } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        next(error);
      }
    });

    router.put(`/${table}/:id`, async (req, res, next) => {
      try {
        const existing = await getRow('recycling_records', req.params.id);
        if (!existing) return res.status(404).json({ message: 'رکورد پیدا نشد.' });

        const payload = sanitizeRecycling(req.body, {
          forceStock: existing.transaction_type === 'stock' || req.body.transaction_type === 'stock',
        });

        // نوع عملیات رکورد قبلی حفظ شود مگر صریحاً تغییر کند
        if (!req.body.transaction_type) {
          payload.transaction_type = existing.transaction_type;
        }

        if (payload.transaction_type === 'sale') {
          await assertSaleWithinStock(payload, Number(req.params.id));
        } else {
          payload.transaction_type = 'stock';
          delete payload.payment_method;
          delete payload.cash_box_id;
          delete payload.customer_id;
        }

        const keys = Object.keys(payload);
        const [result] = await pool.query(
          `UPDATE recycling_records SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
          [...keys.map((key) => payload[key]), req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        const record = await getRow('recycling_records', req.params.id);
        await applyRecyclingSideEffects(record);
        res.json(record);
      } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        next(error);
      }
    });

    router.delete(`/${table}/:id`, authorize('admin', 'accountant'), async (req, res, next) => {
      try {
        const record = await getRow('recycling_records', req.params.id);
        if (!record) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        await pool.query('DELETE FROM recycling_records WHERE id = ?', [req.params.id]);
        await removeRecyclingSideEffects(record.id);
        res.json({ message: 'رکورد با موفقیت حذف شد.' });
      } catch (error) {
        next(error);
      }
    });
    continue;
  }

  if (table === 'incomes') {
    router.post(`/${table}`, async (req, res, next) => {
      try {
        const payload = {
          ...req.body,
          reference_type: 'manual',
          reference_id: null,
        };
        delete payload.id;
        if (payload.customer_id === '' || payload.customer_id === 0 || payload.customer_id === '0') {
          payload.customer_id = null;
        }
        const keys = Object.keys(payload);
        const [result] = await pool.query(
          `INSERT INTO incomes (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map((key) => (payload[key] === '' ? null : payload[key]))
        );
        const income = await getRow('incomes', result.insertId);
        await applyManualIncomeSideEffects(income);
        res.status(201).json(income);
      } catch (error) {
        next(error);
      }
    });

    router.put(`/${table}/:id`, async (req, res, next) => {
      try {
        const existing = await getRow('incomes', req.params.id);
        if (!existing) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        if (existing.reference_type !== 'manual') {
          return res.status(400).json({ message: 'درآمدهای خودکار فقط از بخش مبدأ قابل ویرایش هستند.' });
        }

        const payload = { ...req.body, reference_type: 'manual' };
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;
        delete payload.reference_id;
        const keys = Object.keys(payload);
        await pool.query(
          `UPDATE incomes SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
          [...keys.map((key) => (payload[key] === '' ? null : payload[key])), req.params.id]
        );
        const income = await getRow('incomes', req.params.id);
        await applyManualIncomeSideEffects(income);
        res.json(income);
      } catch (error) {
        next(error);
      }
    });

    router.delete(`/${table}/:id`, authorize('admin', 'accountant'), async (req, res, next) => {
      try {
        const income = await getRow('incomes', req.params.id);
        if (!income) return res.status(404).json({ message: 'رکورد پیدا نشد.' });
        if (income.reference_type !== 'manual') {
          return res.status(400).json({ message: 'درآمدهای خودکار فقط از بخش مبدأ قابل حذف هستند.' });
        }
        await pool.query('DELETE FROM incomes WHERE id = ?', [req.params.id]);
        await removeManualIncomeSideEffects(income.id);
        res.json({ message: 'رکورد با موفقیت حذف شد.' });
      } catch (error) {
        next(error);
      }
    });
    continue;
  }

  router.post(`/${table}`, handlers.create);
  router.put(`/${table}/:id`, handlers.update);
  router.delete(`/${table}/:id`, authorize('admin', 'accountant'), handlers.remove);
}

export default router;
