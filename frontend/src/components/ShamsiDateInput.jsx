import { useEffect, useMemo } from 'react';
import {
  MONTHS,
  formatShamsi,
  getShamsiYearOptions,
  isoToJalaali,
  jalaaliMonthLength,
  jalaaliToIso,
  todayIso,
} from '../utils/shamsi';

export default function ShamsiDateInput({ value, onChange, required = false, disabled = false }) {
  const today = isoToJalaali(todayIso()) || { jy: 1405, jm: 1, jd: 1 };
  const current = isoToJalaali(value) || today;

  useEffect(() => {
    if (!value) onChange?.(todayIso());
  }, [value]);

  const years = useMemo(() => getShamsiYearOptions(today.jy), [today.jy]);
  const maxDay = jalaaliMonthLength(current.jy, current.jm);

  const update = (next) => {
    let { jy, jm, jd } = next;
    const daysInMonth = jalaaliMonthLength(jy, jm);
    if (jd > daysInMonth) jd = daysInMonth;
    onChange?.(jalaaliToIso(jy, jm, jd));
  };

  return (
    <div className="shamsi-date-input" title={value ? `میلادی: ${String(value).slice(0, 10)}` : ''}>
      <select
        aria-label="روز"
        disabled={disabled}
        required={required}
        value={current.jd}
        onChange={(e) => update({ ...current, jd: Number(e.target.value) })}
      >
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((day) => (
          <option key={day} value={day}>{day}</option>
        ))}
      </select>
      <select
        aria-label="ماه"
        disabled={disabled}
        required={required}
        value={current.jm}
        onChange={(e) => update({ ...current, jm: Number(e.target.value) })}
      >
        {MONTHS.map((month, index) => (
          <option key={month} value={index + 1}>{month}</option>
        ))}
      </select>
      <select
        aria-label="سال"
        disabled={disabled}
        required={required}
        value={current.jy}
        onChange={(e) => update({ ...current, jy: Number(e.target.value) })}
      >
        {years.map((year) => (
          <option key={year} value={year}>{year}</option>
        ))}
      </select>
      <span className="shamsi-date-preview">{formatShamsi(value || todayIso())}</span>
    </div>
  );
}

export { todayIso, formatShamsi };
