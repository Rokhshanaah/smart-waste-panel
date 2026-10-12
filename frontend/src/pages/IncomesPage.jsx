import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Search, Pencil, Trash2, ChevronRight, ChevronLeft, Tags
} from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ShamsiDateInput, { todayIso, formatShamsi } from '../components/ShamsiDateInput';
import { PAYMENT_METHODS, isCreditMethod, paymentMethodLabel, normalizePaymentMethod } from '../constants/finance';

const emptyForm = {
  title: '',
  category: '',
  amount: '',
  income_date: '',
  payment_method: 'cash',
  cash_box_id: '',
  customer_id: '',
  notes: '',
};

export default function IncomesPage() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const cashBoxMap = useMemo(
    () => Object.fromEntries(cashBoxes.map((item) => [item.id, item.name])),
    [cashBoxes]
  );
  const customerMap = useMemo(
    () => Object.fromEntries(customers.map((item) => [item.id, item.full_name])),
    [customers]
  );

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get('/incomes', { params: { page, search } });
      setRows(data.data);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  };

  const loadLookups = async () => {
    const [cats, boxes, people] = await Promise.all([
      api.get('/app_categories', { params: { scope: 'income', status: 'active', limit: 100 } }),
      api.get('/cash_boxes', { params: { limit: 100 } }),
      api.get('/customers', { params: { limit: 100 } }),
    ]);
    setCategories(cats.data.data || []);
    setCashBoxes(boxes.data.data || []);
    setCustomers(people.data.data || []);
  };

  useEffect(() => {
    load(1);
    loadLookups();
  }, []);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      income_date: todayIso(),
      category: categories[0]?.name || '',
      cash_box_id: cashBoxes[0]?.id || '',
    });
    setModal({ mode: 'create' });
  };

  const openEdit = (row) => {
    const method = normalizePaymentMethod(row.payment_method);
    setForm({
      title: row.title || '',
      category: row.category || '',
      amount: row.amount ?? '',
      income_date: String(row.income_date || '').slice(0, 10),
      payment_method: method,
      cash_box_id: row.cash_box_id || '',
      customer_id: row.customer_id || '',
      notes: row.notes || '',
    });
    setModal({ mode: 'edit', id: row.id, locked: row.reference_type && row.reference_type !== 'manual' });
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...form,
        cash_box_id: form.cash_box_id ? Number(form.cash_box_id) : null,
        customer_id: isCreditMethod(form.payment_method) && form.customer_id
          ? Number(form.customer_id)
          : null,
        amount: Number(form.amount),
      };
      if (modal.mode === 'create') {
        await api.post('/incomes', payload);
        setMessageType('success');
        setMessage('درآمد با موفقیت اضافه شد.');
      } else {
        await api.put(`/incomes/${modal.id}`, payload);
        setMessageType('success');
        setMessage('درآمد با موفقیت ویرایش شد.');
      }
      setModal(null);
      load(pagination.page);
    } catch (error) {
      setMessageType('error');
      setMessage(error.response?.data?.message || 'عملیات ناموفق بود.');
    }
  };

  const askRemove = (row) => setDeleteTarget({ type: 'row', row });
  const askRemoveCategory = (item) => setDeleteTarget({ type: 'category', row: item });

  const confirmRemove = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      if (deleteTarget.type === 'category') {
        await api.delete(`/app_categories/${deleteTarget.row.id}`);
        if (editingCategory?.id === deleteTarget.row.id) {
          setEditingCategory(null);
          setCategoryName('');
        }
        await loadLookups();
        setMessageType('success');
        setMessage('دسته‌بندی حذف شد.');
      } else {
        await api.delete(`/incomes/${deleteTarget.row.id}`);
        setMessageType('success');
        setMessage('رکورد حذف شد.');
        load(pagination.page);
      }
      setDeleteTarget(null);
    } catch (error) {
      setMessageType('error');
      setMessage(error.response?.data?.message || 'حذف ناموفق بود.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    try {
      if (editingCategory) {
        await api.put(`/app_categories/${editingCategory.id}`, { name, scope: 'income', status: 'active' });
      } else {
        await api.post('/app_categories', { name, scope: 'income', status: 'active' });
      }
      setCategoryName('');
      setEditingCategory(null);
      await loadLookups();
      setMessageType('success');
      setMessage('دسته‌بندی ذخیره شد.');
    } catch (error) {
      setMessageType('error');
      setMessage(error.response?.data?.message || 'ذخیره دسته‌بندی ناموفق بود.');
    }
  };

  const editCategory = (item) => {
    setEditingCategory(item);
    setCategoryName(item.name);
  };

  return (
    <div className="page-shell animate-page">
      <div className="page-heading animate-fade-up">
        <div>
          <h2>درآمدها</h2>
          <p>ثبت درآمد با صندوق؛ روش‌ها: نقدی، نسیه، صرافی</p>
          <div className="related-links">
            <Link className="related-link" to="/areas">مناطق و خانه‌ها</Link>
            <Link className="related-link" to="/cash_box_transactions">صندوق</Link>
            <Link className="related-link" to="/reports">گزارشات</Link>
            <Link className="related-link" to="/">داشبورد</Link>
          </div>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={() => setCategoryModal(true)}>
            <Tags size={16} /> مدیریت دسته‌ها
          </button>
          <button className="primary-button" onClick={openCreate}>
            <Plus size={18} /> افزودن درآمد
          </button>
        </div>
      </div>

      {message && <div className={`alert ${messageType} animate-fade-up`} onClick={() => setMessage('')}>{message}</div>}

      <div className="table-card animate-fade-up delay-1">
        <div className="table-toolbar">
          <form className="search-box" onSubmit={(e) => { e.preventDefault(); load(1); }}>
            <Search size={18} />
            <input placeholder="جستجو در درآمدها..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <span className="record-count">{pagination.total} رکورد</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>عنوان</th>
                <th>دسته</th>
                <th>مبلغ</th>
                <th>تاریخ</th>
                <th>روش</th>
                <th>صندوق</th>
                <th>شخص نسیه</th>
                <th>منبع</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{(pagination.page - 1) * pagination.limit + index + 1}</td>
                  <td>{row.title}</td>
                  <td>{row.category}</td>
                  <td>{Number(row.amount || 0).toLocaleString('en-US')}</td>
                  <td>{formatShamsi(row.income_date)}</td>
                  <td>{paymentMethodLabel(row.payment_method)}</td>
                  <td>{row.cash_box_id ? (cashBoxMap[row.cash_box_id] || `#${row.cash_box_id}`) : '—'}</td>
                  <td>{isCreditMethod(row.payment_method) && row.customer_id ? (customerMap[row.customer_id] || `#${row.customer_id}`) : '—'}</td>
                  <td>{row.reference_type === 'manual' ? 'دستی' : row.reference_type === 'bill' ? 'بل' : row.reference_type === 'house_fee' ? 'فیس خانه' : row.reference_type === 'payment' ? 'پرداخت' : 'بازیافت'}</td>
                  <td>
                    <div className="actions">
                      <button type="button" className="edit-button" onClick={() => openEdit(row)} title="ویرایش">
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="delete-button" onClick={() => askRemove(row)} title="حذف">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !rows.length && <tr><td colSpan="10" className="empty-state">هیچ رکوردی پیدا نشد.</td></tr>}
              {loading && <tr><td colSpan="10" className="empty-state">در حال دریافت اطلاعات...</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}><ChevronRight size={17} /></button>
          <span>صفحه {pagination.page} از {pagination.pages || 1}</span>
          <button disabled={pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)}><ChevronLeft size={17} /></button>
        </div>
      </div>

      {modal && (
        <Modal title={`${modal.mode === 'create' ? 'افزودن' : 'ویرایش'} درآمد`} onClose={() => setModal(null)}>
          <form className="crud-form" onSubmit={submit}>
            {modal.locked ? (
              <div className="note-box">این درآمد خودکار است. ویرایش آن ممکن است با بخش مبدأ ناهماهنگ شود.</div>
            ) : null}
            <div className="form-grid">
              <label>
                <span>عنوان درآمد *</span>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </label>
              <label>
                <span>دسته‌بندی *</span>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
                  <option value="">انتخاب کنید</option>
                  {categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                </select>
              </label>
              <label>
                <span>مبلغ *</span>
                <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </label>
              <label>
                <span>روش دریافت *</span>
                <select
                  value={form.payment_method}
                  onChange={(e) => {
                    const method = e.target.value;
                    setForm({
                      ...form,
                      payment_method: method,
                      customer_id: isCreditMethod(method) ? form.customer_id : '',
                    });
                  }}
                  required
                >
                  {PAYMENT_METHODS.map(([value, text]) => (
                    <option key={value} value={value}>{text}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>صندوق *</span>
                <select value={form.cash_box_id} onChange={(e) => setForm({ ...form, cash_box_id: e.target.value })} required>
                  <option value="">انتخاب صندوق</option>
                  {cashBoxes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              {isCreditMethod(form.payment_method) && (
                <label>
                  <span>شخص نسیه *</span>
                  <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required>
                    <option value="">انتخاب شخص</option>
                    {customers.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
                  </select>
                </label>
              )}
              <label>
                <span>تاریخ *</span>
                <ShamsiDateInput
                  value={form.income_date || todayIso()}
                  onChange={(iso) => setForm({ ...form, income_date: iso })}
                  required
                />
              </label>
              <label className="full-field">
                <span>توضیحات</span>
                <textarea rows="4" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>انصراف</button>
              <button className="primary-button">ذخیره معلومات</button>
            </div>
          </form>
        </Modal>
      )}

      {categoryModal && (
        <Modal title="مدیریت دسته‌بندی درآمد" onClose={() => { setCategoryModal(false); setEditingCategory(null); setCategoryName(''); }}>
          <div className="crud-form">
            <form className="category-form" onSubmit={saveCategory}>
              <input
                placeholder="نام دسته‌بندی جدید..."
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                required
              />
              <button className="primary-button" type="submit">
                {editingCategory ? 'ویرایش دسته' : 'افزودن دسته'}
              </button>
              {editingCategory && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => { setEditingCategory(null); setCategoryName(''); }}
                >
                  انصراف ویرایش
                </button>
              )}
            </form>

            <div className="category-list">
              {categories.map((item) => (
                <div className="category-item" key={item.id}>
                  <strong>{item.name}</strong>
                  <div className="actions">
                    <button className="edit-button" type="button" onClick={() => editCategory(item)}><Pencil size={15} /></button>
                    <button className="delete-button" type="button" onClick={() => askRemoveCategory(item)}><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
              {!categories.length && <div className="empty-inline">هنوز دسته‌ای ثبت نشده است.</div>}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="تأیید حذف"
        message={
          deleteTarget?.type === 'category'
            ? `دسته‌بندی «${deleteTarget.row.name}» حذف شود؟`
            : 'آیا از حذف این درآمد مطمئن هستید؟'
        }
        onConfirm={confirmRemove}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        busy={deleteBusy}
      />
    </div>
  );
}
