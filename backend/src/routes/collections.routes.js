import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { getAreaProgress } from '../utils/areaProgress.js';

const router = Router();
router.use(authenticate);

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

router.get('/progress', async (req, res, next) => {
  try {
    const date = req.query.date || todayIso();
    res.json(await getAreaProgress(date));
  } catch (error) {
    next(error);
  }
});

router.post('/progress', async (req, res, next) => {
  try {
    const areaId = Number(req.body.area_id);
    const housesCollected = Math.max(0, Number(req.body.houses_collected || 0));
    const date = req.body.collection_date || todayIso();
    const notes = req.body.notes || null;

    if (!areaId) {
      return res.status(400).json({ message: 'منطقه الزامی است.' });
    }

    const [[area]] = await pool.query(`SELECT id, house_count FROM areas WHERE id = ?`, [areaId]);
    if (!area) return res.status(404).json({ message: 'منطقه پیدا نشد.' });

    if (housesCollected > Number(area.house_count || 0)) {
      return res.status(400).json({
        message: `تعداد دریافتی نمی‌تواند بیشتر از تعداد خانه‌ها (${area.house_count}) باشد.`,
      });
    }

    await pool.query(
      `INSERT INTO area_daily_collections (area_id, collection_date, houses_collected, notes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE houses_collected = VALUES(houses_collected), notes = VALUES(notes)`,
      [areaId, date, housesCollected, notes]
    );

    res.json(await getAreaProgress(date));
  } catch (error) {
    next(error);
  }
});

export default router;
