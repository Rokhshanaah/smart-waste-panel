export const PAYMENT_METHODS = [
  ['cash', 'نقدی'],
  ['credit', 'نسیه'],
  ['exchange', 'صرافی'],
];

export const PAYMENT_METHOD_LABELS = {
  cash: 'نقدی',
  credit: 'نسیه',
  exchange: 'صرافی',
  // رکوردهای قدیمی
  installment: 'قسطی',
  bank: 'بانکی',
  online: 'آنلاین',
};

export function paymentMethodLabel(method, { settled = false, openCredit = false } = {}) {
  const key = String(method || '').trim().toLowerCase();
  if (settled) return 'تسویه نسیه';
  if (openCredit && key === 'credit') return 'نسیه (باز)';
  return PAYMENT_METHOD_LABELS[key] || (key ? 'سایر' : '—');
}

export function isCreditMethod(method) {
  return String(method || '').toLowerCase() === 'credit';
}

export function isCashLikeMethod(method) {
  const key = String(method || '').toLowerCase();
  return key === 'cash' || key === 'exchange';
}

/** روش‌های قدیمی را به یکی از گزینه‌های فعلی تبدیل می‌کند */
export function normalizePaymentMethod(method) {
  const key = String(method || '').trim().toLowerCase();
  if (key === 'credit') return 'credit';
  if (key === 'exchange') return 'exchange';
  if (key === 'cash' || key === 'installment' || key === 'bank' || key === 'online') return 'cash';
  return 'cash';
}
