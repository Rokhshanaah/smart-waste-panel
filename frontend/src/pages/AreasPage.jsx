import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Home, ClipboardList, MapPinned } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ShamsiDateInput from '../components/ShamsiDateInput';
import { formatShamsi, todayIso } from '../utils/shamsi';

const emptyArea = () => ({
  name: '',
  district: '',
  monthly_fee: '',
  house_count: '',
  status: 'active',
});

export default function AreasPage() {
  const [rows, setRows] = useState([]);
  const [progress, setProgress] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [areaModal, setAreaModal] = useState(null);
  const [collectModal, setCollectModal] = useState(null);
  const [form, setForm] = useState(emptyArea());
  const [collectForm, setCollectForm] = useState({ houses_collected: '', notes: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const flash = (text, type = 'success') => {
    setMessage(text);
    setMessageType(type);
  };

  const loadAreas = async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get('/areas', { params: { page, search } });
      setRows(data.data);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  };

  const loadProgress = async (selectedDate = date) => {
    const { data } = await api.get('/collections/progress', { params: { date: selectedDate } });
    setProgress(data);
  };

  useEffect(() => {
    loadAreas();
  }, []);

  useEffect(() => {
    loadProgress(date);
  }, [date]);

  const openCreate = () => {
    setForm(emptyArea());
    setAreaModal('create');
  };

  const openEdit = (row) => {
    setForm({
      name: row.name || '',
      district: row.district || '',
      monthly_fee: row.monthly_fee ?? '',
      house_count: row.house_count ?? '',
      status: row.status || 'active',
    });
    setAreaModal(row);
  };

  const saveArea = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      monthly_fee: Number(form.monthly_fee || 0),
      house_count: Number(form.house_count || 0),
    };
    if (areaModal === 'create') {
      await api.post('/areas', payload);
      flash('منطقه جدید ثبت شد.');
    } else {
      await api.put(`/areas/${areaModal.id}`, payload);
      flash('منطقه به‌روزرسانی شد.');
    }
    setAreaModal(null);
    await loadAreas(pagination.page);
    await loadProgress(date);
  };

  const askRemove = (row) => setDeleteTarget(row);

  const confirmRemove = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/areas/${deleteTarget.id}`);
      flash('منطقه حذف شد.');
      setDeleteTarget(null);
      await loadAreas(pagination.page);
      await loadProgress(date);
    } catch (error) {
      flash(error.response?.data?.message || 'حذف منطقه ناموفق بود.', 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const openCollect = (area) => {
    const fromRow = rows.find((row) => Number(row.id) === Number(area.id));
    const houseCount = Number(area.houseCount ?? area.house_count ?? fromRow?.house_count ?? 0);
    const housesCollected = Number(area.housesCollected ?? 0);
    setCollectForm({
      houses_collected: String(housesCollected),
      notes: area.notes || '',
    });
    setCollectModal({
      id: area.id,
      name: area.name || fromRow?.name || 'منطقه',
      district: area.district || fromRow?.district || '',
      houseCount,
      housesCollected,
      notes: area.notes || '',
    });
  };

  const saveCollect = async (event) => {
    event.preventDefault();
    const collected = Number(collectForm.houses_collected || 0);
    if (collected > Number(collectModal.houseCount || 0)) {
      flash(`تعداد دریافتی نمی‌تواند بیشتر از ${collectModal.houseCount} خانه باشد.`, 'error');
      return;
    }
    await api.post('/collections/progress', {
      area_id: collectModal.id,
      houses_collected: collected,
      collection_date: date,
      notes: collectForm.notes || null,
    });
    flash(`دریافتی امروز برای «${collectModal.name}» ثبت شد.`);
    setCollectModal(null);
    await loadProgress(date);
  };

  const progressById = Object.fromEntries((progress?.areas || []).map((item) => [item.id, item]));
  const collectedPreview = Number(collectForm.houses_collected || 0);
  const remainingPreview = Math.max(Number(collectModal?.houseCount || 0) - collectedPreview, 0);

  return (
    <div className="areas-page page-shell animate-page">
      <div className="page-heading animate-fade-up">
        <div>
          <h2>مناطق</h2>
          <p>مدیریت گذرها، تعداد خانه‌ها و دریافتی روزانه</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreate}>
          <Plus size={16} /> منطقه جدید
        </button>
      </div>

      {message ? (
        <div className={`alert ${messageType}`} onClick={() => setMessage('')}>{message}</div>
      ) : null}

      <div className="stats-grid dense animate-stagger">
        <article className="stat-card tone-info">
          <div className="stat-icon"><Home size={20} /></div>
          <div>
            <span>کل خانه‌ها</span>
            <strong>{Number(progress?.totals?.housesTotal || 0).toLocaleString('en-US')}</strong>
          </div>
        </article>
        <article className="stat-card tone-good">
          <div className="stat-icon"><ClipboardList size={20} /></div>
          <div>
            <span>دریافتی امروز</span>
            <strong>{Number(progress?.totals?.housesCollected || 0).toLocaleString('en-US')}</strong>
          </div>
        </article>
        <article className="stat-card tone-warn">
          <div className="stat-icon"><Home size={20} /></div>
          <div>
            <span>مانده امروز</span>
            <strong>{Number(progress?.totals?.housesRemaining || 0).toLocaleString('en-US')}</strong>
          </div>
        </article>
        <article className="stat-card tone-accent">
          <div className="stat-icon"><MapPinned size={20} /></div>
          <div>
            <span>پیشرفت جمع‌آوری</span>
            <strong>{progress?.totals?.progressPercent ?? 0}%</strong>
          </div>
        </article>
      </div>

      <div className="areas-toolbar panel animate-fade-up delay-1">
        <label className="areas-date-field">
          <span>تاریخ جمع‌آوری</span>
          <ShamsiDateInput value={date} onChange={setDate} />
        </label>
        <div className="areas-search-wrap">
          <span>جستجو</span>
          <div className="toolbar-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="نام گذر یا ناحیه..."
              onKeyDown={(e) => e.key === 'Enter' && loadAreas(1)}
            />
          </div>
        </div>
        <button className="secondary-button areas-search-btn" type="button" onClick={() => loadAreas(1)}>
          جستجو
        </button>
      </div>

      <div className="table-card areas-table-card animate-fade-up delay-2">
        <div className="areas-table-head">
          <h3>فهرست مناطق — {formatShamsi(date)}</h3>
          <span>{pagination.total || rows.length} منطقه</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>نام گذر / منطقه</th>
              <th>ناحیه</th>
              <th>تعداد خانه</th>
              <th>دریافتی امروز</th>
              <th>مانده</th>
              <th>پیشرفت</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8">در حال بارگذاری...</td></tr>
            ) : rows.length ? rows.map((row) => {
              const day = progressById[row.id];
              const houseCount = Number(row.house_count || 0);
              const collected = day ? day.housesCollected : 0;
              const remaining = day ? day.housesRemaining : houseCount;
              const percent = day ? day.progressPercent : 0;
              return (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                    <div className="areas-row-hint">
                      از {row.name}، {houseCount.toLocaleString('en-US')} خانه موجود است؛
                      دریافتی امروز {collected.toLocaleString('en-US')}؛
                      {' '}{remaining.toLocaleString('en-US')} مانده.
                    </div>
                  </td>
                  <td>{row.district}</td>
                  <td>{houseCount.toLocaleString('en-US')}</td>
                  <td>{collected.toLocaleString('en-US')}</td>
                  <td>{remaining.toLocaleString('en-US')}</td>
                  <td style={{ minWidth: 120 }}>
                    <div className="progress-item compact">
                      <strong>{percent}%</strong>
                      <div><i style={{ width: `${percent}%` }} /></div>
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill ${row.status === 'active' ? 'good' : 'muted'}`}>
                      {row.status === 'active' ? 'فعال' : 'غیرفعال'}
                    </span>
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="edit-button"
                      onClick={() => openCollect(day || {
                        id: row.id,
                        name: row.name,
                        district: row.district,
                        houseCount,
                        housesCollected: 0,
                      })}
                      title="ثبت دریافتی"
                    >
                      <ClipboardList size={15} />
                    </button>
                    <button type="button" className="edit-button" onClick={() => openEdit(row)} title="ویرایش">
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="delete-button" onClick={() => askRemove(row)} title="حذف">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan="8">
                  <div className="empty-inline">
                    هنوز منطقه‌ای ثبت نشده است.
                    <button type="button" className="link-button" onClick={openCreate}> افزودن منطقه جدید</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {areaModal ? (
        <Modal open title={areaModal === 'create' ? 'منطقه جدید' : 'ویرایش منطقه'} onClose={() => setAreaModal(null)}>
          <form className="crud-form" onSubmit={saveArea}>
            <div className="form-grid areas-form">
              <label>
                <span>نام گذر / منطقه</span>
                <input
                  required
                  placeholder="مثلاً گذر ۱۲"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                <span>ناحیه</span>
                <input
                  required
                  placeholder="مثلاً ناحیه ۱"
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                />
              </label>
              <label>
                <span>فیس ماهانه (افغانی)</span>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="100"
                  value={form.monthly_fee}
                  onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })}
                />
              </label>
              <label>
                <span>تعداد خانه</span>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="1000"
                  value={form.house_count}
                  onChange={(e) => setForm({ ...form, house_count: e.target.value })}
                />
              </label>
              <label className="full-field">
                <span>وضعیت</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">فعال</option>
                  <option value="inactive">غیرفعال</option>
                </select>
              </label>
            </div>
            <p className="form-hint">
              با ثبت تعداد خانه، در داشبورد و گزارشات می‌توانید دریافتی روزانه و مانده هر گذر را ببینید.
            </p>
            <div className="modal-actions">
              <button className="primary-button" type="submit">ذخیره</button>
              <button className="secondary-button" type="button" onClick={() => setAreaModal(null)}>انصراف</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {collectModal ? (
        <Modal open title={`ثبت دریافتی — ${collectModal.name}`} onClose={() => setCollectModal(null)}>
          <form className="crud-form" onSubmit={saveCollect}>
            <div className="collect-summary">
              <div>
                <span>کل خانه‌ها</span>
                <strong>{Number(collectModal.houseCount || 0).toLocaleString('en-US')}</strong>
              </div>
              <div>
                <span>دریافتی امروز</span>
                <strong>{collectedPreview.toLocaleString('en-US')}</strong>
              </div>
              <div>
                <span>مانده</span>
                <strong>{remainingPreview.toLocaleString('en-US')}</strong>
              </div>
            </div>
            <p className="note-box">
              از {collectModal.name}، {Number(collectModal.houseCount || 0).toLocaleString('en-US')} خانه موجود است؛
              دریافتی امروز {collectedPreview.toLocaleString('en-US')} خانه؛
              {' '}{remainingPreview.toLocaleString('en-US')} خانه مانده.
              <br />
              تاریخ: {formatShamsi(date)}
            </p>
            <div className="form-grid areas-form">
              <label className="full-field">
                <span>تعداد خانه دریافتی امروز</span>
                <input
                  type="number"
                  min="0"
                  max={collectModal.houseCount || undefined}
                  required
                  value={collectForm.houses_collected}
                  onChange={(e) => setCollectForm({ ...collectForm, houses_collected: e.target.value })}
                />
              </label>
              <label className="full-field">
                <span>یادداشت</span>
                <textarea
                  rows="3"
                  placeholder="اختیاری"
                  value={collectForm.notes}
                  onChange={(e) => setCollectForm({ ...collectForm, notes: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="primary-button" type="submit">ذخیره دریافتی</button>
              <button className="secondary-button" type="button" onClick={() => setCollectModal(null)}>انصراف</button>
            </div>
          </form>
        </Modal>
      ) : null}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="تأیید حذف منطقه"
        message={deleteTarget ? `حذف منطقه «${deleteTarget.name}»؟` : ''}
        onConfirm={confirmRemove}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        busy={deleteBusy}
      />
    </div>
  );
}
