import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, Home, MapPinned, Pencil, Plus, Search, Trash2, Wand2, XCircle,
} from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import {
  MONTHS,
  getShamsiYearOptions,
  shamsiMonthLabel,
  toJalaali,
} from '../utils/shamsi';

const money = (n) => `${Number(n || 0).toLocaleString('en-US')} افغانی`;

function currentPeriod() {
  const now = new Date();
  const { jy, jm } = toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { year: jy, month: jm, period: `${jy}-${String(jm).padStart(2, '0')}` };
}

export default function HousesPage() {
  const initial = currentPeriod();
  const years = useMemo(() => getShamsiYearOptions(initial.year), [initial.year]);

  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const period = `${year}-${String(month).padStart(2, '0')}`;

  const [districts, setDistricts] = useState([]);
  const [passages, setPassages] = useState([]);
  const [alleys, setAlleys] = useState([]);
  const [houses, setHouses] = useState([]);
  const [stats, setStats] = useState(null);
  const [scopeStats, setScopeStats] = useState(null);
  const [summary, setSummary] = useState(null);

  const [districtId, setDistrictId] = useState('');
  const [passageId, setPassageId] = useState('');
  const [alleyId, setAlleyId] = useState('');

  const [search, setSearch] = useState('');
  const [feeFilter, setFeeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [selected, setSelected] = useState([]);
  const [defaultFee, setDefaultFee] = useState(120);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [loading, setLoading] = useState(false);
  const [feeBusy, setFeeBusy] = useState(false);

  const [nameModal, setNameModal] = useState(null);
  const [houseModal, setHouseModal] = useState(null);
  const [bulkModal, setBulkModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [nameValue, setNameValue] = useState('');
  const [houseForm, setHouseForm] = useState({
    plate_number: '', fee_amount: 120, customer_id: '', owner_name: '', phone: '',
  });
  const [citizens, setCitizens] = useState([]);
  const [bulkForm, setBulkForm] = useState({ from_plate: 1, to_plate: 50, fee_amount: 120 });

  const onCitizenPick = (customerId) => {
    if (!customerId) {
      setHouseForm((prev) => ({
        ...prev,
        customer_id: '',
      }));
      return;
    }
    const citizen = citizens.find((c) => String(c.id) === String(customerId));
    setHouseForm((prev) => ({
      ...prev,
      customer_id: customerId,
      owner_name: citizen?.full_name || '',
      phone: citizen?.phone || '',
      // پلاک را از پرونده شهروند پر کن تا دوبار وارد نشود
      plate_number: prev.plate_number || citizen?.house_number || '',
    }));
  };

  const loadDistricts = async () => {
    const { data } = await api.get('/geo/districts');
    setDistricts(data);
  };

  const loadPassages = async (id) => {
    if (!id) { setPassages([]); return; }
    const { data } = await api.get('/geo/passages', { params: { district_id: id } });
    setPassages(data);
  };

  const loadAlleys = async (id) => {
    if (!id) { setAlleys([]); return; }
    const { data } = await api.get('/geo/alleys', { params: { passage_id: id } });
    setAlleys(data);
  };

  const loadHouses = async (nextPage = page) => {
    if (!alleyId) {
      setHouses([]);
      setStats(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get('/geo/houses', {
        params: {
          alley_id: alleyId,
          period,
          page: nextPage,
          search,
          fee_status: feeFilter || undefined,
        },
      });
      setHouses(data.data || []);
      setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
      setStats(data.stats || null);
      setDefaultFee(data.defaultFee || 120);
      setSelected([]);
    } catch (error) {
      flash(error.response?.data?.message || 'خطا در بارگذاری خانه‌ها', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const { data } = await api.get('/geo/summary', { params: { period } });
      setSummary(data);
      setDefaultFee(data.defaultFee || 120);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadDistricts();
    api.get('/geo/citizens')
      .then(({ data }) => setCitizens(data || []))
      .catch(() => setCitizens([]));
  }, []);

  useEffect(() => {
    loadSummary();
  }, [period]);

  useEffect(() => {
    // When an alley is selected, `stats` already comes from /geo/houses.
    if (alleyId) {
      setScopeStats(null);
      return;
    }

    const loadScope = async () => {
      try {
        if (passageId) {
          const { data } = await api.get('/geo/summary/passage', {
            params: { passage_id: passageId, period },
          });
          setScopeStats(data?.stats || null);
          setDefaultFee(data?.defaultFee || 120);
          return;
        }

        if (districtId) {
          const { data } = await api.get('/geo/summary/district', {
            params: { district_id: districtId, period },
          });
          setScopeStats(data?.stats || null);
          setDefaultFee(data?.defaultFee || 120);
          return;
        }

        setScopeStats(null);
      } catch {
        setScopeStats(null);
      }
    };

    loadScope();
  }, [districtId, passageId, alleyId, period]);

  useEffect(() => {
    loadPassages(districtId);
    setPassageId('');
    setAlleyId('');
  }, [districtId]);

  useEffect(() => {
    loadAlleys(passageId);
    setAlleyId('');
  }, [passageId]);

  useEffect(() => {
    setPage(1);
    loadHouses(1);
  }, [alleyId, period, feeFilter]);

  const openNameModal = (type, item = null) => {
    setNameValue(item?.name || '');
    setNameModal({ type, item });
  };

  const saveNameModal = async (event) => {
    event.preventDefault();
    const name = nameValue.trim();
    if (!name) return;
    try {
      if (nameModal.type === 'district') {
        if (nameModal.item) await api.put(`/geo/districts/${nameModal.item.id}`, { name });
        else await api.post('/geo/districts', { name });
        await loadDistricts();
        await loadSummary();
      }
      if (nameModal.type === 'passage') {
        if (!districtId) return flash('اول ناحیه را انتخاب کنید', 'error');
        if (nameModal.item) await api.put(`/geo/passages/${nameModal.item.id}`, { name });
        else await api.post('/geo/passages', { district_id: districtId, name });
        await loadPassages(districtId);
      }
      if (nameModal.type === 'alley') {
        if (!passageId) return flash('اول گذر را انتخاب کنید', 'error');
        if (nameModal.item) await api.put(`/geo/alleys/${nameModal.item.id}`, { name });
        else await api.post('/geo/alleys', { passage_id: passageId, name });
        await loadAlleys(passageId);
      }
      setNameModal(null);
      flash('ثبت شد');
    } catch (error) {
      flash(error.response?.data?.message || 'خطا در ثبت', 'error');
    }
  };

  const saveHouse = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...houseForm,
        alley_id: alleyId,
        customer_id: houseForm.customer_id || null,
      };
      if (houseModal?.id) {
        await api.put(`/geo/houses/${houseModal.id}`, payload);
      } else {
        await api.post('/geo/houses', payload);
      }
      setHouseModal(null);
      flash('خانه ثبت شد');
      await loadHouses(page);
      await loadSummary();
      await loadAlleys(passageId);
      const { data } = await api.get('/geo/citizens');
      setCitizens(data || []);
    } catch (error) {
      flash(error.response?.data?.message || 'خطا در ثبت خانه', 'error');
    }
  };

  const saveBulk = async (event) => {
    event.preventDefault();
    try {
      const { data } = await api.post('/geo/houses/bulk', {
        alley_id: alleyId,
        from_plate: Number(bulkForm.from_plate),
        to_plate: Number(bulkForm.to_plate),
        fee_amount: Number(bulkForm.fee_amount) || defaultFee,
      });
      setBulkModal(false);
      flash(`${data.inserted} خانه از ${data.requested} درخواست ثبت شد`);
      await loadHouses(1);
      await loadSummary();
      await loadAlleys(passageId);
    } catch (error) {
      flash(error.response?.data?.message || 'خطا در ثبت دسته‌ای', 'error');
    }
  };

  const setFee = async (houseId, status) => {
    setFeeBusy(true);
    try {
      await api.post(`/geo/houses/${houseId}/fee`, { period, status });
      await loadHouses(page);
      await loadSummary();
    } catch (error) {
      flash(error.response?.data?.message || 'خطا در ثبت فیس', 'error');
    } finally {
      setFeeBusy(false);
    }
  };

  const setFeeBulk = async (status) => {
    if (!selected.length) return;
    setFeeBusy(true);
    try {
      await api.post('/geo/houses/fees/bulk', { period, status, house_ids: selected });
      flash(status === 'paid' ? 'خانه‌های انتخاب‌شده پرداخت شدند' : 'پرداخت لغو شد');
      await loadHouses(page);
      await loadSummary();
    } catch (error) {
      flash(error.response?.data?.message || 'خطا در ثبت گروهی', 'error');
    } finally {
      setFeeBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'district') {
        await api.delete(`/geo/districts/${deleteTarget.id}`);
        setDistrictId('');
        await loadDistricts();
      }
      if (deleteTarget.kind === 'passage') {
        await api.delete(`/geo/passages/${deleteTarget.id}`);
        setPassageId('');
        await loadPassages(districtId);
      }
      if (deleteTarget.kind === 'alley') {
        await api.delete(`/geo/alleys/${deleteTarget.id}`);
        setAlleyId('');
        await loadAlleys(passageId);
      }
      if (deleteTarget.kind === 'house') {
        await api.delete(`/geo/houses/${deleteTarget.id}`);
        await loadHouses(page);
        await loadAlleys(passageId);
      }
      if (deleteTarget.kind === 'houses-bulk') {
        const { data } = await api.post('/geo/houses/bulk-delete', { house_ids: deleteTarget.ids });
        flash(`${data.deleted || 0} خانه حذف شد`);
        await loadHouses(1);
        setPage(1);
        await loadAlleys(passageId);
        await loadSummary();
        setDeleteTarget(null);
        return;
      }
      await loadSummary();
      setDeleteTarget(null);
      flash('حذف شد');
    } catch (error) {
      flash(error.response?.data?.message || 'خطا در حذف', 'error');
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    if (selected.length === houses.length) setSelected([]);
    else setSelected(houses.map((h) => h.id));
  };

  const districtName = districts.find((d) => String(d.id) === String(districtId))?.name;
  const passageName = passages.find((p) => String(p.id) === String(passageId))?.name;
  const alleyName = alleys.find((a) => String(a.id) === String(alleyId))?.name;

  const globalFeeStats = summary?.fees
    ? {
      housesTotal: summary.fees.housesTotal,
      housesPaid: summary.fees.housesPaid,
      housesUnpaid: summary.fees.housesUnpaid,
      amountPaid: summary.fees.amountPaid,
      amountUnpaid: summary.fees.amountUnpaid,
    }
    : null;

  const activeFeeStats = alleyId ? stats : (scopeStats || globalFeeStats);

  return (
    <div className="houses-page page-shell animate-page">
      <div className="page-heading animate-fade-up">
        <div className="page-heading-copy">
          <h2>مناطق و خانه‌ها</h2>
          <p>ناحیه ← گذر ← کوچه ← خانه با پلاک — فیس ماهیانه {defaultFee} افغانی</p>
          <div className="related-links">
            <Link className="related-link" to="/">داشبورد</Link>
            <Link className="related-link" to="/customers">شهروندان</Link>
            <Link className="related-link" to="/collection_schedules">برنامه جمع‌آوری</Link>
            <Link className="related-link" to="/reports">گزارشات</Link>
            <Link className="related-link" to="/bills">بل‌ها</Link>
          </div>
        </div>
      </div>

      {message ? (
        <div className={`alert ${messageType}`} onClick={() => setMessage('')}>{message}</div>
      ) : null}

      <div className="houses-summary stats-grid dense animate-stagger">
        <article className="stat-card tone-info">
          <div className="stat-icon"><MapPinned size={20} /></div>
          <div>
            <span>کل خانه‌ها</span>
            <strong>{Number(activeFeeStats?.housesTotal || 0).toLocaleString('en-US')}</strong>
          </div>
        </article>
        <article className="stat-card tone-accent">
          <div className="stat-icon"><Home size={20} /></div>
          <div>
            <span>مبلغ کل فیس</span>
            <strong>{money((Number(activeFeeStats?.amountPaid || 0) + Number(activeFeeStats?.amountUnpaid || 0)))}</strong>
          </div>
        </article>
        <article className="stat-card tone-good">
          <div className="stat-icon"><CheckCircle2 size={20} /></div>
          <div>
            <span>جمع‌شده</span>
            <strong>{money(activeFeeStats?.amountPaid || 0)}</strong>
          </div>
        </article>
        <article className="stat-card tone-warn">
          <div className="stat-icon"><XCircle size={20} /></div>
          <div>
            <span>مانده</span>
            <strong>{money(activeFeeStats?.amountUnpaid || 0)}</strong>
          </div>
        </article>
      </div>

      <section className="houses-filters panel animate-fade-up delay-1">
        <div className="houses-filters-head">
          <h3>انتخاب مسیر و ماه فیس</h3>
          <p>ابتدا ناحیه، گذر و کوچه را مشخص کنید</p>
        </div>

        <div className="houses-filters-grid">
          <label className="houses-field">
            <span>۱. ناحیه</span>
            <div className="houses-select-row">
              <select value={districtId} onChange={(e) => setDistrictId(e.target.value)}>
                <option value="">انتخاب ناحیه...</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.houses_count || 0} خانه)</option>
                ))}
              </select>
              <button type="button" className="icon-action" title="ناحیه جدید" onClick={() => openNameModal('district')}>
                <Plus size={18} />
              </button>
            </div>
          </label>

          <label className="houses-field">
            <span>۲. گذر</span>
            <div className="houses-select-row">
              <select value={passageId} onChange={(e) => setPassageId(e.target.value)} disabled={!districtId}>
                <option value="">انتخاب گذر...</option>
                {passages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.houses_count || 0} خانه)</option>
                ))}
              </select>
              <button type="button" className="icon-action" title="گذر جدید" disabled={!districtId} onClick={() => openNameModal('passage')}>
                <Plus size={18} />
              </button>
            </div>
          </label>

          <label className="houses-field">
            <span>۳. کوچه</span>
            <div className="houses-select-row">
              <select value={alleyId} onChange={(e) => setAlleyId(e.target.value)} disabled={!passageId}>
                <option value="">انتخاب کوچه...</option>
                {alleys.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.houses_count || 0} خانه)</option>
                ))}
              </select>
              <button type="button" className="icon-action" title="کوچه جدید" disabled={!passageId} onClick={() => openNameModal('alley')}>
                <Plus size={18} />
              </button>
            </div>
          </label>

          <label className="houses-field houses-field-period">
            <span>ماه فیس</span>
            <div className="houses-select-row houses-period-row">
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((label, index) => (
                  <option key={label} value={index + 1}>{label}</option>
                ))}
              </select>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </label>
        </div>
      </section>

      {alleyId ? (
        <section className="houses-result animate-fade-up delay-2">
          <div className="houses-result-head">
            <div className="houses-breadcrumb">
              <span>{districtName}</span>
              <span className="sep">/</span>
              <span>{passageName}</span>
              <span className="sep">/</span>
              <strong>{alleyName}</strong>
            </div>
            <div className="houses-result-period">{shamsiMonthLabel(month)} {year}</div>
          </div>

          <div className="houses-alley-stats">
            <div><span>خانه‌ها</span><strong>{stats?.housesTotal ?? 0}</strong></div>
            <div className="good"><span>پرداخت‌شده</span><strong>{stats?.housesPaid ?? 0}</strong></div>
            <div className="warn"><span>مانده</span><strong>{stats?.housesUnpaid ?? 0}</strong></div>
            <div className="accent"><span>دریافتی</span><strong>{money(stats?.amountPaid)}</strong></div>
          </div>

          <div className="table-card houses-table-card">
            <div className="houses-toolbar-bar">
              <form className="search-box houses-search" onSubmit={(e) => { e.preventDefault(); setPage(1); loadHouses(1); }}>
                <Search size={18} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="جستجوی پلاک، نام یا تماس..."
                />
              </form>

              <select className="houses-filter-select" value={feeFilter} onChange={(e) => setFeeFilter(e.target.value)}>
                <option value="">همه وضعیت‌ها</option>
                <option value="paid">پرداخت‌شده</option>
                <option value="unpaid">پرداخت‌نشده</option>
              </select>

              <div className="houses-toolbar-actions">
                {selected.length > 0 ? (
                  <>
                    <button type="button" className="primary-button" disabled={feeBusy} onClick={() => setFeeBulk('paid')}>
                      پرداخت {selected.length}
                    </button>
                    <button type="button" className="secondary-button" disabled={feeBusy} onClick={() => setFeeBulk('unpaid')}>
                      لغو پرداخت
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => setDeleteTarget({
                        kind: 'houses-bulk',
                        ids: selected,
                        label: `${selected.length} خانه انتخاب‌شده`,
                      })}
                    >
                      <Trash2 size={15} /> حذف {selected.length}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setBulkForm({ from_plate: 1, to_plate: 50, fee_amount: defaultFee });
                    setBulkModal(true);
                  }}
                >
                  <Wand2 size={16} /> <span>ثبت دسته‌ای</span>
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setHouseForm({ plate_number: '', fee_amount: defaultFee, customer_id: '', owner_name: '', phone: '' });
                    setHouseModal({});
                  }}
                >
                  <Plus size={16} /> <span>خانه جدید</span>
                </button>
              </div>
            </div>

            <div className="table-scroll houses-desktop-table">
              <table>
                <thead>
                  <tr>
                    <th className="col-check">
                      <input
                        type="checkbox"
                        checked={houses.length > 0 && selected.length === houses.length}
                        onChange={toggleAll}
                      />
                    </th>
                    <th>پلاک</th>
                    <th>شهروند / صاحب‌خانه</th>
                    <th>تماس</th>
                    <th>فیس</th>
                    <th>وضعیت</th>
                    <th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7}>در حال بارگذاری...</td></tr>
                  ) : houses.length ? houses.map((house) => (
                    <tr key={house.id}>
                      <td className="col-check">
                        <input
                          type="checkbox"
                          checked={selected.includes(house.id)}
                          onChange={() => toggleSelect(house.id)}
                        />
                      </td>
                      <td><strong>{house.plate_number}</strong></td>
                      <td>
                        <div className="house-citizen-cell">
                          <strong>{house.citizen_name || house.owner_name || '—'}</strong>
                          {house.customer_id ? <span className="status-pill good">وصل به شهروند</span> : null}
                          <span className="house-address-mini">
                            {house.district_name || '—'} › {house.passage_name || '—'} › {house.alley_name || '—'}
                          </span>
                        </div>
                      </td>
                      <td>{house.customer_phone || house.phone || '—'}</td>
                      <td>{money(house.period_amount || house.fee_amount)}</td>
                      <td>
                        <span className={`status-pill ${house.fee_status === 'paid' ? 'good' : 'muted'}`}>
                          {house.fee_status === 'paid' ? 'پرداخت شده' : 'پرداخت نشده'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          {house.fee_status === 'paid' ? (
                            <button type="button" className="action-chip ghost" disabled={feeBusy} onClick={() => setFee(house.id, 'unpaid')}>لغو</button>
                          ) : (
                            <button type="button" className="action-chip primary" disabled={feeBusy} onClick={() => setFee(house.id, 'paid')}>دریافت</button>
                          )}
                          <button
                            type="button"
                            className="action-chip edit"
                            title="ویرایش"
                            onClick={() => {
                              setHouseForm({
                                plate_number: house.plate_number,
                                fee_amount: house.fee_amount,
                                customer_id: house.customer_id || '',
                                owner_name: house.citizen_name || house.owner_name || '',
                                phone: house.customer_phone || house.phone || '',
                              });
                              setHouseModal(house);
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="action-chip danger"
                            title="حذف"
                            onClick={() => setDeleteTarget({ kind: 'house', id: house.id, label: `پلاک ${house.plate_number}` })}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7}>خانه‌ای در این کوچه ثبت نشده است.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="houses-mobile-list">
              {loading ? (
                <div className="houses-mobile-empty">در حال بارگذاری...</div>
              ) : houses.length ? houses.map((house) => (
                <article key={house.id} className={`houses-mobile-card ${house.fee_status === 'paid' ? 'is-paid' : ''}`}>
                  <div className="houses-mobile-top">
                    <label className="houses-mobile-check">
                      <input
                        type="checkbox"
                        checked={selected.includes(house.id)}
                        onChange={() => toggleSelect(house.id)}
                      />
                      <strong>پلاک {house.plate_number}</strong>
                    </label>
                    <span className={`status-pill ${house.fee_status === 'paid' ? 'good' : 'muted'}`}>
                      {house.fee_status === 'paid' ? 'پرداخت شده' : 'پرداخت نشده'}
                    </span>
                  </div>
                  <div className="houses-mobile-meta">
                    <span>{house.citizen_name || house.owner_name || 'بدون نام'}</span>
                    <span>{house.phone || '—'}</span>
                    <span>{money(house.period_amount || house.fee_amount)}</span>
                  </div>
                  <div className="houses-mobile-actions">
                    {house.fee_status === 'paid' ? (
                      <button type="button" className="action-chip ghost" disabled={feeBusy} onClick={() => setFee(house.id, 'unpaid')}>لغو پرداخت</button>
                    ) : (
                      <button type="button" className="action-chip primary" disabled={feeBusy} onClick={() => setFee(house.id, 'paid')}>دریافت فیس</button>
                    )}
                    <button
                      type="button"
                      className="action-chip edit"
                      onClick={() => {
                        setHouseForm({
                          plate_number: house.plate_number,
                          fee_amount: house.fee_amount,
                          customer_id: house.customer_id || '',
                          owner_name: house.citizen_name || house.owner_name || '',
                          phone: house.customer_phone || house.phone || '',
                        });
                        setHouseModal(house);
                      }}
                    >
                      <Pencil size={14} /> ویرایش
                    </button>
                    <button
                      type="button"
                      className="action-chip danger"
                      onClick={() => setDeleteTarget({ kind: 'house', id: house.id, label: `پلاک ${house.plate_number}` })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              )) : (
                <div className="houses-mobile-empty">خانه‌ای در این کوچه ثبت نشده است.</div>
              )}
            </div>

            {pagination.pages > 1 ? (
              <div className="pagination houses-pagination">
                <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); loadHouses(p); }}>قبلی</button>
                <span>صفحه {pagination.page} از {pagination.pages}</span>
                <button type="button" className="secondary-button" disabled={page >= pagination.pages} onClick={() => { const p = page + 1; setPage(p); loadHouses(p); }}>بعدی</button>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <div className="panel houses-empty animate-fade-up">
          <Home size={28} />
          <p>برای دیدن خانه‌ها، به‌ترتیب <strong>ناحیه</strong>، <strong>گذر</strong> و <strong>کوچه</strong> را انتخاب کنید.</p>
        </div>
      )}

      {nameModal ? (
        <Modal
          title={
            nameModal.type === 'district' ? (nameModal.item ? 'ویرایش ناحیه' : 'ناحیه جدید')
              : nameModal.type === 'passage' ? (nameModal.item ? 'ویرایش گذر' : 'گذر جدید')
                : (nameModal.item ? 'ویرایش کوچه' : 'کوچه جدید')
          }
          onClose={() => setNameModal(null)}
        >
          <form onSubmit={saveNameModal} className="form-grid">
            <label className="full-field">
              <span>نام</span>
              <input value={nameValue} onChange={(e) => setNameValue(e.target.value)} required autoFocus />
            </label>
            <div className="modal-actions full-field">
              <button type="button" className="secondary-button" onClick={() => setNameModal(null)}>انصراف</button>
              <button type="submit" className="primary-button">ذخیره</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {houseModal ? (
        <Modal title={houseModal.id ? 'ویرایش خانه' : 'خانه جدید'} onClose={() => setHouseModal(null)}>
          <form onSubmit={saveHouse} className="form-grid">
            <label className="full-field">
              <span>۱. شهروند</span>
              <select
                value={houseForm.customer_id || ''}
                onChange={(e) => onCitizenPick(e.target.value)}
              >
                <option value="">انتخاب شهروند...</option>
                {citizens.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}{c.phone ? ` — ${c.phone}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>۲. پلاک خانه</span>
              <input
                value={houseForm.plate_number}
                onChange={(e) => setHouseForm({ ...houseForm, plate_number: e.target.value })}
                placeholder="با انتخاب شهروند خودکار پر می‌شود"
                required
              />
            </label>
            <label>
              <span>فیس ماهیانه</span>
              <input type="number" min="1" value={houseForm.fee_amount} onChange={(e) => setHouseForm({ ...houseForm, fee_amount: e.target.value })} required />
            </label>
            <label>
              <span>نام صاحب‌خانه</span>
              <input
                value={houseForm.owner_name}
                readOnly={Boolean(houseForm.customer_id)}
                onChange={(e) => setHouseForm({ ...houseForm, owner_name: e.target.value, customer_id: '' })}
              />
            </label>
            <label>
              <span>تماس</span>
              <input
                value={houseForm.phone}
                readOnly={Boolean(houseForm.customer_id)}
                onChange={(e) => setHouseForm({ ...houseForm, phone: e.target.value })}
              />
            </label>
            <p className="form-hint full-field">
              اول شهروند را انتخاب کنید؛ نام، تماس و پلاک (اگر قبلاً در پرونده‌اش باشد) خودکار می‌آید. فقط در صورت نیاز پلاک را اصلاح کنید.
              {' '}
              <a href="/customers">مدیریت شهروندان</a>
            </p>
            <div className="modal-actions full-field">
              <button type="submit" className="primary-button">ذخیره</button>
              <button type="button" className="secondary-button" onClick={() => setHouseModal(null)}>انصراف</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {bulkModal ? (
        <Modal title="ثبت دسته‌ای خانه‌ها با پلاک" onClose={() => setBulkModal(false)}>
          <form onSubmit={saveBulk} className="form-grid">
            <label>
              <span>از پلاک</span>
              <input type="number" min="1" value={bulkForm.from_plate} onChange={(e) => setBulkForm({ ...bulkForm, from_plate: e.target.value })} required />
            </label>
            <label>
              <span>تا پلاک</span>
              <input type="number" min="1" value={bulkForm.to_plate} onChange={(e) => setBulkForm({ ...bulkForm, to_plate: e.target.value })} required />
            </label>
            <label className="full-field">
              <span>فیس هر خانه</span>
              <input type="number" min="1" value={bulkForm.fee_amount} onChange={(e) => setBulkForm({ ...bulkForm, fee_amount: e.target.value })} required />
            </label>
            <p className="form-hint full-field">مثال: از ۱ تا ۱۰۰ → یک‌صد خانه با پلاک‌های ۱ تا ۱۰۰ در این کوچه ثبت می‌شود.</p>
            <div className="modal-actions full-field">
              <button type="button" className="secondary-button" onClick={() => setBulkModal(false)}>انصراف</button>
              <button type="submit" className="primary-button">ثبت دسته‌ای</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          open
          title="حذف"
          message={`آیا از حذف «${deleteTarget.label || deleteTarget.id}» مطمئن هستید؟`}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
