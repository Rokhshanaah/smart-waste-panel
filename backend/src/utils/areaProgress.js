import { pool } from '../config/db.js';

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function getAreaProgress(date = todayIso()) {
  const [rows] = await pool.query(
    `SELECT
       a.id,
       a.name,
       a.district,
       a.house_count,
       a.status,
       COALESCE(d.houses_collected, 0) AS houses_collected,
       GREATEST(CAST(a.house_count AS SIGNED) - CAST(COALESCE(d.houses_collected, 0) AS SIGNED), 0) AS houses_remaining,
       CASE
         WHEN a.house_count > 0 THEN ROUND((COALESCE(d.houses_collected, 0) / a.house_count) * 100)
         ELSE 0
       END AS progress_percent,
       d.id AS log_id,
       d.notes
     FROM areas a
     LEFT JOIN area_daily_collections d
       ON d.area_id = a.id AND d.collection_date = ?
     WHERE a.status = 'active'
     ORDER BY a.name ASC`,
    [date]
  );

  const totals = rows.reduce(
    (acc, row) => {
      acc.housesTotal += Number(row.house_count || 0);
      acc.housesCollected += Number(row.houses_collected || 0);
      acc.housesRemaining += Number(row.houses_remaining || 0);
      return acc;
    },
    { housesTotal: 0, housesCollected: 0, housesRemaining: 0 }
  );

  return {
    date,
    areas: rows.map((row) => ({
      id: row.id,
      name: row.name,
      district: row.district,
      houseCount: Number(row.house_count || 0),
      housesCollected: Number(row.houses_collected || 0),
      housesRemaining: Number(row.houses_remaining || 0),
      progressPercent: Number(row.progress_percent || 0),
      logId: row.log_id,
      notes: row.notes,
      summary: `از ${row.name}، ${Number(row.house_count || 0).toLocaleString('en-US')} خانه موجود است؛ دریافتی امروز ${Number(row.houses_collected || 0).toLocaleString('en-US')} خانه؛ ${Number(row.houses_remaining || 0).toLocaleString('en-US')} خانه مانده.`,
    })),
    totals: {
      ...totals,
      progressPercent: totals.housesTotal > 0
        ? Math.round((totals.housesCollected / totals.housesTotal) * 100)
        : 0,
    },
  };
}
