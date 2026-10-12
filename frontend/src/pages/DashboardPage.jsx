import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, MapPinned, Truck, MessageSquareWarning, Banknote, CircleDollarSign,
  TrendingUp, TrendingDown, Recycle, Landmark, PackageOpen, ArrowLeft, Home
} from 'lucide-react';
import api from '../services/api';

const currency = (value) => `${Number(value || 0).toLocaleString('en-US')} افغانی`;
const num = (value) => Number(value || 0).toLocaleString('en-US');

export default function DashboardPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then((response) => setData(response.data)).catch(() => setData(null));
  }, []);

  const fee = data?.houseFeeProgress;
  const periodLabel = data?.shamsiPeriod ? `ماه ${data.shamsiPeriod}` : 'ماه جاری';

  const cards = [
    ['تعداد شهروندان', num(data?.customers), Users, '/customers', 'info'],
    ['تعداد ناحیه‌ها', num(data?.districts ?? data?.areas), MapPinned, '/areas', 'info'],
    ['تعداد خانه‌ها', num(data?.houses), Home, '/areas', 'info'],
    ['تعداد موترها', num(data?.trucks), Truck, '/trucks', 'info'],
    ['برنامه جمع‌آوری', num(data?.activeSchedules), MapPinned, '/collection_schedules', 'info'],
    ['شکایت‌های باز', num(data?.openComplaints), MessageSquareWarning, '/complaints', 'warn'],
    [`سود ناخالص (${periodLabel})`, currency(data?.monthlyIncome), CircleDollarSign, '/incomes', 'good'],
    [`هزینه (${periodLabel})`, currency(data?.monthlyExpenses), Banknote, '/expenses', 'warn'],
    [`ضرر (${periodLabel})`, currency(data?.loss), TrendingDown, '/reports', 'warn'],
    ['سود خالص ماه', currency(data?.netProfit), TrendingUp, '/reports', 'accent'],
    ['موجودی نقدی سیستم', currency(data?.cashBalance), Landmark, '/cash_box_transactions', 'accent'],
    ['نسیه باز', currency(data?.creditOpen), Banknote, '/cash_box_transactions', 'warn'],
    [`فروش مواد (${periodLabel})`, currency(data?.materialSales), PackageOpen, '/material_sales', 'good'],
    [`ورود انبار (${periodLabel})`, `${num(data?.recycledKg)} کیلو`, Recycle, '/recycling_records', 'info'],
    ['فیس پرداخت‌شده ماه', num(fee?.totals?.housesPaid), Home, '/areas', 'good'],
    ['فیس مانده ماه', num(fee?.totals?.housesUnpaid), Home, '/areas', 'warn'],
  ];

  return (
    <div className="page-shell animate-page">
      <div className="page-heading animate-fade-up">
        <div>
          <h2>داشبورد مدیریتی</h2>
          <p>
            آمار ماه شمسی جاری
            {data?.shamsiPeriod ? ` (${data.shamsiPeriod})` : ''}
            {' '}بر اساس وقت کابل — فیس خانه‌ها، صندوق و مالی
          </p>
          <div className="related-links">
            <Link className="related-link" to="/areas">مناطق و خانه‌ها</Link>
            <Link className="related-link" to="/customers">شهروندان</Link>
            <Link className="related-link" to="/collection_schedules">برنامه جمع‌آوری</Link>
            <Link className="related-link" to="/reports">گزارشات</Link>
          </div>
        </div>
        <Link className="secondary-button" to="/reports">مشاهده گزارشات <ArrowLeft size={16} /></Link>
      </div>

      <div className="stats-grid dense animate-stagger">
        {cards.map(([label, value, Icon, to, tone]) => (
          <Link className={`stat-card tone-${tone} clickable`} to={to} key={label}>
            <div className="stat-icon"><Icon size={20} /></div>
            <div><span>{label}</span><strong>{data ? value : '...'}</strong></div>
          </Link>
        ))}
      </div>

      <div className="dashboard-panels animate-fade-up delay-2">
        <div className="panel">
          <h3>وضعیت فیس خانه‌ها {fee?.period ? `(ماه ${fee.period})` : ''}</h3>
          {(fee?.districts || []).length ? (
            <>
              <div className="progress-item">
                <span>کل پیشرفت ناحیه‌ها</span>
                <strong>{fee?.totals?.progressPercent ?? 0}%</strong>
                <div><i style={{ width: `${fee?.totals?.progressPercent || 0}%` }} /></div>
              </div>
              <p style={{ margin: '8px 0 14px', color: 'var(--muted)', fontSize: 14 }}>
                {num(fee?.totals?.housesPaid)} خانه پرداخت‌شده از{' '}
                {num(fee?.totals?.housesTotal)} خانه —
                جمع‌شده {currency(fee?.totals?.amountPaid)}،
                مانده {currency(fee?.totals?.amountUnpaid)}
              </p>
              <div className="collection-list compact">
                {fee.districts.slice(0, 8).map((district) => (
                  <div className="collection-row" key={district.id}>
                    <div className="collection-main">
                      <strong>{district.name}</strong>
                      <p>
                        {num(district.housesTotal)} خانه؛
                        پرداخت‌شده {num(district.housesPaid)}؛
                        مانده {num(district.housesUnpaid)} —
                        جمع {currency(district.amountPaid)}
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
                مدیریت مناطق و خانه‌ها
              </Link>
            </>
          ) : (
            <div className="empty-inline">
              هنوز ناحیه‌ای ثبت نشده است.
              <Link to="/areas"> افزودن ناحیه و خانه</Link>
            </div>
          )}
        </div>

        <div className="panel">
          <h3>شاخص‌های عملکرد امروز</h3>
          <div className="progress-item">
            <span>نرخ وصول فیس ماه</span>
            <strong>{data?.houseFeeRate ?? 0}%</strong>
            <div><i style={{ width: `${data?.houseFeeRate || 0}%` }} /></div>
          </div>
          <div className="progress-item">
            <span>وصول بل‌ها (ماه)</span>
            <strong>{data?.billCollectionRate ?? 0}%</strong>
            <div><i style={{ width: `${data?.billCollectionRate || 0}%` }} /></div>
          </div>
          <div className="progress-item">
            <span>رسیدگی به شکایت‌ها</span>
            <strong>{data?.complaintRate ?? 0}%</strong>
            <div><i style={{ width: `${data?.complaintRate || 0}%` }} /></div>
          </div>
          <div className="progress-item">
            <span>ورود نقدی صندوق امروز</span>
            <strong>{currency(data?.cashInToday)}</strong>
            <div><i style={{ width: `${Math.min(Number(data?.cashInToday || 0) ? 70 : 0, 100)}%` }} /></div>
          </div>
          <div className="progress-item">
            <span>خروج نقدی صندوق امروز</span>
            <strong>{currency(data?.cashOutToday)}</strong>
            <div><i style={{ width: `${Math.min(Number(data?.cashOutToday || 0) ? 70 : 0, 100)}%` }} /></div>
          </div>
          {Number(data?.creditInToday || 0) > 0 && (
            <div className="progress-item">
              <span>نسیه ثبت‌شده امروز</span>
              <strong>{currency(data?.creditInToday)}</strong>
              <div><i style={{ width: 40 }} /></div>
            </div>
          )}
          {(data?.cashBoxes || []).length > 0 && (
            <div className="collection-list compact" style={{ marginTop: 12 }}>
              {data.cashBoxes.map((box) => (
                <div className="collection-row" key={box.id}>
                  <div className="collection-main">
                    <strong>{box.name}</strong>
                    <p>
                      موجودی نقدی {currency(box.balance)}
                      {Number(box.creditIn) > 0 ? ` — نسیه باز ${currency(box.creditIn)}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="note-box">
            موجودی نقدی فقط نقدی و صرافی است؛ نسیه تا تسویه در موجودی نقدی نمی‌آید.
          </div>
        </div>
      </div>
    </div>
  );
}
