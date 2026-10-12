import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole, Mail } from 'lucide-react';
import api from '../services/api';
import AppLogo from '../components/AppLogo';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'admin@municipality.local', password: 'Admin@123' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    const email = String(form.email || '').trim();
    const password = String(form.password || '');

    if (!email.includes('@')) {
      setError('نام کاربری باید ایمیل معتبر باشد.');
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.post('/auth/login', { email, username: email, password });
      localStorage.setItem('waste_token', data.token);
      localStorage.setItem('waste_user', JSON.stringify(data.user));
      navigate('/');
    } catch (err) {
      if (!err.response) {
        setError('ارتباط با سرور برقرار نشد. مطمئن شوید backend روی پورت ۵۰۰۰ در حال اجرا است.');
      } else {
        setError(err.response?.data?.message || 'ورود ناموفق بود.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-visual animate-fade-in">
        <div className="login-copy animate-fade-up">
          <div className="large-logo">
            <AppLogo size={110} />
          </div>
          <h1>شهر پاک، مدیریت هوشمند</h1>
          <p>مدیریت شهروندان، بل‌ها، موترها، جمع‌آوری زباله و گزارش‌های مالی در یک پنل ساده.</p>
          <div className="feature-pills"><span>مدیریت یکپارچه</span><span>گزارش دقیق</span><span>رابط حرفه‌ای</span></div>
        </div>
      </div>
      <div className="login-panel">
        <form className="login-form animate-fade-up delay-1" onSubmit={submit} autoComplete="on">
          <div className="login-title">
            <AppLogo size={64} className="login-brand-logo" />
            <div>
              <h2>ورود به سیستم</h2>
              <p>با ایمیل به‌عنوان نام کاربری وارد شوید</p>
            </div>
          </div>
          {error && <div className="alert error">{error}</div>}
          <label>ایمیل (نام کاربری)</label>
          <div className="input-icon">
            <Mail size={19} />
            <input
              type="email"
              name="username"
              autoComplete="username"
              inputMode="email"
              placeholder="admin@municipality.local"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <label>رمز عبور</label>
          <div className="input-icon">
            <LockKeyhole size={19} />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          <button className="primary-button wide" disabled={loading}>
            {loading ? 'در حال ورود...' : 'ورود به پنل'}
          </button>
          <div className="demo-note">حساب آزمایشی: admin@municipality.local / Admin@123</div>
        </form>
      </div>
    </div>
  );
}
