import { pool } from '../config/db.js';
import { formatShamsi, todayIso } from './shamsi.js';
import { MATERIAL_LABELS, materialLabel } from './materialStock.js';

function localizeText(text) {
  if (!text) return text;
  let out = String(text);
  for (const [en, fa] of Object.entries(MATERIAL_LABELS)) {
    out = out.replace(new RegExp(`\\b${en}\\b`, 'gi'), fa);
  }
  // تاریخ میلادی در توضیحات → شمسی
  out = out.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => formatShamsi(`${y}-${m}-${d}`));
  return out;
}

export async function syncBillFromPayments(billId, conn = pool) {
  if (!billId) return;

  const [[sum]] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM payments
     WHERE bill_id = ? AND status = 'paid'`,
    [billId]
  );
  const [[bill]] = await conn.query(
    `SELECT amount, paid_amount FROM bills WHERE id = ?`,
    [billId]
  );
  if (!bill) return;

  // Prefer explicit paid_amount on bill when no payment rows exist
  const paidFromPayments = Number(sum.total);
  const paid = paidFromPayments > 0 ? paidFromPayments : Number(bill.paid_amount || 0);
  const amount = Number(bill.amount);
  let status = 'unpaid';
  if (paid <= 0) status = 'unpaid';
  else if (paid >= amount) status = 'paid';
  else status = 'partial';

  await conn.query(
    `UPDATE bills SET paid_amount = ?, status = ? WHERE id = ?`,
    [paid, status, billId]
  );
}

function isCashLike(method) {
  return method === 'cash' || method === 'exchange';
}

function isCreditLike(method) {
  return method === 'credit';
}

function methodLabel(method) {
  if (method === 'credit') return 'نسیه';
  if (method === 'exchange') return 'صرافی';
  return 'نقدی';
}

export async function upsertIncomeFromReference({
  title,
  category,
  amount,
  incomeDate,
  paymentMethod = 'cash',
  referenceType,
  referenceId,
  notes = null,
  customerId = null,
  cashBoxId = null,
}, conn = pool) {
  const [existing] = await conn.query(
    `SELECT id FROM incomes WHERE reference_type = ? AND reference_id = ? LIMIT 1`,
    [referenceType, referenceId]
  );

  if (existing.length) {
    await conn.query(
      `UPDATE incomes
       SET title = ?, category = ?, amount = ?, income_date = ?, payment_method = ?,
           customer_id = ?, cash_box_id = ?, notes = ?
       WHERE id = ?`,
      [title, category, amount, incomeDate, paymentMethod, customerId, cashBoxId, notes, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await conn.query(
    `INSERT INTO incomes
      (title, category, amount, income_date, payment_method, customer_id, cash_box_id, reference_type, reference_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, category, amount, incomeDate, paymentMethod, customerId, cashBoxId, referenceType, referenceId, notes]
  );
  return result.insertId;
}

export async function deleteIncomeByReference(referenceType, referenceId, conn = pool) {
  await conn.query(
    `DELETE FROM incomes WHERE reference_type = ? AND reference_id = ?`,
    [referenceType, referenceId]
  );
}

export async function upsertCashFromReference({
  title,
  direction,
  amount,
  transactionDate,
  category,
  referenceType,
  referenceId,
  notes = null,
  paymentMethod = 'cash',
  cashBoxId = null,
  customerId = null,
}, conn = pool) {
  let boxId = cashBoxId ? Number(cashBoxId) : null;
  if (!boxId) {
    const [[def]] = await conn.query(`SELECT id FROM cash_boxes WHERE status = 'active' ORDER BY id ASC LIMIT 1`);
    boxId = def?.id || null;
  }

  const [existing] = await conn.query(
    `SELECT id FROM cash_box_transactions
     WHERE reference_type = ? AND reference_id = ? LIMIT 1`,
    [referenceType, referenceId]
  );

  if (existing.length) {
    await conn.query(
      `UPDATE cash_box_transactions
       SET title = ?, direction = ?, amount = ?, transaction_date = ?, category = ?,
           payment_method = ?, cash_box_id = ?, customer_id = ?, notes = ?
       WHERE id = ?`,
      [title, direction, amount, transactionDate, category, paymentMethod, boxId, customerId, notes, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await conn.query(
    `INSERT INTO cash_box_transactions
      (title, direction, amount, transaction_date, category, payment_method, cash_box_id, customer_id, reference_type, reference_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, direction, amount, transactionDate, category, paymentMethod, boxId, customerId, referenceType, referenceId, notes]
  );
  return result.insertId;
}

export async function deleteCashByReference(referenceType, referenceId, conn = pool) {
  await conn.query(
    `DELETE FROM cash_box_transactions WHERE reference_type = ? AND reference_id = ?`,
    [referenceType, referenceId]
  );
}

async function customerName(customerId, conn = pool) {
  if (!customerId) return null;
  const [[row]] = await conn.query(`SELECT full_name FROM customers WHERE id = ?`, [customerId]);
  return row?.full_name || null;
}

async function postMoneyToCashBox({
  title,
  amount,
  date,
  category,
  referenceType,
  referenceId,
  paymentMethod,
  cashBoxId,
  customerId,
  notes,
  direction = 'in',
}, conn = pool) {
  const method = paymentMethod || 'cash';
  const person = await customerName(customerId, conn);
  let cashTitle = title;
  let cashNotes = notes || null;

  if (isCreditLike(method)) {
    cashTitle = person ? `نسیه — ${person}` : `نسیه — ${title}`;
    cashNotes = [person ? `نسیه از: ${person}` : 'پرداخت نسیه', title, notes].filter(Boolean).join(' | ');
  } else if (method === 'exchange') {
    cashTitle = `صرافی — ${title}`;
  }

  await upsertCashFromReference({
    title: cashTitle,
    direction,
    amount,
    transactionDate: date,
    category,
    referenceType,
    referenceId,
    notes: cashNotes,
    paymentMethod: method,
    cashBoxId,
    customerId: customerId || null,
  }, conn);
}

export async function applyPaymentSideEffects(payment, conn = pool) {
  await syncBillFromPayments(payment.bill_id, conn);

  if (payment.status === 'paid') {
    await upsertIncomeFromReference({
      title: `پرداخت بل #${payment.bill_id}`,
      category: 'فیس خدمات',
      amount: payment.amount,
      incomeDate: payment.payment_date,
      paymentMethod: payment.payment_method || 'cash',
      referenceType: 'payment',
      referenceId: payment.id,
      notes: payment.notes || null,
      customerId: payment.customer_id || null,
      cashBoxId: payment.cash_box_id || null,
    }, conn);

    await postMoneyToCashBox({
      title: `بل #${payment.bill_id}`,
      amount: payment.amount,
      date: payment.payment_date,
      category: 'پرداخت',
      referenceType: 'payment',
      referenceId: payment.id,
      paymentMethod: payment.payment_method || 'cash',
      cashBoxId: payment.cash_box_id || null,
      customerId: payment.customer_id || null,
      notes: payment.notes || null,
    }, conn);
  } else {
    await deleteIncomeByReference('payment', payment.id, conn);
    await deleteCashByReference('payment', payment.id, conn);
  }
}

export async function removePaymentSideEffects(payment, conn = pool) {
  await deleteIncomeByReference('payment', payment.id, conn);
  await deleteCashByReference('payment', payment.id, conn);
  await syncBillFromPayments(payment.bill_id, conn);
}

export async function applyExpenseSideEffects(expense, conn = pool) {
  await postMoneyToCashBox({
    title: expense.title,
    amount: expense.amount,
    date: expense.expense_date,
    category: 'هزینه',
    referenceType: 'expense',
    referenceId: expense.id,
    paymentMethod: expense.payment_method || 'cash',
    cashBoxId: expense.cash_box_id || null,
    customerId: expense.customer_id || null,
    notes: expense.notes || null,
    direction: 'out',
  }, conn);
}

export async function removeExpenseSideEffects(expenseId, conn = pool) {
  await deleteCashByReference('expense', expenseId, conn);
}

export async function applyRecyclingSideEffects(record, conn = pool) {
  if (record.transaction_type !== 'sale') {
    await deleteIncomeByReference('recycling', record.id, conn);
    await deleteCashByReference('recycling', record.id, conn);
    return;
  }

  const amount = Number(record.total_amount ?? (Number(record.weight_kg) * Number(record.price_per_kg)));
  const paymentMethod = record.payment_method || 'cash';

  await upsertIncomeFromReference({
    title: `فروش مواد (${materialLabel(record.material_type)})`,
    category: 'فروش مواد',
    amount,
    incomeDate: record.record_date,
    paymentMethod,
    referenceType: 'recycling',
    referenceId: record.id,
    notes: localizeText(record.notes) || null,
    customerId: record.customer_id,
    cashBoxId: record.cash_box_id || null,
  }, conn);

  await postMoneyToCashBox({
    title: `فروش مواد (${materialLabel(record.material_type)})`,
    amount,
    date: record.record_date,
    category: 'فروش مواد',
    referenceType: 'recycling',
    referenceId: record.id,
    paymentMethod,
    cashBoxId: record.cash_box_id || null,
    customerId: record.customer_id || null,
    notes: localizeText(record.notes) || null,
  }, conn);
}

export async function removeRecyclingSideEffects(recordId, conn = pool) {
  await deleteIncomeByReference('recycling', recordId, conn);
  await deleteCashByReference('recycling', recordId, conn);
}

export async function applyManualIncomeSideEffects(income, conn = pool) {
  if (income.reference_type !== 'manual') return;

  await postMoneyToCashBox({
    title: income.title,
    amount: income.amount,
    date: income.income_date,
    category: 'درآمد',
    referenceType: 'income',
    referenceId: income.id,
    paymentMethod: income.payment_method || 'cash',
    cashBoxId: income.cash_box_id || null,
    customerId: income.customer_id || null,
    notes: income.notes || null,
  }, conn);
}

export async function removeManualIncomeSideEffects(incomeId, conn = pool) {
  await deleteCashByReference('income', incomeId, conn);
}

export async function applyBillPaymentSideEffects(bill, conn = pool) {
  const paid = Number(bill.paid_amount || 0);
  if (paid <= 0 || !['paid', 'partial'].includes(bill.status)) {
    await deleteIncomeByReference('bill', bill.id, conn);
    await deleteCashByReference('bill', bill.id, conn);
    return;
  }

  await upsertIncomeFromReference({
    title: `بل ${bill.bill_number || `#${bill.id}`}`,
    category: 'فیس خدمات',
    amount: paid,
    incomeDate: bill.due_date || new Date().toISOString().slice(0, 10),
    paymentMethod: bill.payment_method || 'cash',
    referenceType: 'bill',
    referenceId: bill.id,
    notes: null,
    customerId: bill.customer_id || null,
    cashBoxId: bill.cash_box_id || null,
  }, conn);

  await postMoneyToCashBox({
    title: `بل ${bill.bill_number || `#${bill.id}`}`,
    amount: paid,
    date: bill.due_date || new Date().toISOString().slice(0, 10),
    category: 'پرداخت',
    referenceType: 'bill',
    referenceId: bill.id,
    paymentMethod: bill.payment_method || 'cash',
    cashBoxId: bill.cash_box_id || null,
    customerId: bill.customer_id || null,
  }, conn);
}

export async function getCashBalance(cashBoxId = null, conn = pool) {
  const params = [];
  let where = '';
  if (cashBoxId) {
    where = 'WHERE cash_box_id = ?';
    params.push(Number(cashBoxId));
  }

  const [[row]] = await conn.query(
    `SELECT
       COALESCE(SUM(CASE WHEN direction = 'in' AND COALESCE(payment_method, 'cash') IN ('cash','exchange') THEN amount ELSE 0 END), 0) AS cash_in,
       COALESCE(SUM(CASE WHEN direction = 'out' AND COALESCE(payment_method, 'cash') IN ('cash','exchange') THEN amount ELSE 0 END), 0) AS cash_out,
       COALESCE(SUM(CASE WHEN direction = 'in' AND payment_method = 'credit' AND settled_at IS NULL THEN amount ELSE 0 END), 0) AS credit_in,
       COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0) AS total_out,
       COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0) AS total_in
     FROM cash_box_transactions ${where}`,
    params
  );

  const cashIn = Number(row.cash_in);
  const cashOut = Number(row.cash_out);
  return {
    totalIn: Number(row.total_in),
    totalOut: Number(row.total_out),
    balance: cashIn - cashOut,
    cashIn,
    cashOut,
    creditIn: Number(row.credit_in),
  };
}

/** Per-box balances + system total (نقدی/صرافی جدا از نسیه) */
export async function getCashBoxesOverview(conn = pool) {
  const [[def]] = await conn.query(
    `SELECT id FROM cash_boxes WHERE status = 'active' ORDER BY id ASC LIMIT 1`
  );
  if (def?.id) {
    await conn.query(
      `UPDATE cash_box_transactions SET cash_box_id = ? WHERE cash_box_id IS NULL`,
      [def.id]
    );
  }

  const [rows] = await conn.query(
    `SELECT
       cb.id,
       cb.name,
       cb.status,
       COALESCE(SUM(CASE WHEN t.direction = 'in' AND COALESCE(t.payment_method, 'cash') IN ('cash','exchange') THEN t.amount ELSE 0 END), 0) AS cash_in,
       COALESCE(SUM(CASE WHEN t.direction = 'out' AND COALESCE(t.payment_method, 'cash') IN ('cash','exchange') THEN t.amount ELSE 0 END), 0) AS cash_out,
       COALESCE(SUM(CASE WHEN t.direction = 'in' AND t.payment_method = 'credit' AND t.settled_at IS NULL THEN t.amount ELSE 0 END), 0) AS credit_in
     FROM cash_boxes cb
     LEFT JOIN cash_box_transactions t ON t.cash_box_id = cb.id
     WHERE cb.status = 'active'
     GROUP BY cb.id, cb.name, cb.status
     ORDER BY cb.id ASC`
  );

  const boxes = rows.map((row) => {
    const cashIn = Number(row.cash_in);
    const cashOut = Number(row.cash_out);
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      cashIn,
      cashOut,
      creditIn: Number(row.credit_in),
      balance: cashIn - cashOut,
    };
  });

  const total = boxes.reduce(
    (acc, box) => {
      acc.cashIn += box.cashIn;
      acc.cashOut += box.cashOut;
      acc.creditIn += box.creditIn;
      acc.balance += box.balance;
      return acc;
    },
    { cashIn: 0, cashOut: 0, creditIn: 0, balance: 0 }
  );

  return { total, boxes };
}

/**
 * ورود/خروج نقدی صندوق در بازه (نسیه باز حساب نمی‌شود).
 */
export async function getCashPeriodTotals({ from = null, to = null, cashBoxId = null } = {}, conn = pool) {
  const clauses = [];
  const params = [];
  if (from) {
    clauses.push('transaction_date >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('transaction_date <= ?');
    params.push(to);
  }
  if (cashBoxId) {
    clauses.push('cash_box_id = ?');
    params.push(Number(cashBoxId));
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const [[row]] = await conn.query(
    `SELECT
       COALESCE(SUM(CASE WHEN direction = 'in' AND COALESCE(payment_method, 'cash') IN ('cash','exchange') THEN amount ELSE 0 END), 0) AS cash_in,
       COALESCE(SUM(CASE WHEN direction = 'out' AND COALESCE(payment_method, 'cash') IN ('cash','exchange') THEN amount ELSE 0 END), 0) AS cash_out,
       COALESCE(SUM(CASE WHEN direction = 'in' AND payment_method = 'credit' AND settled_at IS NULL THEN amount ELSE 0 END), 0) AS credit_in,
       COALESCE(SUM(CASE WHEN direction = 'in' AND payment_method = 'credit' AND settled_at IS NOT NULL THEN amount ELSE 0 END), 0) AS credit_settled
     FROM cash_box_transactions ${where}`,
    params
  );

  return {
    cashIn: Number(row.cash_in),
    cashOut: Number(row.cash_out),
    creditIn: Number(row.credit_in),
    creditSettled: Number(row.credit_settled),
    netCash: Number(row.cash_in) - Number(row.cash_out),
  };
}

/**
 * وقتی شخص نسیه بعداً پول را می‌دهد:
 * تراکنش نسیه → نقدی تبدیل می‌شود و موجودی صندوق زیاد می‌گردد.
 */
export async function settleCreditTransaction(transactionId, conn = pool) {
  const [[row]] = await conn.query(
    `SELECT * FROM cash_box_transactions WHERE id = ?`,
    [transactionId]
  );
  if (!row) {
    const error = new Error('تراکنش پیدا نشد.');
    error.status = 404;
    throw error;
  }
  if (row.payment_method !== 'credit') {
    const error = new Error('فقط تراکنش‌های نسیه قابل تسویه هستند.');
    error.status = 400;
    throw error;
  }
  if (row.settled_at) {
    const error = new Error('این نسیه قبلاً تسویه شده است.');
    error.status = 400;
    throw error;
  }

  const person = await customerName(row.customer_id, conn);
  const settledTitle = person
    ? `تسویه نسیه — ${person}`
    : String(row.title || '').replace(/^نسیه\s*—\s*/, 'تسویه نسیه — ') || 'تسویه نسیه';
  const settledNotes = [
    localizeText(row.notes),
    `تسویه در ${formatShamsi(todayIso())}`,
  ].filter(Boolean).join(' | ');

  await conn.query(
    `UPDATE cash_box_transactions
     SET payment_method = 'cash',
         title = ?,
         notes = ?,
         settled_at = NOW()
     WHERE id = ?`,
    [settledTitle, settledNotes, transactionId]
  );

  // همگام‌سازی درآمد مرتبط (اگر از درآمد/فروش/بل آمده)
  if (row.reference_type && row.reference_id) {
    if (row.reference_type === 'income') {
      await conn.query(
        `UPDATE incomes SET payment_method = 'cash', settled_at = NOW() WHERE id = ? AND payment_method = 'credit'`,
        [row.reference_id]
      );
    } else {
      await conn.query(
        `UPDATE incomes
         SET payment_method = 'cash', settled_at = NOW()
         WHERE reference_type = ? AND reference_id = ? AND payment_method = 'credit'`,
        [row.reference_type, row.reference_id]
      );
    }
  }

  const [[updated]] = await conn.query(`SELECT * FROM cash_box_transactions WHERE id = ?`, [transactionId]);
  return updated;
}

export { isCashLike, isCreditLike, methodLabel };
