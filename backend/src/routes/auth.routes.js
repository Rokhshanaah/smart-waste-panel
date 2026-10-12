import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { normalizePermissions } from '../utils/permissions.js';

const router = Router();

function mapUser(row) {
  const permissions = normalizePermissions(row.role, row.permissions);
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    permissions,
  };
}

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'ایمیل و رمز عبور الزامی است.' });
    }

    if (!email.includes('@')) {
      return res.status(400).json({ message: 'نام کاربری باید ایمیل باشد.' });
    }

    const [rows] = await pool.query(
      'SELECT id, full_name, email, phone, password_hash, role, status, permissions FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    const user = rows[0];
    if (!user || user.status !== 'active' || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'ایمیل یا رمز عبور اشتباه است.' });
    }

    const permissions = normalizePermissions(user.role, user.permissions);
    const token = jwt.sign(
      { id: user.id, fullName: user.full_name, email: user.email, role: user.role, permissions },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: mapUser(user),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, full_name, email, phone, role, status, permissions FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'کاربر پیدا نشد.' });
    res.json(mapUser(rows[0]));
  } catch (error) {
    next(error);
  }
});

export default router;
