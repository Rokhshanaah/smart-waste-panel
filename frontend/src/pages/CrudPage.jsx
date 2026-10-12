import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, ChevronRight, ChevronLeft, Landmark, ArrowDownLeft, ArrowUpRight, Tags, BadgeCheck, PackageOpen } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ShamsiDateInput, { todayIso } from '../components/ShamsiDateInput';
import GeoAddressFields from '../components/GeoAddressFields';
import { PAYMENT_METHODS, isCreditMethod, paymentMethodLabel, normalizePaymentMethod } from '../constants/finance.js';
import { formatShamsi, shamsiMonthLabel, isoToJalaali } from '../utils/shamsi';

const initialFromFields = (fields, defaults = {}) =>
  Object.fromEntries(
    fields.map(([name, , type]) => {
      if (defaults[name] !== undefined) return [name, defaults[name]];
      if (type === 'payment_method') return [name, 'cash'];
      return [name, ''];
    })
  );

const currency = (value) => `${Number(value || 0).toLocaleString('en-US')} افغانی`;

function formatGeoAddress(parts = {}) {
  return [parts.district, parts.street, parts.alley, parts.house_number ? `پلاک ${parts.house_number}` : '']
    .filter(Boolean)
    .join('، ');
}

async function customerGeoPatch(customerId) {
  if (!customerId) return {};
  try {
    const { data: customer } = await api.get(`/customers/${customerId}`);
    const patch = {
      house_id: customer.house_id || '',
      district: customer.district || '',
      street: customer.street || '',
      alley: customer.alley || '',
      house_number: customer.house_number || '',
    };
    if (customer.house_id) {
      try {
        const { data: ctx } = await api.get(`/geo/houses/${customer.house_id}/context`);
        if (ctx?.district_id) patch.area_id = ctx.district_id;
        if (ctx?.district_name) patch.district = ctx.district_name;
        if (ctx?.passage_name) patch.street = ctx.passage_name;
        if (ctx?.alley_name) patch.alley = ctx.alley_name;
        if (ctx?.plate_number) patch.house_number = ctx.plate_number;
      } catch {
        /* keep customer denormalized fields */
      }
    } else if (customer.area_id) {
      patch.area_id = customer.area_id;
    }
    patch.address = formatGeoAddress(patch) || customer.address || '';
    return patch;
  } catch {
    return {};
  }
}

export default function CrudPage({ config }) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(initialFromFields(config.fields, config.defaultValues));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [cashSummary, setCashSummary] = useState(null);
  const [cashOverview, setCashOverview] = useState(null);
  const [relationOptions, setRelationOptions] = useState({});
  const [categories, setCategories] = useState([]);
  const [categoryModal, setCategoryModal] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [boxModal, setBoxModal] = useState(false);
  const [boxName, setBoxName] = useState('');
  const [editingBox, setEditingBox] = useState(null);
  const [selectedBoxFilter, setSelectedBoxFilter] = useState('');
  const [stockSummary, setStockSummary] = useState(null);

  const load = async (page = 1, boxId = selectedBoxFilter) => {
    setLoading(true);
    try {
      const params = { page, search, ...(config.queryParams || {}) };
      if (config.manageCashBoxes && boxId) params.cash_box_id = boxId;
      const { data } = await api.get(`/${config.endpoint}`, { params });
      setRows(data.data);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  };

  const loadStockSummary = async () => {
    if (!config.showStockSummary) return;
    try {
      const { data } = await api.get('/recycling_records/stock-summary');
      setStockSummary(data);
    } catch {
      setStockSummary(null);
    }
  };

  const loadCashSummary = async (boxId = selectedBoxFilter) => {
    if (!config.showCashSummary) return;
    const { data } = await api.get('/reports', {
      params: boxId ? { cash_box_id: boxId } : {},
    });
    setCashSummary(data.cash);
    setCashOverview(data.cashOverview || null);
  };

  const [settleBusyId, setSettleBusyId] = useState(null);

  const loadCashBoxes = async () => {
    try {
      const { data } = await api.get('/cash_boxes', { params: { limit: 100 } });
      setCashBoxes(data.data || []);
    } catch {
      setCashBoxes([]);
    }
  };

  const settleCredit = async (row) => {
    if (!row?.id || settleBusyId) return;
    setSettleBusyId(row.id);
    try {
      await api.post(`/cash_box_transactions/${row.id}/settle`);
      setMessageType('success');
      setMessage('نسیه تسویه شد و مبلغ وارد موجودی نقدی صندوق گردید.');
      await load(pagination.page);
      await loadCashSummary();
    } catch (error) {
      setMessageType('error');
      setMessage(error.response?.data?.message || 'تسویه نسیه ناموفق بود.');
    } finally {
      setSettleBusyId(null);
    }
  };

  const loadRelations = async () => {
    const relationFields = config.fields.filter(([, , type]) => type === 'relation');
    if (!relationFields.length) {
      setRelationOptions({});
      return;
    }

    const entries = await Promise.all(
      relationFields.map(async ([name, , , , meta]) => {
        try {
          const { data } = await api.get(`/${meta.endpoint}`, { params: { limit: 200 } });
          let list = Array.isArray(data) ? data : (data.data || []);
          if (String(meta.endpoint || '').includes('geo/districts')) {
            list = list.filter((item) => !item.status || item.status === 'active');
          }
          return [name, list];
        } catch {
          return [name, []];
        }
      })
    );
    setRelationOptions(Object.fromEntries(entries));
  };

  const loadCategories = async () => {
    if (!config.categoryScope) {
      setCategories([]);
      return;
    }
    try {
      const { data } = await api.get('/app_categories', {
        params: { scope: config.categoryScope, status: 'active', limit: 100 },
      });
      const excluded = new Set((config.excludeCategories || []).map((name) => String(name).toLowerCase()));
      const list = (data.data || []).filter((item) => !excluded.has(String(item.name || '').toLowerCase()));
      setCategories(list);
    } catch {
      setCategories([]);
    }
  };

  useEffect(() => {
    setSearch('');
    setForm(initialFromFields(config.fields, config.defaultValues));
    load(1);
    loadCashSummary();
    loadStockSummary();
    loadRelations();
    loadCategories();
    if (config.manageCashBoxes) loadCashBoxes();
  }, [config.endpoint, JSON.stringify(config.queryParams || {}), config.categoryScope]);

  const openCreate = async () => {
    const values = initialFromFields(config.fields, config.defaultValues);
    const today = todayIso();
    const { jy, jm } = isoToJalaali(today) || { jy: 1405, jm: 1 };
    config.fields.forEach(([name, , type]) => {
      if (type === 'date') values[name] = today;
      if (type === 'payment_method' && !values[name]) values[name] = 'cash';
      if (type === 'category' && !values[name] && categories[0]) values[name] = categories[0].name;
    });
    if (config.autoBillNumber) {
      try {
        const { data } = await api.get('/bills/next-number');
        values.bill_number = data.bill_number || '100';
      } catch {
        values.bill_number = '100';
      }
      values.billing_type = values.billing_type || 'monthly';
      values.month_name = values.month_name || shamsiMonthLabel(jm);
      values.status = values.status || 'unpaid';
      values.paid_amount = values.paid_amount || 0;
      values.payment_method = values.payment_method || 'cash';
    }
    const boxes = relationOptions.cash_box_id?.length
      ? relationOptions.cash_box_id
      : (await api.get('/cash_boxes', { params: { limit: 100 } }).then((r) => r.data.data || []).catch(() => []));
    if (values.cash_box_id === '' && boxes[0]) values.cash_box_id = boxes[0].id;
    setForm(values);
    setModal({ mode: 'create' });
  };

  const openEdit = (row) => {
    const values = initialFromFields(config.fields, config.defaultValues);
    config.fields.forEach(([name, , type]) => {
      let value = row[name] ?? config.defaultValues?.[name] ?? '';

      if (type === 'time') {
        value = formatTimeInput(value);
      } else if (type === 'date') {
        value = formatDateInput(value);
      } else if (type === 'payment_method') {
        value = normalizePaymentMethod(value || 'cash');
      } else if ((name === 'notes' || name === 'title') && typeof value === 'string') {
        value = localizeDisplayText(value);
        if (value === '—') value = '';
      } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        value = value.slice(0, 10);
      }

      values[name] = value === null || value === undefined ? '' : value;
    });
    setForm(values);
    setModal({ mode: 'edit', id: row.id });
  };

  const applyCustomerSync = async (customerId) => {
    if (!config.syncFromCustomer) {
      setForm((prev) => ({ ...prev, customer_id: customerId }));
      return;
    }
    const patch = await customerGeoPatch(customerId);
    setForm((prev) => {
      const next = { ...prev, customer_id: customerId };
      const fieldNames = new Set(config.fields.map(([name]) => name));
      Object.entries(patch).forEach(([key, value]) => {
        if (fieldNames.has(key) || key === 'address') next[key] = value ?? '';
      });
      return next;
    });
  };

  const onGeoAddressChange = async (next) => {
    setForm((prev) => {
      const merged = { ...prev, ...next };
      if (config.fields.some(([name]) => name === 'address')) {
        merged.address = formatGeoAddress(merged) || merged.address || '';
      }
      if (config.fields.some(([name]) => name === 'area_id') && next.area_id !== undefined) {
        merged.area_id = next.area_id;
      }
      delete merged.district_id;
      return merged;
    });

    if (config.autoFillFromHouse && next.house_id) {
      try {
        const { data: ctx } = await api.get(`/geo/houses/${next.house_id}/context`);
        setForm((prev) => ({
          ...prev,
          amount: prev.amount || ctx.fee_amount || prev.amount,
          customer_id: prev.customer_id || ctx.customer_id || prev.customer_id,
          area_id: ctx.district_id || prev.area_id,
        }));
      } catch {
        /* ignore */
      }
    }
  };

  const buildPayload = () => {
    const allowed = new Set(config.fields.map(([name]) => name));
    if (config.addressCascade) {
      ['district', 'street', 'alley', 'house_number', 'house_id'].forEach((key) => allowed.add(key));
    }
    Object.keys(config.defaultValues || {}).forEach((key) => allowed.add(key));

    const payload = {};
    allowed.forEach((name) => {
      if (form[name] !== undefined) payload[name] = form[name];
      else if (config.defaultValues?.[name] !== undefined) payload[name] = config.defaultValues[name];
    });

    config.fields.forEach(([name, , type]) => {
      if (type === 'hidden') {
        if (form[name] !== undefined) payload[name] = form[name] === '' ? null : form[name];
        return;
      }
      if (type === 'geo_address' || type === 'relation' || name.endsWith('_id')) {
        if (payload[name] === '' || payload[name] === null || payload[name] === undefined || Number(payload[name]) === 0) {
          payload[name] = null;
        } else {
          payload[name] = Number(payload[name]);
        }
      }
      if (type === 'number') {
        if (payload[name] === '' || payload[name] === null || payload[name] === undefined) {
          payload[name] = name === 'paid_amount' ? 0 : null;
        } else {
          payload[name] = Number(payload[name]);
        }
      }
      if (type === 'date') {
        if (payload[name] === '') payload[name] = null;
      }
      if (type === 'time') {
        payload[name] = formatTimePayload(payload[name]);
      }
    });

    if (config.addressCascade) {
      ['district', 'street', 'alley', 'house_number', 'house_id'].forEach((key) => {
        if (form[key] !== undefined) payload[key] = form[key] === '' ? null : form[key];
      });
      if (payload.house_id) payload.house_id = Number(payload.house_id);
    }

    // Clear debtor unless نسیه
    if (payload.payment_method && !isCreditMethod(payload.payment_method)) {
      const debtorMeta = config.fields.find(([n, , t, , meta]) => n === 'customer_id' && t === 'relation' && meta?.showWhenCredit);
      if (debtorMeta) payload.customer_id = null;
    }

    // Never send UI-only helpers
    delete payload.address;
    delete payload.district_id;
    delete payload.alley_id;
    delete payload.pending_plate;
    return payload;
  };

  const saveCashBox = async (event) => {
    event.preventDefault();
    const name = boxName.trim();
    if (!name) return;
    try {
      if (editingBox) {
        await api.put(`/cash_boxes/${editingBox.id}`, { name, status: 'active' });
      } else {
        await api.post('/cash_boxes', { name, status: 'active' });
      }
      setBoxName('');
      setEditingBox(null);
      await loadCashBoxes();
      await loadRelations();
      await loadCashSummary();
      setMessageType('success');
      setMessage('صندوق ذخیره شد.');
    } catch (error) {
      setMessageType('error');
      setMessage(error.response?.data?.message || 'ذخیره صندوق ناموفق بود.');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      const payload = buildPayload();

      // اگر پلاک جدید نوشته شده ولی هنوز خانه ساخته نشده، همین‌جا بساز
      if (config.addressCascade && !payload.house_id && form.pending_plate && form.alley_id) {
        const { data: house } = await api.post('/geo/houses', {
          alley_id: Number(form.alley_id),
          plate_number: String(form.pending_plate).trim(),
        });
        payload.house_id = house.id;
        payload.house_number = String(form.pending_plate).trim();
      }

      if (config.addressCascade && !payload.house_id) {
        setMessageType('error');
        setMessage('پلاک خانه الزامی است. پلاک آزاد را انتخاب کنید یا پلاک جدید را ثبت کنید.');
        return;
      }

      if (modal.mode === 'create') {
        await api.post(`/${config.endpoint}`, payload);
        setMessageType('success');
        setMessage(`${config.singular} با موفقیت اضافه شد.`);
      } else {
        await api.put(`/${config.endpoint}/${modal.id}`, payload);
        setMessageType('success');
        setMessage(`${config.singular} با موفقیت ویرایش شد.`);
      }
      setModal(null);
      await load(pagination.page);
      await loadCashSummary();
      await loadStockSummary();
    } catch (error) {
      setMessageType('error');
      setMessage(error.response?.data?.message || 'عملیات ناموفق بود.');
    }
  };

  const askRemove = (row) => {
    setDeleteTarget({ type: 'row', row });
  };

  const askRemoveCategory = (item) => {
    setDeleteTarget({ type: 'category', row: item });
  };

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
        await loadCategories();
        setMessageType('success');
        setMessage('دسته‌بندی حذف شد.');
      } else if (deleteTarget.type === 'cash_box') {
        await api.delete(`/cash_boxes/${deleteTarget.row.id}`);
        if (editingBox?.id === deleteTarget.row.id) {
          setEditingBox(null);
          setBoxName('');
        }
        await loadCashBoxes();
        await loadRelations();
        setMessageType('success');
        setMessage('صندوق حذف شد.');
      } else {
        await api.delete(`/${config.endpoint}/${deleteTarget.row.id}`);
        setMessageType('success');
        setMessage('رکورد با موفقیت حذف شد.');
        await load(pagination.page);
        await loadCashSummary();
        await loadStockSummary();
      }
      setDeleteTarget(null);
    } catch (error) {
      setMessageType('error');
      setMessage(error.response?.data?.message || 'حذف رکورد ناموفق بود.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const remove = askRemove;

  const saveCategory = async (event) => {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name || !config.categoryScope) return;
    try {
      if (editingCategory) {
        await api.put(`/app_categories/${editingCategory.id}`, {
          name,
          scope: config.categoryScope,
          status: 'active',
        });
      } else {
        await api.post('/app_categories', {
          name,
          scope: config.categoryScope,
          status: 'active',
        });
      }
      setCategoryName('');
      setEditingCategory(null);
      await loadCategories();
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

  const deleteCategory = askRemoveCategory;

  const closeCategoryModal = () => {
    setCategoryModal(false);
    setEditingCategory(null);
    setCategoryName('');
  };

  const visibleFields = config.fields.filter(([name, , type]) => type !== 'hidden' && !(config.hiddenFields || []).includes(name));

  return (
    <div className="page-shell animate-page">
      <div className="page-heading animate-fade-up">
        <div>
          <h2>{config.title}</h2>
          <p>مدیریت یکپارچه {config.title} با ثبت، ویرایش و پیگیری دقیق</p>
          {!!(config.relatedLinks || []).length && (
            <div className="related-links">
              {(config.relatedLinks || []).map((link) => (
                <Link key={link.to} className="related-link" to={link.to}>{link.label}</Link>
              ))}
            </div>
          )}
        </div>
        <div className="heading-actions">
          {config.manageCashBoxes && (
            <button className="secondary-button" type="button" onClick={() => { setBoxModal(true); loadCashBoxes(); }}>
              <Landmark size={16} /> مدیریت صندوق‌ها
            </button>
          )}
          {config.categoryScope && (
            <button className="secondary-button" onClick={() => setCategoryModal(true)}>
              <Tags size={16} /> مدیریت دسته‌ها
            </button>
          )}
          <button className="primary-button" onClick={openCreate}><Plus size={18} /> افزودن {config.singular}</button>
        </div>
      </div>

      {config.showStockSummary && stockSummary && (
        <>
          <div className="stats-grid cash-stats animate-stagger" style={{ marginBottom: 12 }}>
            <article className="stat-card tone-accent">
              <div className="stat-icon"><PackageOpen size={20} /></div>
              <div>
                <span>موجودی باقی‌مانده</span>
                <strong>{Number(stockSummary.totals?.availableKg || 0).toLocaleString('en-US')} کیلو</strong>
              </div>
            </article>
            <article className="stat-card tone-good">
              <div className="stat-icon"><ArrowDownLeft size={20} /></div>
              <div>
                <span>کل ورود انبار</span>
                <strong>{Number(stockSummary.totals?.stockKg || 0).toLocaleString('en-US')} کیلو</strong>
              </div>
            </article>
            <article className="stat-card tone-warn">
              <div className="stat-icon"><ArrowUpRight size={20} /></div>
              <div>
                <span>کل فروش‌شده</span>
                <strong>{Number(stockSummary.totals?.soldKg || 0).toLocaleString('en-US')} کیلو</strong>
              </div>
            </article>
          </div>

          <div className="stock-materials animate-fade-up" style={{ marginBottom: 16 }}>
            <div className="stock-materials-head">
              <h3>موجودی مواد</h3>
              <p>فقط موادی که ورود یا فروش داشته‌اند اینجا دیده می‌شوند</p>
            </div>
            {(() => {
              const activeItems = (stockSummary.items || []).filter(
                (item) => Number(item.stockKg || 0) > 0 || Number(item.soldKg || 0) > 0
              );
              if (!activeItems.length) {
                return (
                  <div className="empty-inline" style={{ padding: '18px 8px' }}>
                    هنوز موادی وارد انبار نشده است. با ثبت ورود بازیافت، کارت همان مواد اینجا ساخته می‌شود.
                  </div>
                );
              }
              return (
                <div className="stock-materials-grid">
                  {activeItems.map((item) => {
                    const available = Number(item.availableKg || 0);
                    const tone = available > 0 ? 'has-stock' : 'empty-stock';
                    return (
                      <article className={`stock-material-card ${tone}`} key={item.material_type}>
                        <div className="stock-material-top">
                          <strong>{item.label}</strong>
                          <span className="stock-material-remain">
                            باقی {available.toLocaleString('en-US')} کیلو
                          </span>
                        </div>
                        <div className="stock-material-meta">
                          <div>
                            <span>ورود</span>
                            <strong>{Number(item.stockKg || 0).toLocaleString('en-US')}</strong>
                          </div>
                          <div>
                            <span>فروش</span>
                            <strong>{Number(item.soldKg || 0).toLocaleString('en-US')}</strong>
                          </div>
                          <div>
                            <span>باقی</span>
                            <strong>{available.toLocaleString('en-US')}</strong>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              );
            })()}
            <div className="note-box" style={{ marginTop: 12 }}>
              اول در بازیافت وارد انبار کنید؛ بعد از صفحه فروش مواد بفروشید. فروش بیشتر از موجودی ممکن نیست.
            </div>
          </div>
        </>
      )}

      {config.showCashSummary && (cashOverview || cashSummary) && (() => {
        const selectedBox = selectedBoxFilter
          ? (cashOverview?.boxes || []).find((b) => String(b.id) === String(selectedBoxFilter))
          : null;
        const view = selectedBox
          ? {
            title: `موجودی «${selectedBox.name}»`,
            balance: selectedBox.balance,
            cashIn: selectedBox.cashIn,
            cashOut: selectedBox.cashOut,
            creditIn: selectedBox.creditIn,
          }
          : {
            title: 'موجودی کل سیستم',
            balance: cashOverview?.total?.balance ?? cashSummary?.balance,
            cashIn: cashOverview?.total?.cashIn ?? cashSummary?.cashIn,
            cashOut: cashOverview?.total?.cashOut ?? cashSummary?.cashOut,
            creditIn: cashOverview?.total?.creditIn ?? cashSummary?.creditIn,
          };

        return (
          <>
            <div className="stats-grid cash-stats animate-stagger">
              <article className="stat-card tone-accent">
                <div className="stat-icon"><Landmark size={20} /></div>
                <div>
                  <span>{view.title}</span>
                  <strong>{currency(view.balance)}</strong>
                </div>
              </article>
              <article className="stat-card tone-good">
                <div className="stat-icon"><ArrowDownLeft size={20} /></div>
                <div>
                  <span>ورود نقدی / صرافی</span>
                  <strong>{currency(view.cashIn)}</strong>
                </div>
              </article>
              <article className="stat-card tone-warn">
                <div className="stat-icon"><ArrowUpRight size={20} /></div>
                <div>
                  <span>خروج نقدی / صرافی</span>
                  <strong>{currency(view.cashOut)}</strong>
                </div>
              </article>
              <article className="stat-card tone-info">
                <div className="stat-icon"><Landmark size={20} /></div>
                <div>
                  <span>نسیه ثبت‌شده</span>
                  <strong>{currency(view.creditIn)}</strong>
                </div>
              </article>
            </div>

            {!selectedBoxFilter && !!(cashOverview?.boxes || []).length && (
              <div className="cash-box-list panel animate-fade-up" style={{ marginTop: 12 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>موجودی هر صندوق</h3>
                <div className="category-list">
                  {(cashOverview.boxes || []).map((box) => (
                    <button
                      type="button"
                      key={box.id}
                      className={`category-item cash-box-row ${String(selectedBoxFilter) === String(box.id) ? 'is-selected' : ''}`}
                      onClick={async () => {
                        setSelectedBoxFilter(String(box.id));
                        await loadCashSummary(String(box.id));
                        await load(1, String(box.id));
                      }}
                    >
                      <div>
                        <strong>{box.name}</strong>
                        {Number(box.creditIn || 0) > 0 && (
                          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                            نسیه: {Number(box.creditIn).toLocaleString('en-US')} افغانی
                          </div>
                        )}
                      </div>
                      <strong>{currency(box.balance)}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {config.manageCashBoxes && (
        <div className="filter-bar animate-fade-up" style={{ marginTop: 12, marginBottom: 12 }}>
          <label>
            <span>نمایش صندوق</span>
            <select
              value={selectedBoxFilter}
              onChange={async (e) => {
                const value = e.target.value;
                setSelectedBoxFilter(value);
                await loadCashSummary(value);
                await load(1, value);
              }}
            >
              <option value="">همه صندوق‌ها</option>
              {(cashOverview?.boxes?.length ? cashOverview.boxes : cashBoxes).map((box) => (
                <option key={box.id} value={box.id}>{box.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {message && (
        <div className={`alert ${messageType} animate-fade-up`} onClick={() => setMessage('')}>
          {message}
        </div>
      )}

      <div className="table-card animate-fade-up delay-2">
        <div className="table-toolbar">
          <form className="search-box" onSubmit={(e) => { e.preventDefault(); load(1); }}>
            <Search size={18} />
            <input
              placeholder={`جستجو در ${config.title}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <span className="record-count">{pagination.total} رکورد</span>
        </div>

        {config.manageCashBoxes && (
          <div className="note-box" style={{ marginBottom: 12 }}>
            برای نسیه: اول با روش «نسیه» ثبت کنید. وقتی شخص پول را داد، از ستون عملیات دکمه ✓ «تسویه نسیه» را بزنید تا مبلغ وارد موجودی نقدی شود.
          </div>
        )}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                {config.columns.map(([, label]) => <th key={label}>{label}</th>)}
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{(pagination.page - 1) * pagination.limit + index + 1}</td>
                  {config.columns.map(([key]) => (
                    <td key={key}>{formatCell(key, row[key], config, relationOptions, row)}</td>
                  ))}
                  <td>
                    <div className="actions">
                      {config.manageCashBoxes && row.payment_method === 'credit' && !row.settled_at && (
                        <button
                          type="button"
                          className="edit-button"
                          title="تسویه نسیه (پول را گرفتید)"
                          disabled={settleBusyId === row.id}
                          onClick={() => settleCredit(row)}
                          style={{ color: 'var(--good, #15803d)' }}
                        >
                          <BadgeCheck size={16} />
                        </button>
                      )}
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
              {!loading && !rows.length && <tr><td colSpan={config.columns.length + 2} className="empty-state">هیچ رکوردی پیدا نشد.</td></tr>}
              {loading && <tr><td colSpan={config.columns.length + 2} className="empty-state">در حال دریافت اطلاعات...</td></tr>}
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
        <Modal title={`${modal.mode === 'create' ? 'افزودن' : 'ویرایش'} ${config.singular}`} onClose={() => setModal(null)}>
          <form className="crud-form" onSubmit={submit} autoComplete="off">
            <div className="form-grid">
              {visibleFields.map(([name, label, type, required, options]) => {
                const inputType = name === 'phone' ? 'tel' : type;
                const autoComplete =
                  inputType === 'password' ? 'new-password'
                    : name === 'email' ? 'email'
                      : name === 'phone' ? 'tel'
                        : name === 'full_name' ? 'name'
                          : 'off';

                if (type === 'geo_address') {
                  return (
                    <GeoAddressFields
                      key={`${modal?.mode}-${modal?.id || 'new'}-${form.house_id || 'empty'}`}
                      value={{
                        house_id: form.house_id || '',
                        district: form.district || '',
                        street: form.street || '',
                        alley: form.alley || '',
                        house_number: form.house_number || '',
                      }}
                      onChange={onGeoAddressChange}
                    />
                  );
                }

                if (type === 'relation' && options?.showWhenCredit && !isCreditMethod(form.payment_method)) {
                  return null;
                }

                if (type === 'relation') {
                  const meta = options || {};
                  const list = relationOptions[name] || [];
                  const creditRequired = meta.showWhenCredit && isCreditMethod(form.payment_method);
                  return (
                    <label key={name}>
                      <span>{label}{(required || creditRequired) && ' *'}</span>
                      <select
                        value={form[name] ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (name === 'customer_id' && config.syncFromCustomer && !meta.showWhenCredit) {
                            applyCustomerSync(value);
                          } else {
                            setForm({ ...form, [name]: value });
                          }
                        }}
                        required={required || creditRequired}
                      >
                        <option value="">بدون انتخاب</option>
                        {list.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item[meta.label] || `#${item.id}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }

                if (type === 'category') {
                  return (
                    <label key={name}>
                      <span>{label}{required && ' *'}</span>
                      <select
                        value={form[name] ?? ''}
                        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
                        required={required}
                      >
                        <option value="">انتخاب کنید</option>
                        {categories.map((item) => (
                          <option key={item.id} value={item.name}>{item.name}</option>
                        ))}
                      </select>
                    </label>
                  );
                }

                if (type === 'payment_method') {
                  return (
                    <label key={name}>
                      <span>{label}{required && ' *'}</span>
                      <select
                        value={form[name] ?? 'cash'}
                        onChange={(e) => {
                          const method = e.target.value;
                          setForm((prev) => ({
                            ...prev,
                            [name]: method,
                            ...(!isCreditMethod(method) && config.fields.some(([, , , , meta]) => meta?.showWhenCredit)
                              ? { customer_id: config.syncFromCustomer ? prev.customer_id : '' }
                              : {}),
                          }));
                        }}
                        required={required}
                      >
                        {PAYMENT_METHODS.map(([value, text]) => (
                          <option key={value} value={value}>{text}</option>
                        ))}
                      </select>
                    </label>
                  );
                }

                if (type === 'readonly') {
                  return (
                    <label key={name}>
                      <span>{label}</span>
                      <input type="text" value={form[name] ?? ''} readOnly disabled />
                      {name === 'bill_number' && (
                        <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>
                          شماره بل خودکار از ۱۰۰ به بالا تولید می‌شود.
                        </small>
                      )}
                    </label>
                  );
                }

                if (type === 'date') {
                  return (
                    <label key={name}>
                      <span>{label}{required && ' *'}</span>
                      <ShamsiDateInput
                        value={form[name] || todayIso()}
                        onChange={(iso) => setForm({ ...form, [name]: iso })}
                        required={required}
                      />
                    </label>
                  );
                }

                const isSaleForm = config.showStockSummary
                  && (config.defaultValues?.transaction_type === 'sale' || config.queryParams?.transaction_type === 'sale');
                const stockItem = isSaleForm && form.material_type
                  ? (stockSummary?.items || []).find((i) => i.material_type === form.material_type)
                  : null;
                const availableKg = Number(stockItem?.availableKg || 0);
                // when editing a sale, available already excludes other sales; add back current row weight approx from form if same material
                const editBonus = modal?.mode === 'edit' && modal?.id
                  ? Number(rows.find((r) => r.id === modal.id && r.material_type === form.material_type)?.weight_kg || 0)
                  : 0;
                const canSell = availableKg + editBonus;

                return (
                <label key={name} className={type === 'textarea' ? 'full-field' : ''}>
                  <span>{label}{required && ' *'}</span>
                  {type === 'select' ? (
                    <select value={form[name] ?? ''} onChange={(e) => setForm({ ...form, [name]: e.target.value })} required={required}>
                      <option value="">انتخاب کنید</option>
                      {options.map(([value, text]) => {
                        if (name === 'material_type' && isSaleForm) {
                          const item = (stockSummary?.items || []).find((i) => i.material_type === value);
                          const avail = Number(item?.availableKg || 0);
                          return (
                            <option key={value} value={value} disabled={avail <= 0 && !(modal?.mode === 'edit' && form.material_type === value)}>
                              {text} — باقی {avail.toLocaleString('en-US')} کیلو
                            </option>
                          );
                        }
                        return <option key={value} value={value}>{text}</option>;
                      })}
                    </select>
                  ) : type === 'textarea' ? (
                    <textarea rows="4" value={form[name] ?? ''} onChange={(e) => setForm({ ...form, [name]: e.target.value })} required={required} />
                  ) : type === 'time' ? (
                    <input
                      type="time"
                      step="60"
                      value={formatTimeInput(form[name])}
                      onChange={(e) => setForm({ ...form, [name]: e.target.value })}
                      required={required}
                    />
                  ) : (
                    <input
                      type={inputType}
                      name={name === 'phone' ? 'user_phone' : name}
                      autoComplete={autoComplete}
                      inputMode={name === 'phone' ? 'tel' : undefined}
                      step={type === 'number' ? '0.01' : undefined}
                      max={name === 'weight_kg' && isSaleForm ? canSell : undefined}
                      value={form[name] ?? ''}
                      onChange={(e) => setForm({ ...form, [name]: e.target.value })}
                      required={required}
                    />
                  )}
                  {name === 'material_type' && isSaleForm && form.material_type && (
                    <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>
                      موجودی قابل فروش: {canSell.toLocaleString('en-US')} کیلو
                    </small>
                  )}
                  {name === 'weight_kg' && isSaleForm && form.material_type && (
                    <small style={{ display: 'block', marginTop: 6, color: 'var(--muted)' }}>
                      بعد از این فروش باقی می‌ماند:{' '}
                      {Math.max(canSell - Number(form.weight_kg || 0), 0).toLocaleString('en-US')} کیلو
                    </small>
                  )}
                </label>
              );})}
            </div>
            <div className="modal-actions">
              <button className="primary-button" type="submit">ذخیره معلومات</button>
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>انصراف</button>
            </div>
          </form>
        </Modal>
      )}

      {categoryModal && config.categoryScope && (
        <Modal title="مدیریت دسته‌ها" onClose={closeCategoryModal}>
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
                    <button className="delete-button" type="button" onClick={() => deleteCategory(item)}><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
              {!categories.length && <div className="empty-inline">هنوز دسته‌ای ثبت نشده است.</div>}
            </div>
          </div>
        </Modal>
      )}

      {boxModal && config.manageCashBoxes && (
        <Modal title="مدیریت صندوق‌ها" onClose={() => { setBoxModal(false); setEditingBox(null); setBoxName(''); }}>
          <div className="crud-form">
            <form className="category-form" onSubmit={saveCashBox}>
              <input
                placeholder="نام صندوق جدید..."
                value={boxName}
                onChange={(e) => setBoxName(e.target.value)}
                required
              />
              <button className="primary-button" type="submit">
                {editingBox ? 'ویرایش صندوق' : 'ایجاد صندوق'}
              </button>
              {editingBox && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => { setEditingBox(null); setBoxName(''); }}
                >
                  انصراف ویرایش
                </button>
              )}
            </form>
            <div className="category-list">
              {(cashOverview?.boxes?.length ? cashOverview.boxes : cashBoxes).map((item) => (
                <div className="category-item" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    {item.balance != null && (
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                        موجودی: {Number(item.balance).toLocaleString('en-US')} افغانی
                      </div>
                    )}
                  </div>
                  <div className="actions">
                    <button className="edit-button" type="button" onClick={() => { setEditingBox(item); setBoxName(item.name); }}><Pencil size={15} /></button>
                    <button className="delete-button" type="button" onClick={() => setDeleteTarget({ type: 'cash_box', row: item })}><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
              {!(cashOverview?.boxes?.length || cashBoxes.length) && <div className="empty-inline">هنوز صندوقی ثبت نشده است.</div>}
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
            : deleteTarget?.type === 'cash_box'
              ? `صندوق «${deleteTarget.row.name}» حذف شود؟`
              : `آیا از حذف این ${config.singular} مطمئن هستید؟`
        }
        onConfirm={confirmRemove}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        busy={deleteBusy}
      />
    </div>
  );
}

function formatDateInput(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return text;
}

function formatTimeInput(value) {
  if (!value) return '';
  const text = String(value).trim();

  // ISO datetime: 1970-01-01T11:00:00.000Z or 1970-01-01T11:00:00
  const isoMatch = text.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`;

  // HH:MM:SS or HH:MM
  const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (timeMatch) {
    return `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}`;
  }

  return '';
}

function formatTimePayload(value) {
  const time = formatTimeInput(value);
  if (!time) return null;
  return `${time}:00`;
}

function formatCell(key, value, config, relationOptions = {}, row = null) {
  if (key === 'payment_method') {
    return paymentMethodLabel(value, {
      settled: Boolean(row?.settled_at),
      openCredit: config.manageCashBoxes,
    });
  }

  if (key === 'notes' || key === 'title') {
    return localizeDisplayText(value);
  }

  const field = (config.fields || []).find(([name]) => name === key);
  if (field && field[2] === 'relation') {
    const meta = field[4] || {};
    const labelKey = meta.label || 'name';
    const list = relationOptions[key] || [];
    const found = list.find((item) => Number(item.id) === Number(value));
    if (found) {
      return found[labelKey] || found.name || found.full_name || found.plate_number || found.bill_number || '—';
    }
    if (value === null || value === undefined || value === '') return '—';
    return '—';
  }

  if (field && field[2] === 'select' && Array.isArray(field[4])) {
    const option = field[4].find(([optionValue]) => String(optionValue) === String(value));
    if (option) return option[1];
  }

  if (field && field[2] === 'payment_method') {
    return paymentMethodLabel(value);
  }

  return formatValue(value);
}

function localizeDisplayText(value) {
  if (value === null || value === undefined || value === '') return '—';
  let out = String(value);
  const materials = {
    iron: 'آهن', plastic: 'پلاستیک', aluminum: 'المونیم',
    wood: 'چوب', glass: 'شیشه', other: 'سایر',
  };
  for (const [en, fa] of Object.entries(materials)) {
    out = out.replace(new RegExp(`\\b${en}\\b`, 'gi'), fa);
  }
  out = out.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => formatShamsi(`${y}-${m}-${d}`));
  return out;
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  const labels = {
    active: 'فعال', inactive: 'غیرفعال', paid: 'پرداخت‌شده', unpaid: 'پرداخت‌نشده',
    partial: 'قسمی', new: 'جدید', reviewing: 'در حال بررسی', resolved: 'حل‌شده',
    rejected: 'ردشده', cash: 'نقدی', bank: 'بانکی', online: 'آنلاین',
    monthly: 'ماهانه', weekly: 'هفته‌وار', quarterly: 'سه‌ماهه', yearly: 'سالانه',
    broken: 'خراب', repair: 'در تعمیر', stock: 'ورود انبار', sale: 'فروش',
    iron: 'آهن', plastic: 'پلاستیک', aluminum: 'المونیم', wood: 'چوب', glass: 'شیشه', other: 'سایر',
    admin: 'مدیر', accountant: 'حسابدار', employee: 'کارمند', driver: 'راننده', citizen: 'شهروند',
    salary: 'معاش', fuel: 'تیل', rent: 'کرایه', equipment: 'تجهیزات', office: 'دفتر',
    service_fee: 'فیس خدمات', material_sale: 'فروش مواد', donation: 'کمک',
    payment: 'پرداخت', expense: 'هزینه', income: 'درآمد', adjustment: 'تعدیل',
    in: 'ورود', out: 'خروج', manual: 'دستی', recycling: 'بازیافت',
    cancelled: 'لغوشده', credit: 'نسیه', exchange: 'صرافی', installment: 'قسطی',
  };
  if (labels[value]) return labels[value];
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (labels[lower]) return labels[lower];
    const method = paymentMethodLabel(lower);
    if (method !== 'سایر' && method !== '—') return method;
  }
  if (typeof value === 'string' && /^\d{2}:\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const time = formatTimeInput(value);
    if (time && value.startsWith('1970-01-01')) return time;
    return formatShamsi(value);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatShamsi(value);
  }
  if (typeof value === 'number') return Number(value).toLocaleString('en-US');
  if (typeof value === 'string' && /[a-zA-Z]/.test(value)) return localizeDisplayText(value);
  return value;
}
