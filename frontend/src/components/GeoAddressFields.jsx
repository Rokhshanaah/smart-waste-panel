import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPinned } from 'lucide-react';
import api from '../services/api';
import { currentFeePeriod } from '../utils/shamsi';

/**
 * Cascading address: ناحیه → گذر → کوچه → خانه(پلاک)
 * Only free plaques are listed (plus the currently linked one when editing).
 */
export default function GeoAddressFields({ value = {}, onChange }) {
  const [districts, setDistricts] = useState([]);
  const [passages, setPassages] = useState([]);
  const [alleys, setAlleys] = useState([]);
  const [houses, setHouses] = useState([]);
  const [mode, setMode] = useState('pick'); // pick | new
  const [newPlate, setNewPlate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const feePeriod = currentFeePeriod();

  const [districtId, setDistrictId] = useState('');
  const [passageId, setPassageId] = useState('');
  const [alleyId, setAlleyId] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    api.get('/geo/districts').then(({ data }) => setDistricts(data || [])).catch(() => setDistricts([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrateFromHouse() {
      if (!value.house_id || hydrated) return;
      try {
        const { data } = await api.get(`/geo/houses/${value.house_id}/context`);
        if (cancelled || !data) return;
        setDistrictId(String(data.district_id || ''));
        setPassageId(String(data.passage_id || ''));
        setAlleyId(String(data.alley_id || ''));
        setMode('pick');
        setHydrated(true);
        onChange?.({
          ...value,
          house_id: data.house_id,
          district_id: data.district_id || '',
          area_id: data.district_id || '',
          alley_id: data.alley_id || '',
          district: data.district_name || value.district || '',
          street: data.passage_name || value.street || '',
          alley: data.alley_name || value.alley || '',
          house_number: data.plate_number || value.house_number || '',
          pending_plate: '',
        });
      } catch {
        setHydrated(true);
      }
    }
    hydrateFromHouse();
    return () => { cancelled = true; };
  }, [value.house_id, hydrated]);

  useEffect(() => {
    if (!districtId) {
      setPassages([]);
      return;
    }
    api.get('/geo/passages', { params: { district_id: districtId } })
      .then(({ data }) => setPassages(data || []))
      .catch(() => setPassages([]));
  }, [districtId]);

  useEffect(() => {
    if (!passageId) {
      setAlleys([]);
      return;
    }
    api.get('/geo/alleys', { params: { passage_id: passageId } })
      .then(({ data }) => setAlleys(data || []))
      .catch(() => setAlleys([]));
  }, [passageId]);

  useEffect(() => {
    if (!alleyId) {
      setHouses([]);
      return;
    }
    api.get('/geo/houses', {
      params: {
        alley_id: alleyId,
        period: feePeriod,
        limit: 100,
        page: 1,
        available: 1,
        include_house_id: value.house_id || undefined,
      },
    })
      .then(({ data }) => setHouses(data.data || []))
      .catch(() => setHouses([]));
  }, [alleyId, value.house_id, feePeriod]);

  const emit = (patch) => onChange?.({ ...value, ...patch });

  const onDistrict = (id) => {
    setDistrictId(id);
    setPassageId('');
    setAlleyId('');
    setMode('pick');
    setNewPlate('');
    setError('');
    setHydrated(true);
    const district = districts.find((d) => String(d.id) === String(id));
    emit({
      house_id: '',
      district_id: id || '',
      area_id: id || '',
      alley_id: '',
      district: district?.name || '',
      street: '',
      alley: '',
      house_number: '',
      pending_plate: '',
    });
  };

  const onPassage = (id) => {
    setPassageId(id);
    setAlleyId('');
    setMode('pick');
    setNewPlate('');
    setError('');
    setHydrated(true);
    const passage = passages.find((p) => String(p.id) === String(id));
    emit({
      house_id: '',
      alley_id: '',
      street: passage?.name || '',
      alley: '',
      house_number: '',
      pending_plate: '',
    });
  };

  const onAlley = (id) => {
    setAlleyId(id);
    setMode('pick');
    setNewPlate('');
    setError('');
    setHydrated(true);
    const alley = alleys.find((a) => String(a.id) === String(id));
    emit({
      house_id: '',
      alley_id: id || '',
      alley: alley?.name || '',
      house_number: '',
      pending_plate: '',
    });
  };

  const onHouse = (id) => {
    setError('');
    setHydrated(true);
    if (id === '__new__') {
      setMode('new');
      emit({ house_id: '', house_number: '', pending_plate: newPlate || '', alley_id: alleyId || '' });
      return;
    }
    setMode('pick');
    setNewPlate('');
    const house = houses.find((h) => String(h.id) === String(id));
    const district = districts.find((d) => String(d.id) === String(districtId));
    const passage = passages.find((p) => String(p.id) === String(passageId));
    const alley = alleys.find((a) => String(a.id) === String(alleyId));
    emit({
      house_id: id || '',
      district_id: districtId || '',
      area_id: districtId || '',
      alley_id: alleyId || '',
      district: district?.name || value.district || '',
      street: passage?.name || value.street || '',
      alley: alley?.name || value.alley || '',
      house_number: house?.plate_number || '',
      pending_plate: '',
    });
  };

  const createPlate = async () => {
    const plate = String(newPlate || '').trim();
    if (!alleyId || !plate) {
      setError('پلاک جدید را وارد کنید.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/geo/houses', {
        alley_id: Number(alleyId),
        plate_number: plate,
      });
      const district = districts.find((d) => String(d.id) === String(districtId));
      const passage = passages.find((p) => String(p.id) === String(passageId));
      const alley = alleys.find((a) => String(a.id) === String(alleyId));
      emit({
        house_id: data.id,
        district_id: districtId || '',
        area_id: districtId || '',
        alley_id: alleyId || '',
        district: district?.name || value.district || '',
        street: passage?.name || value.street || '',
        alley: alley?.name || value.alley || '',
        house_number: plate,
        pending_plate: '',
      });
      setMode('pick');
      setNewPlate('');
      const list = await api.get('/geo/houses', {
        params: {
          alley_id: alleyId,
          period: feePeriod,
          limit: 100,
          page: 1,
          available: 1,
          include_house_id: data.id,
        },
      });
      setHouses(list.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'ثبت پلاک ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const availableLabel = (h) => {
    if (value.house_id && String(h.id) === String(value.house_id)) {
      return `پلاک ${h.plate_number} (انتخاب فعلی)`;
    }
    return `پلاک ${h.plate_number}`;
  };

  return (
    <div className="geo-address full-field">
      <div className="geo-address-head">
        <strong><MapPinned size={16} /> آدرس از مناطق و خانه‌ها</strong>
        <Link to="/areas" className="geo-address-link">مناطق و خانه‌ها</Link>
      </div>
      <div className="form-grid geo-address-grid">
        <label>
          <span>ناحیه</span>
          <select value={districtId} onChange={(e) => onDistrict(e.target.value)}>
            <option value="">انتخاب ناحیه...</option>
            {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label>
          <span>گذر</span>
          <select value={passageId} onChange={(e) => onPassage(e.target.value)} disabled={!districtId}>
            <option value="">انتخاب گذر...</option>
            {passages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>
          <span>کوچه</span>
          <select value={alleyId} onChange={(e) => onAlley(e.target.value)} disabled={!passageId}>
            <option value="">انتخاب کوچه...</option>
            {alleys.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label>
          <span>خانه (پلاک آزاد)</span>
          <select
            value={mode === 'new' ? '__new__' : (value.house_id || '')}
            onChange={(e) => onHouse(e.target.value)}
            disabled={!alleyId}
          >
            <option value="">انتخاب پلاک آزاد...</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>{availableLabel(h)}</option>
            ))}
            <option value="__new__">+ پلاک جدید در این کوچه</option>
          </select>
        </label>
        {mode === 'new' ? (
          <label className="full-field">
            <span>شماره پلاک جدید</span>
            <div className="houses-select-row">
              <input
                value={newPlate}
                onChange={(e) => {
                  const plate = e.target.value;
                  setNewPlate(plate);
                  emit({
                    house_id: '',
                    alley_id: alleyId || '',
                    house_number: plate.trim(),
                    pending_plate: plate.trim(),
                  });
                }}
                placeholder="مثلاً 45"
              />
              <button type="button" className="primary-button" disabled={busy} onClick={createPlate}>
                {busy ? '...' : 'ثبت پلاک'}
              </button>
            </div>
          </label>
        ) : null}
      </div>
      {value.house_number ? (
        <p className="form-hint" style={{ color: 'var(--brand)', fontWeight: 700 }}>
          پلاک انتخاب‌شده: {value.house_number}
        </p>
      ) : null}
      {error ? <p className="form-hint" style={{ color: '#c0392b' }}>{error}</p> : null}
      {alleyId && !houses.length && mode !== 'new' ? (
        <p className="form-hint">در این کوچه پلاک آزاد نیست. «پلاک جدید» را انتخاب کنید و دکمه ثبت پلاک را بزنید.</p>
      ) : (
        <p className="form-hint">پلاک الزامی است. یا پلاک آزاد انتخاب کنید یا پلاک جدید بسازید.</p>
      )}
      {!districts.length ? (
        <p className="form-hint">هنوز ناحیه‌ای ثبت نشده. از صفحه «مناطق و خانه‌ها» شروع کنید.</p>
      ) : null}
    </div>
  );
}
