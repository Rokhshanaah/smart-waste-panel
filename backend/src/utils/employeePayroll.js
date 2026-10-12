import { pool } from '../config/db.js';
import { isoToFeePeriod, todayIso, jalaaliToIso, jalaaliMonthLength, isoToJalaali } from './shamsi.js';
import { applyExpenseSideEffects, removeExpenseSideEffects } from './finance.js';

const MONTHS = [
  'حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله',
  'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function shamsiMonthLabel(jm) {
  return MONTHS[jm - 1] || String(jm);
}

function statusFromPaid(salary, paid) {
  const due = Number(salary || 0);
  const got = Number(paid || 0);
  if (due <= 0) return got > 0 ? 'paid' : 'unpaid';
  if (got <= 0) return 'unpaid';
  if (got + 0.0001 >= due) return 'paid';
  return 'partial';
}

export function payrollStatusLabel(status) {
  if (status === 'paid') return 'کامل پرداخت‌شده';
  if (status === 'partial') return 'قسمی پرداخت‌شده';
  return 'پرداخت‌نشده';
}

function periodRange(period) {
  const [jy, jm] = String(period || '').split('-').map(Number);
  if (jy && jm) {
    return {
      from: jalaaliToIso(jy, jm, 1),
      to: jalaaliToIso(jy, jm, jalaaliMonthLength(jy, jm)),
      period: `${jy}-${pad(jm)}`,
    };
  }
  const feePeriod = isoToFeePeriod(todayIso());
  const [cy, cm] = feePeriod.split('-').map(Number);
  return {
    from: jalaaliToIso(cy, cm, 1),
    to: jalaaliToIso(cy, cm, jalaaliMonthLength(cy, cm)),
    period: feePeriod,
  };
}

/** وضعیت معاش کارمندان برای یک ماه شمسی */
export async function getEmployeesPayroll(period = isoToFeePeriod(todayIso()), conn = pool) {
  const { from, to, period: feePeriod } = periodRange(period);

  const [employees] = await conn.query(
    `SELECT id, full_name, phone, job_title, salary, area_id, status
     FROM employees
     ORDER BY full_name ASC`
  );

  const [payments] = await conn.query(
    `SELECT employee_id,
            COALESCE(SUM(amount), 0) AS paid_amount,
            COUNT(*) AS payment_count
     FROM expenses
     WHERE category = 'معاش'
       AND employee_id IS NOT NULL
       AND expense_date >= ?
       AND expense_date <= ?
     GROUP BY employee_id`,
    [from, to]
  );

  const paidMap = Object.fromEntries(
    payments.map((row) => [Number(row.employee_id), row])
  );

  const rows = employees.map((emp) => {
    const paid = Number(paidMap[emp.id]?.paid_amount || 0);
    const salary = Number(emp.salary || 0);
    const remaining = Math.max(salary - paid, 0);
    const payStatus = statusFromPaid(salary, paid);
    return {
      ...emp,
      salary,
      paidAmount: paid,
      remainingAmount: remaining,
      paymentCount: Number(paidMap[emp.id]?.payment_count || 0),
      payStatus,
      payStatusLabel: payrollStatusLabel(payStatus),
      period: feePeriod,
      periodFrom: from,
      periodTo: to,
    };
  });

  return { period: feePeriod, from, to, employees: rows };
}

export async function payEmployeeSalary({
  employeeId,
  amount,
  cashBoxId,
  paymentMethod = 'cash',
  expenseDate,
  notes,
  period,
}, conn = pool) {
  const [[employee]] = await conn.query(`SELECT * FROM employees WHERE id = ?`, [employeeId]);
  if (!employee) {
    const error = new Error('کارمند پیدا نشد.');
    error.status = 404;
    throw error;
  }

  const payAmount = Number(amount);
  if (!(payAmount > 0)) {
    const error = new Error('مبلغ معاش باید بیشتر از صفر باشد.');
    error.status = 400;
    throw error;
  }

  if (!cashBoxId) {
    const error = new Error('انتخاب صندوق الزامی است.');
    error.status = 400;
    throw error;
  }

  const feePeriod = period || isoToFeePeriod(expenseDate || todayIso());
  const payroll = await getEmployeesPayroll(feePeriod, conn);
  const current = payroll.employees.find((e) => Number(e.id) === Number(employeeId));
  const remaining = Number(current?.remainingAmount ?? employee.salary);

  if (payAmount > remaining + 0.0001) {
    const error = new Error(
      `مبلغ بیشتر از مانده معاش است. مانده این ماه: ${remaining.toLocaleString('en-US')} افغانی`
    );
    error.status = 400;
    throw error;
  }

  const date = expenseDate || todayIso();
  const title = `معاش — ${employee.full_name} — ${feePeriod}`;

  const [result] = await conn.query(
    `INSERT INTO expenses
      (title, category, amount, expense_date, payment_method, cash_box_id, employee_id, notes, area_id)
     VALUES (?, 'معاش', ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      payAmount,
      date,
      paymentMethod || 'cash',
      cashBoxId || null,
      employeeId,
      notes || null,
      employee.area_id || null,
    ]
  );

  const [[expense]] = await conn.query(`SELECT * FROM expenses WHERE id = ?`, [result.insertId]);
  await applyExpenseSideEffects(expense, conn);

  const updated = await getEmployeesPayroll(feePeriod, conn);
  const employeeStatus = updated.employees.find((e) => Number(e.id) === Number(employeeId));

  return { expense, employee: employeeStatus, period: feePeriod };
}

export async function listEmployeeSalaryPayments(employeeId, period, conn = pool) {
  const { from, to, period: feePeriod } = periodRange(period || isoToFeePeriod(todayIso()));

  const [rows] = await conn.query(
    `SELECT e.*, cb.name AS cash_box_name
     FROM expenses e
     LEFT JOIN cash_boxes cb ON cb.id = e.cash_box_id
     WHERE e.employee_id = ?
       AND e.category = 'معاش'
       AND e.expense_date >= ?
       AND e.expense_date <= ?
     ORDER BY e.expense_date DESC, e.id DESC`,
    [employeeId, from, to]
  );

  return { period: feePeriod, from, to, payments: rows };
}

export async function deleteSalaryExpense(expenseId, conn = pool) {
  const [[expense]] = await conn.query(`SELECT * FROM expenses WHERE id = ?`, [expenseId]);
  if (!expense) {
    const error = new Error('پرداخت پیدا نشد.');
    error.status = 404;
    throw error;
  }
  await conn.query(`DELETE FROM expenses WHERE id = ?`, [expenseId]);
  await removeExpenseSideEffects(expenseId, conn);
  return expense;
}

/** خلاصه معاش چند ماه اخیر — برای یادآوری ماه‌هایی که هنوز پرداخت نشده */
export async function getPayrollMonthsOverview(count = 6, conn = pool) {
  const today = isoToJalaali(todayIso()) || { jy: 1405, jm: 1 };
  let jy = today.jy;
  let jm = today.jm;
  const months = [];

  for (let i = 0; i < count; i += 1) {
    const period = `${jy}-${pad(jm)}`;
    const data = await getEmployeesPayroll(period, conn);
    const active = data.employees.filter((e) => e.status === 'active');
    const unpaid = active.filter((e) => e.payStatus === 'unpaid').length;
    const partial = active.filter((e) => e.payStatus === 'partial').length;
    const paid = active.filter((e) => e.payStatus === 'paid').length;
    const needsPay = unpaid + partial;
    const remainingAmount = active.reduce((sum, e) => sum + Number(e.remainingAmount || 0), 0);

    months.push({
      period,
      label: `${shamsiMonthLabel(jm)} ${jy}`,
      isCurrent: i === 0,
      unpaid,
      partial,
      paid,
      needsPay,
      totalActive: active.length,
      remainingAmount,
      status: needsPay === 0 && active.length > 0
        ? 'paid'
        : unpaid === active.length
          ? 'unpaid'
          : 'partial',
      statusLabel: needsPay === 0 && active.length > 0
        ? 'پرداخت کامل'
        : needsPay > 0
          ? `${needsPay} نفر مانده`
          : 'بدون کارمند',
    });

    jm -= 1;
    if (jm <= 0) {
      jm = 12;
      jy -= 1;
    }
  }

  return {
    currentPeriod: months[0]?.period || isoToFeePeriod(todayIso()),
    months,
  };
}
