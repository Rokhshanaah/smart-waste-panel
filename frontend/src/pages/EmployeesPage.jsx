import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Search, Pencil, Trash2, ChevronRight, ChevronLeft, Wallet, Banknote
} from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ShamsiDateInput, { todayIso } from '../components/ShamsiDateInput';
import { PAYMENT_METHODS } from '../constants/finance';
import { currentFeePeriod, isoToJalaali, shamsiMonthLabel } from '../utils/shamsi';
import { moduleConfigs } from '../moduleConfigs';

const currency = (value) => `${Number(value || 0).toLocaleString('en-US')} افغانی`;
const config = moduleConfigs.employees;

const emptyEmployee = {
  full_name: '',
  phone: '',
  job_title: '',
  salary: '',
  area_id: '',
  status: 'active',
};

const statusTone = {
  paid: 'good',
  partial: 'warn',
  unpaid: 'info',
};

export default function EmployeesPage() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState(currentFeePeriod());
  const [payroll, setPayroll] = useState([]);
  const [monthOverview, setMonthOverview] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyEmployee);
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({
    amount: '',
    cash_box_id: '',
    payment_method: 'cash',
    expense_date: todayIso(),
    notes: '',
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const payrollMap = useMemo(
    () => Object.fromEntries((payroll || []).map((row) => [Number(row.id), row])),
    [payroll]
  );

  const periodOptions = useMemo(() => {
    if (monthOverview.length) {
      return monthOverview.map((m) => ({ value: m.period, label: m.label, meta: m }));
    }
    const now = isoToJalaali(todayIso());
    const list = [];
    for (let i = 0; i < 8; i += 1) {
      let jm = now.jm - i;
      let jy = now.jy;
      while (jm <= 0) {
        jm += 12;
        jy -= 1;
      }
      const value = `${jy}-${String(jm).padStart(2, '0')}`;
      list.push({ value, label: `${shamsiMonthLabel(jm)} ${jy}` });
    }
    return list;
  }, [monthOverview]);

  const loadMonths = async () => {
    try {
      const { data } = await api.get('/employees/payroll-months', { params: { count: 6 } });
      setMonthOverview(data.months || []);
      if (data.currentPeriod && !period) setPeriod(data.currentPeriod);
    } catch {
      setMonthOverview([]);
    }
  };

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const [{ data: list }, { data: pay }] = await Promise.all([
        api.get('/employees', { params: { page, search, limit: 20 } }),
        api.get('/employees/payroll', { params: { period } }),
      ]);
      setRows(list.data || []);
      setPagination(list.pagination || { page: 1, pages: 1, total: 0, limit: 20 });
      setPayroll(pay.employees || []);
    } finally {
      setLoading(false);
    }
  };

  const loadLookups = async () => {
    const [geo, boxes] = await Promise.all([
      api.get('/geo/districts', { params: { limit: 200 } }).catch(() => ({ data: [] })),
      api.get('/cash_boxes', { params: { limit: 100 } }).catch(() => ({ data: { data: [] } })),
    ]);
    const districtsList = Array.isArray(geo.data) ? geo.data : (geo.data?.data || []);
    setDistricts(districtsList.filter((d) => !d.status || d.status === 'active'));
    setCashBoxes(boxes.data?.data || []);
  };

  useEffect(() => {
    load(1);
    loadLookups();
    loadMonths();
  }, []);

  useEffect(() => {
    api.get('/employees/payroll', { params: { period } })
      .then(({ data }) => setPayroll(data.employees || []))
      .catch(() => setPayroll([]));
    loadMonths();
  }, [period]);

  const openCreate = () => {
    setForm(emptyEmployee);
    setModal({ mode: 'create' });
  };

  const openEdit = (row) => {
    setForm({
      full_name: row.full_name || '',
      phone: row.phone || '',
      job_title: row.job_title || '',
      salary: row.salary ?? '',
      area_id: row.area_id || '',
      status: row.status || 'active',
    });
    setModal({ mode: 'edit', id: row.id });
  };

  const openPay = (row) => {
    const info = payrollMap[row.id] || row;
    setPayForm({
      amount: info.remainingAmount > 0 ? info.remainingAmount : Number(row.salary || 0),
      cash_box_id: cashBoxes[0]?.id || '',
      payment_method: 'cash',
      expense_date: todayIso(),
      notes: '',
    });
    setPayModal(info);
  };

  const submitEmployee = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        salary: Number(form.salary || 0),
        area_id: form.area_id ? Number(form.area_id) : null,
      };
      if (modal.mode === 'create') {
        await api.post('/employees', payload);
        setMessage('کارمند اضافه شد.');
      } else {
        await api.put(`/employees/${modal.id}`, payload);
        setMessage('کارمند ویرایش شد.');
      }
      setMessageType('success');
      setModal(null);
      await load(pagination.page);
    } catch (error) {
      setMessageType('error');
      setMessage(error.response?.data?.message || 'ذخیره کارمند ناموفق بود.');
    }
  };

  const submitPay = async (event) => {
    event.preventDefault();
    if (!payModal?.id) return;
    try {
      await api.post(`/employees/${payModal.id}/pay-salary`, {
        amount: Number(payForm.amount),
        cash_box_id: Number(payForm.cash_box_id),
        payment_method: payForm.payment_method,
        expense_date: payForm.expense_date,
        notes: payForm.notes,
        period,
      });
      setMessageType('success');
      setMessage(`معاش «${payModal.full_name}» پرداخت شد و از صندوق کم گردید.`);
      setPayModal(null);
      const [{ data: pay }] = await Promise.all([
        api.get('/employees/payroll', { params: { period } }),
        loadMonths(),
      ]);
      setPayroll(pay.employees || []);
    } catch (error) {
      setMessageType('error');
      setMessage(error.response?.data?.message || 'پرداخت معاش ناموفق بود.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/employees/${deleteTarget.id}`);
      setMessageType('success');
      setMessage('کارمند حذف شد.');
      setDeleteTarget(null);
      await load(pagination.page);
    } catch (error) {
      setMessageType('error');
      setMessage(error.response?.data?.message || 'حذف ناموفق بود.');
    }
  };

  const summary = useMemo(() => {
    const list = payroll.length ? payroll : rows.map((r) => payrollMap[r.id]).filter(Boolean);
    return {
      unpaid: list.filter((r) => r.payStatus === 'unpaid').length,
      partial: list.filter((r) => r.payStatus === 'partial').length,
      paid: list.filter((r) => r.payStatus === 'paid').length,
      paidAmount: list.reduce((sum, r) => sum + Number(r.paidAmount || 0), 0),
    };
  }, [payroll, rows, payrollMap]);

  const currentMonth = monthOverview.find((m) => m.period === period) || monthOverview.find((m) => m.isCurrent);
  const needsAttention = monthOverview.filter((m) => m.needsPay > 0);

  return (
    <div className="page-shell animate-page">
      <div className="page-heading animate-fade-up">
        <div>
          <h2>کارمندان</h2>
          <p>مدیریت کارمندان و پرداخت معاش ماهانه از صندوق — هر ماه جداگانه پیگیری می‌شود</p>
          <div className="related-links">
            {(config.relatedLinks || []).map((link) => (
              <Link key={link.to} className="related-link" to={link.to}>{link.label}</Link>
            ))}
          </div>
        </div>
        <button className="primary-button" type="button" onClick={openCreate}>
          <Plus size={18} /> افزودن کارمند
        </button>
      </div>

      {message && (
        <div className={`alert ${messageType} animate-fade-up`} onClick={() => setMessage('')}>
          {message}
        </div>
      )}

      {currentMonth?.needsPay > 0 && (
        <div className="alert warn animate-fade-up" style={{ cursor: 'default' }}>
          ماه <strong>{currentMonth.label}</strong>:
          {' '}{currentMonth.needsPay} کارمند هنوز معاش کامل نگرفته‌اند
          (مانده {currency(currentMonth.remainingAmount)}).
          با دکمه کیف پول از همین صفحه پرداخت کنید.
        </div>
      )}

      {monthOverview.length > 0 && (
        <div className="payroll-months animate-fade-up" style={{ marginBottom: 14 }}>
          <div className="stock-materials-head">
            <h3>وضعیت معاش ماه‌ها</h3>
            <p>با آمدن ماه جدید، معاش همان ماه به‌صورت پرداخت‌نشده نشان داده می‌شود</p>
          </div>
          <div className="payroll-months-grid">
            {monthOverview.map((m) => (
              <button
                type="button"
                key={m.period}
                className={`payroll-month-card tone-${statusTone[m.status] || 'info'} ${period === m.period ? 'is-selected' : ''}`}
                onClick={() => setPeriod(m.period)}
              >
                <strong>{m.label}{m.isCurrent ? ' (جاری)' : ''}</strong>
                <span>{m.statusLabel}</span>
                <small>
                  کامل {m.paid} · قسمی {m.partial} · نشده {m.unpaid}
                </small>
              </button>
            ))}
          </div>
          {needsAttention.length > 0 && (
            <div className="note-box" style={{ marginTop: 10 }}>
              ماه‌های نیازمند پرداخت:
              {' '}
              {needsAttention.map((m) => m.label).join('، ')}
            </div>
          )}
        </div>
      )}

      <div className="stats-grid cash-stats animate-stagger" style={{ marginBottom: 12 }}>
        <article className="stat-card tone-info">
          <div className="stat-icon"><Wallet size={20} /></div>
          <div><span>پرداخت‌نشده این ماه</span><strong>{summary.unpaid}</strong></div>
        </article>
        <article className="stat-card tone-warn">
          <div className="stat-icon"><Banknote size={20} /></div>
          <div><span>قسمی</span><strong>{summary.partial}</strong></div>
        </article>
        <article className="stat-card tone-good">
          <div className="stat-icon"><Wallet size={20} /></div>
          <div><span>کامل</span><strong>{summary.paid}</strong></div>
        </article>
        <article className="stat-card tone-accent">
          <div className="stat-icon"><Banknote size={20} /></div>
          <div><span>جمع پرداخت‌شده ماه</span><strong>{currency(summary.paidAmount)}</strong></div>
        </article>
      </div>

      <div className="filter-bar animate-fade-up" style={{ marginBottom: 12 }}>
        <label>
          <span>ماه معاش</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-card animate-fade-up delay-2">
        <div className="table-toolbar">
          <form className="search-box" onSubmit={(e) => { e.preventDefault(); load(1); }}>
            <Search size={18} />
            <input
              placeholder="جستجو در کارمندان..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <span className="record-count">{pagination.total} رکورد</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>نام کامل</th>
                <th>وظیفه</th>
                <th>معاش ماهانه</th>
                <th>پرداخت‌شده</th>
                <th>مانده</th>
                <th>وضعیت معاش</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.map((row, index) => {
                const pay = payrollMap[row.id] || {
                  paidAmount: 0,
                  remainingAmount: Number(row.salary || 0),
                  payStatus: 'unpaid',
                  payStatusLabel: 'پرداخت‌نشده',
                };
                return (
                  <tr key={row.id}>
                    <td>{(pagination.page - 1) * pagination.limit + index + 1}</td>
                    <td>{row.full_name}</td>
                    <td>{row.job_title || '—'}</td>
                    <td>{currency(row.salary)}</td>
                    <td>{currency(pay.paidAmount)}</td>
                    <td>{currency(pay.remainingAmount)}</td>
                    <td>
                      <span className={`badge tone-${statusTone[pay.payStatus] || 'info'}`}>
                        {pay.payStatusLabel}
                      </span>
                    </td>
                    <td>{row.status === 'active' ? 'فعال' : 'غیرفعال'}</td>
                    <td>
                      <div className="actions">
                        {row.status === 'active' && Number(pay.remainingAmount) > 0 && (
                          <button
                            type="button"
                            className="edit-button"
                            title="پرداخت معاش"
                            onClick={() => openPay({ ...row, ...pay })}
                            style={{ color: 'var(--good, #15803d)' }}
                          >
                            <Wallet size={16} />
                          </button>
                        )}
                        <button type="button" className="edit-button" onClick={() => openEdit(row)} title="ویرایش">
                          <Pencil size={16} />
                        </button>
                        <button type="button" className="delete-button" onClick={() => setDeleteTarget(row)} title="حذف">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && !rows.length && (
                <tr><td colSpan={9} className="empty-state">هیچ کارمندی ثبت نشده است.</td></tr>
              )}
              {loading && (
                <tr><td colSpan={9} className="empty-state">در حال دریافت معلومات...</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>
            <ChevronRight size={17} />
          </button>
          <span>صفحه {pagination.page} از {pagination.pages || 1}</span>
          <button disabled={pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)}>
            <ChevronLeft size={17} />
          </button>
        </div>
      </div>

      {modal && (
        <Modal
          title={`${modal.mode === 'create' ? 'افزودن' : 'ویرایش'} کارمند`}
          onClose={() => setModal(null)}
        >
          <form className="crud-form" onSubmit={submitEmployee} autoComplete="off">
            <div className="form-grid">
              <label>
                <span>نام کامل *</span>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </label>
              <label>
                <span>شماره تماس *</span>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              </label>
              <label>
                <span>وظیفه *</span>
                <input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} required />
              </label>
              <label>
                <span>معاش ماهانه *</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.salary}
                  onChange={(e) => setForm({ ...form, salary: e.target.value })}
                  required
                />
              </label>
              <label>
                <span>ناحیه</span>
                <select value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })}>
                  <option value="">—</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>وضعیت *</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">فعال</option>
                  <option value="inactive">غیرفعال</option>
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button className="primary-button" type="submit">ذخیره معلومات</button>
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>انصراف</button>
            </div>
          </form>
        </Modal>
      )}

      {payModal && (
        <Modal title={`پرداخت معاش — ${payModal.full_name}`} onClose={() => setPayModal(null)}>
          <form className="crud-form" onSubmit={submitPay}>
            <div className="note-box" style={{ marginBottom: 12 }}>
              معاش ماهانه: {currency(payModal.salary)} —
              پرداخت‌شده: {currency(payModal.paidAmount)} —
              مانده: {currency(payModal.remainingAmount)}
            </div>
            <div className="form-grid">
              <label>
                <span>مبلغ پرداخت *</span>
                <input
                  type="number"
                  step="0.01"
                  max={payModal.remainingAmount}
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  required
                />
              </label>
              <label>
                <span>صندوق *</span>
                <select
                  value={payForm.cash_box_id}
                  onChange={(e) => setPayForm({ ...payForm, cash_box_id: e.target.value })}
                  required
                >
                  <option value="">انتخاب صندوق</option>
                  {cashBoxes.map((box) => (
                    <option key={box.id} value={box.id}>{box.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>روش پرداخت *</span>
                <select
                  value={payForm.payment_method}
                  onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}
                >
                  {PAYMENT_METHODS.map(([value, text]) => (
                    <option key={value} value={value}>{text}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>تاریخ *</span>
                <ShamsiDateInput
                  value={payForm.expense_date}
                  onChange={(iso) => setPayForm({ ...payForm, expense_date: iso })}
                  required
                />
              </label>
              <label className="full-field">
                <span>توضیحات</span>
                <textarea
                  rows="3"
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="primary-button" type="submit">پرداخت و کسر از صندوق</button>
              <button type="button" className="secondary-button" onClick={() => setPayModal(null)}>انصراف</button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="تأیید حذف"
        message={deleteTarget ? `کارمند «${deleteTarget.full_name}» حذف شود؟` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
