import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, RotateCcw, Save, Settings2, Database, AlertTriangle } from 'lucide-react';
import api from '../services/api';

const emptySettings = {
  org_name: '',
  org_city: '',
  currency_label: '',
  support_phone: '',
  backup_note: '',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(emptySettings);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetText, setResetText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/settings')
      .then(({ data }) => setSettings({ ...emptySettings, ...data }))
      .catch((err) => setError(err.response?.data?.message || 'دریافت تنظیمات ناموفق بود.'))
      .finally(() => setLoading(false));
  }, []);

  const saveSettings = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.put('/settings', settings);
      setSettings({ ...emptySettings, ...data });
      setMessage('تنظیمات با موفقیت ذخیره شد.');
    } catch (err) {
      setError(err.response?.data?.message || 'ذخیره تنظیمات ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const downloadBackup = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await api.get('/settings/backup', { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/sql' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `smart-waste-backup-${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage('فایل بک‌آپ دیتابیس دانلود شد.');
    } catch (err) {
      setError(err.response?.data?.message || 'بک‌آپ‌گیری ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const resetDatabase = async () => {
    if (resetText !== 'RESET') {
      setError('برای ریست دیتابیس باید کلمه RESET را وارد کنید.');
      return;
    }
    if (!window.confirm('همه داده‌ها پاک می‌شوند و فقط حساب ادمین باقی می‌ماند. ادامه می‌دهید؟')) return;

    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/settings/reset', { confirm: 'RESET' });
      setMessage(`${data.message} ایمیل: ${data.adminEmail} | رمز: ${data.adminPassword}`);
      setResetText('');
    } catch (err) {
      setError(err.response?.data?.message || 'ریست دیتابیس ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="empty-state">در حال بارگذاری تنظیمات...</div>;

  return (
    <div className="page-shell animate-page">
      <div className="page-heading animate-fade-up">
        <div>
          <h2>تنظیمات سیستم</h2>
          <p>پیکربندی عمومی، پشتیبان‌گیری و ریست دیتابیس</p>
          <div className="related-links">
            <Link className="related-link" to="/">داشبورد</Link>
            <Link className="related-link" to="/areas">مناطق و خانه‌ها</Link>
            <Link className="related-link" to="/users">کاربران</Link>
          </div>
        </div>
      </div>

      {message && <div className="alert success animate-fade-up" onClick={() => setMessage('')}>{message}</div>}
      {error && <div className="alert error animate-fade-up">{error}</div>}

      <div className="settings-grid animate-stagger">
        <form className="panel" onSubmit={saveSettings}>
          <h3><Settings2 size={18} /> تنظیمات عمومی</h3>
          <div className="form-grid">
            <label>
              <span>نام سازمان</span>
              <input value={settings.org_name} onChange={(e) => setSettings({ ...settings, org_name: e.target.value })} />
            </label>
            <label>
              <span>شهر</span>
              <input value={settings.org_city} onChange={(e) => setSettings({ ...settings, org_city: e.target.value })} />
            </label>
            <label>
              <span>واحد پول</span>
              <input value={settings.currency_label} onChange={(e) => setSettings({ ...settings, currency_label: e.target.value })} />
            </label>
            <label>
              <span>شماره پشتیبانی</span>
              <input type="tel" autoComplete="tel" value={settings.support_phone} onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })} />
            </label>
            <label className="full-field">
              <span>یادداشت پشتیبان‌گیری</span>
              <textarea rows="3" value={settings.backup_note} onChange={(e) => setSettings({ ...settings, backup_note: e.target.value })} />
            </label>
          </div>
          <div className="modal-actions">
            <button className="primary-button" disabled={busy}><Save size={16} /> ذخیره تنظیمات</button>
          </div>
        </form>

        <div className="panel">
          <h3><Database size={18} /> پشتیبان‌گیری دیتابیس</h3>
          <p className="settings-copy">
            یک فایل SQL از تمام اطلاعات سیستم دانلود می‌شود تا در صورت نیاز بتوانید بازیابی کنید.
          </p>
          <div className="note-box">{settings.backup_note || 'پشتیبان‌گیری منظم توصیه می‌شود.'}</div>
          <div className="modal-actions">
            <button type="button" className="primary-button" onClick={downloadBackup} disabled={busy}>
              <Download size={16} /> دانلود بک‌آپ
            </button>
          </div>
        </div>

        <div className="panel danger-panel">
          <h3><AlertTriangle size={18} /> ریست دیتابیس</h3>
          <p className="settings-copy">
            همه اطلاعات پیش‌فرض و عملیاتی (مناطق و خانه‌ها، شهروندان، بل‌ها، درآمد، هزینه، صندوق، برنامه جمع‌آوری و ...) پاک می‌شوند.
            فقط کاربران مدیر باقی می‌مانند و رمز مدیر اصلی به `Admin@123` بازمی‌گردد.
          </p>
          <label>
            <span>برای تأیید، کلمه RESET را بنویسید</span>
            <input
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              placeholder="RESET"
              autoComplete="off"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="danger-button" onClick={resetDatabase} disabled={busy}>
              <RotateCcw size={16} /> ریست کامل دیتابیس
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
