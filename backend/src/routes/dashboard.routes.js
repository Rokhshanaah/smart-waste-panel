import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { getCashBoxesOverview, getCashPeriodTotals } from '../utils/finance.js';
import { getHouseFeeProgress } from '../utils/houseFeeProgress.js';
import { shamsiMonthRange, todayIso } from '../utils/shamsi.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const today = todayIso();
    const month = shamsiMonthRange(today);
    const monthParams = [month.from, month.to];

    const [[customers]] = await pool.query('SELECT COUNT(*) total FROM customers');
    const [[trucks]] = await pool.query('SELECT COUNT(*) total FROM trucks');
    const [[complaints]] = await pool.query(
      "SELECT COUNT(*) total FROM complaints WHERE status NOT IN ('resolved', 'rejected')"
    );
    const [[income]] = await pool.query(
      `SELECT COALESCE(SUM(amount),0) total FROM incomes
       WHERE income_date >= ? AND income_date <= ?`,
      monthParams
    );
    const [[expenses]] = await pool.query(
      `SELECT COALESCE(SUM(amount),0) total FROM expenses
       WHERE expense_date >= ? AND expense_date <= ?`,
      monthParams
    );
    const [[stock]] = await pool.query(
      `SELECT COALESCE(SUM(weight_kg),0) total FROM recycling_records
       WHERE transaction_type = 'stock'
         AND record_date >= ? AND record_date <= ?`,
      monthParams
    );
    const [[sales]] = await pool.query(
      `SELECT
         COALESCE(SUM(total_amount),0) AS amount,
         COALESCE(SUM(weight_kg),0) AS weight
       FROM recycling_records
       WHERE transaction_type = 'sale'
         AND record_date >= ? AND record_date <= ?`,
      monthParams
    );
    const [[bills]] = await pool.query(
      `SELECT
         COUNT(*) total,
         SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) paid,
         COALESCE(SUM(amount),0) amount_total,
         COALESCE(SUM(paid_amount),0) paid_total
       FROM bills
       WHERE due_date >= ? AND due_date <= ?`,
      monthParams
    );
    const [[resolved]] = await pool.query(
      `SELECT
         COUNT(*) total,
         SUM(CASE WHEN status IN ('resolved','rejected') THEN 1 ELSE 0 END) closed
       FROM complaints`
    );
    const [[schedules]] = await pool.query(
      `SELECT COUNT(*) total FROM collection_schedules WHERE status='active'`
    );

    const cashToday = await getCashPeriodTotals({ from: today, to: today });
    const cashOverview = await getCashBoxesOverview();
    const houseFeeProgress = await getHouseFeeProgress(month.period);

    const incomeTotal = Number(income.total);
    const expenseTotal = Number(expenses.total);
    const netProfit = incomeTotal - expenseTotal;
    // مفاد ناخالص: وقتی درآمد بیشتر از هزینه باشد
    const grossProfit = Math.max(0, netProfit);
    // ضرر: وقتی هزینه بیشتر از درآمد باشد
    const loss = Math.max(0, expenseTotal - incomeTotal);
    const billCollectionRate = bills.amount_total > 0
      ? Math.round((Number(bills.paid_total) / Number(bills.amount_total)) * 100)
      : 0;
    const complaintRate = resolved.total > 0
      ? Math.round((Number(resolved.closed) / Number(resolved.total)) * 100)
      : 0;

    res.json({
      today,
      shamsiPeriod: month.period,
      monthFrom: month.from,
      monthTo: month.to,
      customers: customers.total,
      districts: houseFeeProgress.counts.districts,
      passages: houseFeeProgress.counts.passages,
      alleys: houseFeeProgress.counts.alleys,
      houses: houseFeeProgress.counts.houses,
      areas: houseFeeProgress.counts.districts,
      trucks: trucks.total,
      openComplaints: complaints.total,
      monthlyIncome: incomeTotal,
      monthlyExpenses: expenseTotal,
      netProfit,
      grossProfit,
      loss,
      recycledKg: Number(stock.total),
      materialSales: Number(sales.amount),
      materialSalesWeight: Number(sales.weight),
      feeAmountPaid: Number(houseFeeProgress.totals.amountPaid || 0),
      cashBalance: cashOverview.total.balance,
      creditOpen: cashOverview.total.creditIn,
      cashBoxes: cashOverview.boxes,
      cashInToday: cashToday.cashIn,
      cashOutToday: cashToday.cashOut,
      creditInToday: cashToday.creditIn,
      houseFeeRate: houseFeeProgress.totals.progressPercent,
      billCollectionRate,
      complaintRate,
      activeSchedules: schedules.total,
      paidBills: Number(bills.paid),
      totalBills: Number(bills.total),
      houseFeeProgress,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
