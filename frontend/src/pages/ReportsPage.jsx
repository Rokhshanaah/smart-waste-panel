import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CircleDollarSign, Banknote, TrendingUp, Landmark, Recycle,
  ReceiptText, PackageOpen, Filter, Home, MapPinned
} from 'lucide-react';
import api from '../services/api';
import ShamsiDateInput from '../components/ShamsiDateInput';
import { jalaaliMonthLength, jalaaliToIso, isoToJalaali, todayIso } from '../utils/shamsi';

const currency = (value) => `${Number(value || 0).toLocaleString('en-US')} افغانی`;
const num = (value) => Number(value || 0).toLocaleString('en-US');

function shamsiMonthRange() {
  const j = isoToJalaali(todayIso());
  const from = jalaaliToIso(j.jy, j.jm, 1);
  const to = jalaaliToIso(j.jy, j.jm, jalaaliMonthLength(j.jy, j.jm));
  return { from, to };
}

export default function ReportsPage() {
  const defaults = shamsiMonthRange();
  const [filters, setFilters] = useState(defaults);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async (next = filters) => {
    setLoading(true);
    try {
      const { data: report } = await api.get('/reports', { params: next });
      setData(report);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const summary = data?.summary;
  const fee = data?.houseFeeProgress;
  const incomeCats = data?.incomeByCategory || [];
  const expenseCats = data?.expenseByCategory || [];
  const boxes = data?.cashOverview?.boxes || [];

  const cards = [
    ['کل درآمد', currency(summary?.totalIncome), CircleDollarSign, 'good', '/incomes'],
    ['کل هزینه', currency(summary?.totalExpenses), Banknote, 'warn', '/expenses'],
    ['سود خالص', currency(summary?.netProfit), TrendingUp, 'accent', '/reports'],
    ['موجودی نقدی', currency(summary?.cashBalance), Landmark, 'info', '/cash_box_transactions'],
    ['نسیه باز', currency(summary?.creditOpen), Banknote, 'warn', '/cash_box_transactions'],
    ['ورود نقدی', currency(summary?.cashIn), Landmark, 'good', '/cash_box_transactions'],
    ['خروج نقدی', currency(summary?.cashOut), Landmark, 'warn', '/cash_box_transactions'],
    ['فروش مواد', currency(summary?.materialSalesAmount), PackageOpen, 'good', '/material_sales'],
    ['وزن فروش', `${num(summary?.materialSalesWeight)} کیلو`, Recycle, 'accent', '/recycling_records'],
    ['ورود انبار', `${num(summary?.materialStockWeight)} کیلو`, Recycle, 'info', '/recycling_records'],
    ['وصول بل‌ها', `${summary?.collectionRate ?? 0}%`, ReceiptText, 'info', '/bills'],
    ['بل‌های پرداخت‌شده', `${num(summary?.billsPaid)} از ${num(summary?.billsTotal)}`, ReceiptText, 'good', '/bills'],
    ['کل خانه‌ها', num(summary?.housesTotal), Home, 'info', '/areas'],
    ['فیس پرداخت‌شده', num(summary?.housesPaid), Home, 'good', '/areas'],
    ['فیس مانده', num(summary?.housesUnpaid), Home, 'warn', '/areas'],
    ['نرخ وصول فیس', `${summary?.houseCollectionRate ?? 0}%`, Home, 'accent', '/areas'],
    ['مبلغ فیس جمع‌شده', currency(summary?.feeAmountPaid), CircleDollarSign, 'good', '/areas'],
    ['مبلغ فیس مانده', currency(summary?.feeAmountUnpaid), Banknote, 'warn', '/areas'],
    ['تعداد ناحیه‌ها', num(summary?.districts), MapPinned, 'info', '/areas'],
  ];

  return (
    <div className="page-shell animate-page">
      <div className="page-heading animate-fade-up">
        <div>
          <h2>گزارشات</h2>
          <p>
            خلاصه دقیق مالی، صندوق، فروش مواد و فیس ماهانه خانه‌ها
            {summary?.feePeriod ? ` — فیس ماه ${summary.feePeriod}` : ''}
          </p>
          <div className="related-links">
            <Link className="related-link" to="/">داشبورد</Link>
            <Link className="related-link" to="/areas">مناطق و خانه‌ها</Link>
            <Link className="related-link" to="/customers">شهروندان</Link>
            <Link className="related-link" to="/cash_box_transactions">صندوق</Link>
          </div>
        </div>
      </div>

      <form
        className="filter-bar animate-fade-up delay-1"
        onSubmit={(event) => {
          event.preventDefault();
          load(filters);
        }}
      >
        <div className="filter-title"><Filter size={16} /> فیلتر تاریخ</div>
        <label>
          <span>از تاریخ</span>
          <ShamsiDateInput
            value={filters.from || todayIso()}
            onChange={(iso) => setFilters({ ...filters, from: iso })}
          />
        </label>
        <label>
          <span>تا تاریخ</span>
          <ShamsiDateInput
            value={filters.to || todayIso()}
            onChange={(iso) => setFilters({ ...filters, to: iso })}
          />
        </label>
        <button className="primary-button" type="submit">اعمال فیلتر</button>
      </form>

      <div className="stats-grid animate-stagger">
        {cards.map(([label, value, Icon, tone, to]) => (
          <Link className={`stat-card tone-${tone} clickable`} to={to} key={label}>
            <div className="stat-icon"><Icon size={20} /></div>
            <div><span>{label}</span><strong>{loading ? '...' : value}</strong></div>
          </Link>
        ))}
      </div>

      <div className="dashboard-panels animate-fade-up delay-2" style={{ marginTop: 20 }}>
        <div className="panel">
          <h3>فیس خانه‌ها بر اساس ناحیه {fee?.period ? `(ماه ${fee.period})` : ''}</h3>
          {(fee?.districts || []).length ? (
            <>
              <div className="progress-item">
                <span>کل پیشرفت</span>
                <strong>{fee?.totals?.progressPercent ?? 0}%</strong>
                <div><i style={{ width: `${fee?.totals?.progressPercent || 0}%` }} /></div>
              </div>
              <p style={{ margin: '8px 0 14px', color: 'var(--muted)', fontSize: 14 }}>
                جمع‌شده {currency(fee?.totals?.amountPaid)} از {currency(fee?.totals?.amountTotal)} —
                مانده {currency(fee?.totals?.amountUnpaid)}
              </p>
              <div className="collection-list compact">
                {fee.districts.map((district) => (
                  <div className="collection-row" key={district.id}>
                    <div className="collection-main">
                      <strong>{district.name}</strong>
                      <p>
                        {num(district.housesTotal)} خانه —
                        پرداخت‌شده {num(district.housesPaid)}،
                        مانده {num(district.housesUnpaid)} —
                        جمع {currency(district.amountPaid)} / کل {currency(district.amountTotal)}
                      </p>
                      <div className="progress-item compact">
                        <span>پیشرفت</span>
                        <strong>{district.progressPercent}%</strong>
                        <div><i style={{ width: `${district.progressPercent}%` }} /></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Link className="secondary-button" to="/areas" style={{ marginTop: 12, display: 'inline-flex' }}>
                رفتن به مناطق و خانه‌ها
              </Link>
            </>
          ) : (
            <div className="empty-inline">
              داده‌ای برای فیس خانه‌ها نیست.
              <Link to="/areas"> ثبت ناحیه و خانه</Link>
            </div>
          )}
        </div>

        <div className="panel">
          <h3>جزئیات مالی</h3>
          <div className="progress-item">
            <span>ورود نقدی / صرافی</span>
            <strong>{currency(summary?.cashIn)}</strong>
            <div><i style={{ width: `${Math.min(Number(summary?.cashIn || 0) ? 70 : 0, 100)}%` }} /></div>
          </div>
          <div className="progress-item">
            <span>خروج نقدی / صرافی</span>
            <strong>{currency(summary?.cashOut)}</strong>
            <div><i style={{ width: `${Math.min(Number(summary?.cashOut || 0) ? 70 : 0, 100)}%` }} /></div>
          </div>
          {Number(summary?.creditIn || 0) > 0 && (
            <div className="progress-item">
              <span>نسیه باز ثبت‌شده</span>
              <strong>{currency(summary?.creditIn)}</strong>
              <div><i style={{ width: 40 }} /></div>
            </div>
          )}
          <div className="progress-item">
            <span>مبلغ کل فیس ماه</span>
            <strong>{currency(summary?.feeAmountTotal)}</strong>
            <div><i style={{ width: `${summary?.houseCollectionRate || 0}%` }} /></div>
          </div>

          {boxes.length > 0 && (
            <>
              <h4 style={{ marginTop: 16, marginBottom: 8 }}>صندوق‌ها</h4>
              <div className="collection-list compact">
                {boxes.map((box) => (
                  <div className="collection-row" key={box.id}>
                    <div className="collection-main">
                      <strong>{box.name}</strong>
                      <p>
                        موجودی {currency(box.balance)}
                        {Number(box.creditIn) > 0 ? ` — نسیه ${currency(box.creditIn)}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="note-box">
            ورود/خروج صندوق فقط نقدی و صرافی است. نسیه تا تسویه در موجودی نقدی نمی‌آید. آمار فیس با صفحه مناطق همگام است.
          </div>
        </div>
      </div>

      <div className="dashboard-panels animate-fade-up delay-2" style={{ marginTop: 20 }}>
        <div className="panel">
          <h3>درآمد بر اساس دسته</h3>
          {incomeCats.length ? (
            <div className="collection-list compact">
              {incomeCats.map((row) => (
                <div className="collection-row" key={row.category || 'empty'}>
                  <div className="collection-main">
                    <strong>{row.category || 'بدون دسته'}</strong>
                    <p>{currency(row.total)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-inline">در این تاریخ‌ها درآمدی ثبت نشده است.</div>
          )}
        </div>

        <div className="panel">
          <h3>هزینه بر اساس دسته</h3>
          {expenseCats.length ? (
            <div className="collection-list compact">
              {expenseCats.map((row) => (
                <div className="collection-row" key={row.category || 'empty'}>
                  <div className="collection-main">
                    <strong>{row.category || 'بدون دسته'}</strong>
                    <p>{currency(row.total)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-inline">در این تاریخ‌ها هزینه‌ای ثبت نشده است.</div>
          )}
        </div>
      </div>
    </div>
  );
}
