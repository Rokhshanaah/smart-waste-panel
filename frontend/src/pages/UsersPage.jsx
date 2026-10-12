import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, ChevronRight, ChevronLeft, Shield } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { ALL_PERMISSION_KEYS, PAGE_PERMISSIONS, normalizePermissions } from '../permissionsCatalog';

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  password: '',
  role: 'employee',
  status: 'active',
  permissions: ['dashboard'],
};

export default function UsersPage() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get('/users', { params: { page, search } });
      setRows(data.data);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setModal({ mode: 'create' });
  };

  const openEdit = (row) => {
    setForm({
      full_name: row.full_name || '',
      email: row.email || '',
      phone: row.phone || '',
      password: '',
      role: row.role || 'employee',
      status: row.status || 'active',
      permissions: normalizePermissions(row.role, row.permissions),
    });
    setModal({ mode: 'edit', id: row.id });
  };

  const togglePermission = (key) => {
    if (form.role === 'admin') return;
    setForm((prev) => {
      const exists = prev.permissions.includes(key);
      const permissions = exists
        ? prev.permissions.filter((item) => item !== key)
        : [...prev.permissions, key];
      if (!permissions.includes('dashboard')) permissions.unshift('dashboard');
      return { ...prev, permissions };
    });
  };

  const selectAll = () => {
    if (form.role === 'admin') return;
    setForm((prev) => ({ ...prev, permissions: [...ALL_PERMISSION_KEYS] }));
  };

  const clearAll = () => {
    if (form.role === 'admin') return;
    setForm((prev) => ({ ...prev, permissions: ['dashboard'] }));
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      let email = String(form.email || '').trim();
      let phone = String(form.phone || '').trim();

      // If browser wrongly put email into phone field, recover it.
      if (!email && phone.includes('@')) {
        email = phone;
        phone = '';
      }

      if (!email || !email.includes('@')) {
        setMessage('ایمیل (نام کاربری) الزامی است و باید معتبر باشد.');
        return;
      }

      if (phone.includes('@')) {
        setMessage('شماره تماس نباید ایمیل باشد. ایمیل را فقط در فیلد ایمیل وارد کنید.');
        return;
      }

      const payload = {
        ...form,
        email,
        phone,
        permissions: normalizePermissions(form.role, form.permissions),
      };
      if (modal.mode === 'edit' && !payload.password) delete payload.password;

      if (modal.mode === 'create') {
        await api.post('/users', payload);
        setMessage('کاربر با موفقیت اضافه شد.');
      } else {
        await api.put(`/users/${modal.id}`, payload);
        setMessage('کاربر با موفقیت ویرایش شد.');
      }
      setModal(null);
      load(pagination.page);
    } catch (error) {
      setMessage(error.response?.data?.message || 'عملیات ناموفق بود.');
    }
  };

  const askRemove = (row) => setDeleteTarget(row);

  const confirmRemove = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      setMessage('کاربر حذف شد.');
      setDeleteTarget(null);
      load(pagination.page);
    } catch (error) {
      setMessage(error.response?.data?.message || 'حذف کاربر ناموفق بود.');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="page-shell animate-page">
      <div className="page-heading animate-fade-up">
        <div>
          <h2>کاربران و صلاحیت‌ها</h2>
          <p>تعیین دسترسی هر کاربر به صفحات پنل</p>
        </div>
        <button className="primary-button" onClick={openCreate}><Plus size={18} /> افزودن کاربر</button>
      </div>

      {message && <div className="alert success animate-fade-up" onClick={() => setMessage('')}>{message}</div>}

      <div className="table-card animate-fade-up delay-1">
        <div className="table-toolbar">
          <form className="search-box" onSubmit={(e) => { e.preventDefault(); load(1); }}>
            <Search size={18} />
            <input placeholder="جستجو در کاربران..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <span className="record-count">{pagination.total} رکورد</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>نام کامل</th>
                <th>ایمیل</th>
                <th>شماره تماس</th>
                <th>نقش</th>
                <th>تعداد صفحات</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{(pagination.page - 1) * pagination.limit + index + 1}</td>
                  <td>{row.full_name}</td>
                  <td>{row.email}</td>
                  <td>{row.phone || '—'}</td>
                  <td>{roleLabel(row.role)}</td>
                  <td>{normalizePermissions(row.role, row.permissions).length}</td>
                  <td>{row.status === 'active' ? 'فعال' : 'غیرفعال'}</td>
                  <td>
                    <div className="actions">
                      <button className="edit-button" onClick={() => openEdit(row)} title="ویرایش"><Pencil size={16} /></button>
                      <button className="delete-button" onClick={() => askRemove(row)} title="حذف"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !rows.length && <tr><td colSpan="8" className="empty-state">هیچ کاربری پیدا نشد.</td></tr>}
              {loading && <tr><td colSpan="8" className="empty-state">در حال دریافت اطلاعات...</td></tr>}
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
        <Modal title={`${modal.mode === 'create' ? 'افزودن' : 'ویرایش'} کاربر`} onClose={() => setModal(null)}>
          <form className="crud-form" onSubmit={submit} autoComplete="off">
            {/* decoy fields to absorb browser autofill away from phone */}
            <input type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden="true" className="autofill-decoy" />
            <input type="password" name="password" autoComplete="current-password" tabIndex={-1} aria-hidden="true" className="autofill-decoy" />

            <div className="form-grid">
              <label>
                <span>نام کامل *</span>
                <input
                  name="full_name"
                  autoComplete="off"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                />
              </label>
              <label>
                <span>ایمیل (نام کاربری) *</span>
                <input
                  type="email"
                  name="user_email"
                  autoComplete="off"
                  inputMode="email"
                  placeholder="user@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </label>
              <label>
                <span>رمز عبور {modal.mode === 'create' ? '*' : '(اختیاری)'}</span>
                <input
                  type="password"
                  name="user_password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={modal.mode === 'create'}
                />
              </label>
              <label>
                <span>شماره تماس</span>
                <input
                  type="text"
                  name="contact_mobile_number"
                  autoComplete="off"
                  inputMode="numeric"
                  placeholder="0700000000"
                  readOnly
                  onFocus={(e) => e.currentTarget.removeAttribute('readOnly')}
                  value={form.phone}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d+\-\s]/g, '');
                    setForm({ ...form, phone: value });
                  }}
                />
              </label>
              <label>
                <span>نقش *</span>
                <select
                  value={form.role}
                  onChange={(e) => {
                    const role = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      role,
                      permissions: normalizePermissions(role, role === 'admin' ? ALL_PERMISSION_KEYS : prev.permissions),
                    }));
                  }}
                  required
                >
                  <option value="admin">مدیر</option>
                  <option value="accountant">حسابدار</option>
                  <option value="employee">کارمند</option>
                  <option value="driver">راننده</option>
                  <option value="citizen">شهروند</option>
                </select>
              </label>
              <label>
                <span>وضعیت *</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} required>
                  <option value="active">فعال</option>
                  <option value="inactive">غیرفعال</option>
                </select>
              </label>
            </div>

            <div className="permissions-box">
              <div className="permissions-head">
                <div>
                  <strong><Shield size={16} /> صلاحیت صفحات</strong>
                  <p>صفحات مجاز را برای این کاربر انتخاب کنید</p>
                </div>
                <div className="permissions-actions">
                  <button type="button" className="secondary-button" onClick={selectAll} disabled={form.role === 'admin'}>همه</button>
                  <button type="button" className="secondary-button" onClick={clearAll} disabled={form.role === 'admin'}>حداقلی</button>
                </div>
              </div>
              {form.role === 'admin' && (
                <div className="note-box">مدیر سیستم به‌صورت خودکار به همه صفحات دسترسی دارد.</div>
              )}
              <div className="permissions-grid">
                {PAGE_PERMISSIONS.map((page) => {
                  const checked = form.role === 'admin' || form.permissions.includes(page.key);
                  return (
                    <label key={page.key} className={`permission-item ${checked ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={form.role === 'admin' || page.key === 'dashboard'}
                        onChange={() => togglePermission(page.key)}
                      />
                      <span>{page.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>انصراف</button>
              <button className="primary-button">ذخیره معلومات</button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="تأیید حذف کاربر"
        message={deleteTarget ? `آیا از حذف کاربر «${deleteTarget.full_name}» مطمئن هستید؟` : ''}
        onConfirm={confirmRemove}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        busy={deleteBusy}
      />
    </div>
  );
}

function roleLabel(role) {
  return ({
    admin: 'مدیر',
    accountant: 'حسابدار',
    employee: 'کارمند',
    driver: 'راننده',
    citizen: 'شهروند',
  })[role] || role;
}
