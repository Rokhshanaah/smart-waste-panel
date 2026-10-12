import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { getCashBalance, getCashBoxesOverview, getCashPeriodTotals } from '../utils/finance.js';
import { getHouseFeeProgress, isoToFeePeriod } from '../utils/houseFeeProgress.js';
import { shamsiMonthRange, todayIso } from '../utils/shamsi.js';

const router = Router();
router.use(authenticate);

function periodClause(column, from, to) {
  const clauses = [];
  const params = [];
  if (from) {
    clauses.push(`${column} >= ?`);
    params.push(from);
  }
  if (to) {
    clauses.push(`${column} <= ?`);
    params.push(to);
  }
  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const defaults = shamsiMonthRange(todayIso());
    const from = req.query.from || defaults.from;
    const to = req.query.to || defaults.to;
    const cashBoxId = req.query.cash_box_id || null;

    const incomePeriod = periodClause('income_date', from, to);
    const expensePeriod = periodClause('expense_date', from, to);
    const billPeriod = periodClause('due_date', from, to);
    const recyclingPeriod = periodClause('record_date', from, to);

    const [[incomeTotal]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM incomes ${incomePeriod.sql}`,
      incomePeriod.params
    );
    const [[expenseTotal]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses ${expensePeriod.sql}`,
      expensePeriod.params
    );
    const [incomeByCategory] = await pool.query(
      `SELECT category, COALESCE(SUM(amount), 0) AS total
       FROM incomes ${incomePeriod.sql}
       GROUP BY category
       ORDER BY total DESC`,
      incomePeriod.params
    );
    const [expenseByCategory] = await pool.query(
      `SELECT category, COALESCE(SUM(amount), 0) AS total
       FROM expenses ${expensePeriod.sql}
       GROUP BY category
       ORDER BY total DESC`,
      expensePeriod.params
    );
    const [[bills]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
         SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial_count,
         SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END) AS unpaid,
         COALESCE(SUM(amount), 0) AS amount_total,
         COALESCE(SUM(paid_amount), 0) AS paid_total
       FROM bills ${billPeriod.sql}`,
      billPeriod.params
    );
    const [[sales]] = await pool.query(
      `SELECT
         COALESCE(SUM(weight_kg), 0) AS weight,
         COALESCE(SUM(total_amount), 0) AS amount
       FROM recycling_records
       ${recyclingPeriod.sql ? `${recyclingPeriod.sql} AND` : 'WHERE'} transaction_type = 'sale'`,
      recyclingPeriod.params
    );
    const [[stock]] = await pool.query(
      `SELECT COALESCE(SUM(weight_kg), 0) AS weight
       FROM recycling_records
       ${recyclingPeriod.sql ? `${recyclingPeriod.sql} AND` : 'WHERE'} transaction_type = 'stock'`,
      recyclingPeriod.params
    );

    const cashPeriod = await getCashPeriodTotals({ from, to, cashBoxId });
    const cash = await getCashBalance(cashBoxId);
    const cashOverview = await getCashBoxesOverview();
    const feePeriod = isoToFeePeriod(to || from);
    const houseFeeProgress = await getHouseFeeProgress(feePeriod);

    const monthlyIncome = Number(incomeTotal.total);
    const monthlyExpenses = Number(expenseTotal.total);
    const cashBalance = cashBoxId ? cash.balance : cashOverview.total.balance;
    const creditOpen = cashBoxId ? cash.creditIn : cashOverview.total.creditIn;

    res.json({
      from,
      to,
      feePeriod,
      summary: {
        totalIncome: monthlyIncome,
        totalExpenses: monthlyExpenses,
        netProfit: monthlyIncome - monthlyExpenses,
        cashBalance,
        creditOpen,
        cashIn: cashPeriod.cashIn,
        cashOut: cashPeriod.cashOut,
        creditIn: cashPeriod.creditIn,
        creditSettled: cashPeriod.creditSettled,
        materialSalesAmount: Number(sales.amount),
        materialSalesWeight: Number(sales.weight),
        materialStockWeight: Number(stock.weight),
        billsTotal: Number(bills.total),
        billsPaid: Number(bills.paid),
        billsPartial: Number(bills.partial_count),
        billsUnpaid: Number(bills.unpaid),
        billsAmount: Number(bills.amount_total),
        billsCollected: Number(bills.paid_total),
        collectionRate: bills.amount_total > 0
          ? Math.round((Number(bills.paid_total) / Number(bills.amount_total)) * 100)
          : 0,
        feePeriod: houseFeeProgress.period,
        housesTotal: houseFeeProgress.totals.housesTotal,
        housesPaid: houseFeeProgress.totals.housesPaid,
        housesUnpaid: houseFeeProgress.totals.housesUnpaid,
        feeAmountPaid: houseFeeProgress.totals.amountPaid,
        feeAmountUnpaid: houseFeeProgress.totals.amountUnpaid,
        feeAmountTotal: houseFeeProgress.totals.amountTotal,
        houseCollectionRate: houseFeeProgress.totals.progressPercent,
        districts: houseFeeProgress.counts.districts,
        passages: houseFeeProgress.counts.passages,
        alleys: houseFeeProgress.counts.alleys,
      },
      incomeByCategory,
      expenseByCategory,
      cash,
      cashOverview,
      houseFeeProgress,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
