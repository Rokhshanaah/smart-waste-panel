const MONTHS = [
  'حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله',
  'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت',
];

function div(a, b) {
  return Math.floor(a / b);
}

export function toJalaali(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + (365 * gy) + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) + gd + gdm[gm - 1];
  let jy = -1595 + (33 * div(days, 12053));
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

export function toGregorian(jy, jm, jd) {
  let jy2 = jy + 1595;
  let days = -355668 + (365 * jy2) + div(jy2, 33) * 8 + div((jy2 % 33) + 3, 4) + jd + (jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return { gy, gm, gd };
}

export function isLeapJalaaliYear(jy) {
  return (((jy - (jy > 0 ? 474 : 473)) % 2820) + 474 + 38) * 682 % 2816 < 682;
}

export function jalaaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaaliYear(jy) ? 30 : 29;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function gregorianToIso({ gy, gm, gd }) {
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

export function isoToParts(iso) {
  if (!iso) return null;
  const text = String(iso).slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { gy: Number(match[1]), gm: Number(match[2]), gd: Number(match[3]) };
}

export function todayIso() {
  // تاریخ امروز بر اساس وقت کابل (افغانستان)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isoToJalaali(iso) {
  const parts = isoToParts(iso);
  if (!parts) return null;
  return toJalaali(parts.gy, parts.gm, parts.gd);
}

export function jalaaliToIso(jy, jm, jd) {
  const g = toGregorian(Number(jy), Number(jm), Number(jd));
  return gregorianToIso(g);
}

export function formatShamsi(iso) {
  const j = isoToJalaali(iso);
  if (!j) return '—';
  return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
}

export function shamsiMonthLabel(jm) {
  return MONTHS[jm - 1] || String(jm);
}

/** Current Shamsi month as fee period, e.g. 1405-05 */
export function currentFeePeriod(iso = todayIso()) {
  const j = isoToJalaali(iso);
  if (!j) return '';
  return `${j.jy}-${pad(j.jm)}`;
}

export function getShamsiYearOptions(centerYear, range = 15) {
  const years = [];
  for (let y = centerYear - range; y <= centerYear + 2; y++) years.push(y);
  return years;
}

export { MONTHS };
