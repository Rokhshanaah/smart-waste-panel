import { pool } from '../config/db.js';

export const MATERIAL_LABELS = {
  iron: 'آهن',
  plastic: 'پلاستیک',
  aluminum: 'المونیم',
  wood: 'چوب',
  glass: 'شیشه',
  other: 'سایر',
};

export function materialLabel(type) {
  const key = String(type || '').trim().toLowerCase();
  return MATERIAL_LABELS[key] || type || 'سایر';
}

/** موجودی باقی‌مانده هر نوع مواد (ورود − فروش) */
export async function getMaterialStockSummary(conn = pool) {
  const [rows] = await conn.query(
    `SELECT
       material_type,
       COALESCE(SUM(CASE WHEN transaction_type = 'stock' THEN weight_kg ELSE 0 END), 0) AS stock_kg,
       COALESCE(SUM(CASE WHEN transaction_type = 'sale' THEN weight_kg ELSE 0 END), 0) AS sold_kg,
       COALESCE(SUM(CASE WHEN transaction_type = 'stock' THEN weight_kg ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN transaction_type = 'sale' THEN weight_kg ELSE 0 END), 0) AS available_kg
     FROM recycling_records
     GROUP BY material_type
     ORDER BY material_type ASC`
  );

  const items = Object.keys(MATERIAL_LABELS).map((type) => {
    const row = rows.find((r) => r.material_type === type);
    return {
      material_type: type,
      label: MATERIAL_LABELS[type],
      stockKg: Number(row?.stock_kg || 0),
      soldKg: Number(row?.sold_kg || 0),
      availableKg: Number(row?.available_kg || 0),
    };
  });

  const totals = items.reduce(
    (acc, item) => {
      acc.stockKg += item.stockKg;
      acc.soldKg += item.soldKg;
      acc.availableKg += item.availableKg;
      return acc;
    },
    { stockKg: 0, soldKg: 0, availableKg: 0 }
  );

  return { items, totals };
}

export async function getAvailableKg(materialType, excludeRecordId = null, conn = pool) {
  const params = [materialType];
  let excludeSql = '';
  if (excludeRecordId) {
    excludeSql = ' AND id <> ?';
    params.push(Number(excludeRecordId));
  }

  const [[row]] = await conn.query(
    `SELECT
       COALESCE(SUM(CASE WHEN transaction_type = 'stock' THEN weight_kg ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN transaction_type = 'sale' THEN weight_kg ELSE 0 END), 0) AS available_kg
     FROM recycling_records
     WHERE material_type = ? ${excludeSql}`,
    params
  );

  return Number(row?.available_kg || 0);
}

export async function assertSaleWithinStock(record, excludeRecordId = null, conn = pool) {
  if (record.transaction_type !== 'sale') return;
  const available = await getAvailableKg(record.material_type, excludeRecordId, conn);
  const weight = Number(record.weight_kg || 0);
  if (weight > available + 0.0001) {
    const error = new Error(
      `موجودی کافی نیست. از «${materialLabel(record.material_type)}» فقط ${available.toLocaleString('en-US')} کیلو باقی مانده است.`
    );
    error.status = 400;
    throw error;
  }
}
