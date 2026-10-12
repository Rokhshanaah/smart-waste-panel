import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, MapPinned, ReceiptText, UserRoundCog,
  Truck, CalendarDays, Recycle, Banknote, MessageSquareWarning, ShieldCheck,
  LogOut, Menu, X, Landmark, CircleDollarSign, PackageOpen, FileBarChart2,
  ChevronDown, Settings, Calendar
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getStoredUser, normalizePermissions } from '../permissionsCatalog';
import AppLogo from './AppLogo';
import { formatShamsi, shamsiMonthLabel, todayIso, isoToJalaali } from '../utils/shamsi';

const roleLabels = {
  admin: 'مدیر سیستم',
  accountant: 'حسابدار',
  employee: 'کارمند',
  driver: 'راننده',
  citizen: 'شهروند',
};

const groups = [
  {
    title: 'اصلی',
    items: [
      ['/', 'داشبورد', LayoutDashboard, 'dashboard'],
      ['/reports', 'گزارشات', FileBarChart2, 'reports'],
    ],
  },
  {
    title: 'مالی',
    items: [
      ['/bills', 'بل‌ها', ReceiptText, 'bills'],
      ['/incomes', 'درآمدها', CircleDollarSign, 'incomes'],
      ['/expenses', 'هزینه‌ها', Banknote, 'expenses'],
      ['/cash_box_transactions', 'صندوق', Landmark, 'cash_box_transactions'],
      ['/material_sales', 'فروش مواد', PackageOpen, 'material_sales'],
    ],
  },
  {
    title: 'عملیات',
    items: [
      ['/customers', 'شهروندان', Users, 'customers'],
      ['/areas', 'مناطق و خانه‌ها', MapPinned, 'areas'],
      ['/employees', 'کارمندان', UserRoundCog, 'employees'],
      ['/trucks', 'موترها', Truck, 'trucks'],
      ['/collection_schedules', 'برنامه جمع‌آوری', CalendarDays, 'collection_schedules'],
      ['/recycling_records', 'بازیافت', Recycle, 'recycling_records'],
      ['/complaints', 'شکایت‌ها', MessageSquareWarning, 'complaints'],
    ],
  },
  {
    title: 'سیستم',
    items: [
      ['/users', 'کاربران', ShieldCheck, 'users'],
      ['/settings', 'تنظیمات', Settings, 'settings'],
    ],
  },
];

const titles = Object.fromEntries(
  groups.flatMap((group) => group.items.map(([path, label]) => [path, label]))
);

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();
  const permissions = normalizePermissions(user.role, user.permissions);

  const visibleGroups = useMemo(
    () => groups
      .map((group) => ({
        ...group,
        items: group.items.filter(([, , , key]) => permissions.includes(key)),
      }))
      .filter((group) => group.items.length),
    [permissions.join(',')]
  );

  const pageTitle = useMemo(() => {
    if (location.pathname === '/') return 'داشبورد';
    return titles[location.pathname] || 'پنل مدیریت';
  }, [location.pathname]);

  const todayLabel = useMemo(() => {
    const iso = todayIso();
    const j = isoToJalaali(iso);
    if (!j) {
      return { iso, short: formatShamsi(iso), text: formatShamsi(iso) };
    }
    return {
      iso,
      short: formatShamsi(iso),
      text: `${j.jd} ${shamsiMonthLabel(j.jm)} ${j.jy}`,
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('sidebar-open', open);
    return () => document.body.classList.remove('sidebar-open');
  }, [open]);

  const logout = () => {
    localStorage.removeItem('waste_token');
    localStorage.removeItem('waste_user');
    navigate('/login');
  };

  const toggleGroup = (title) => {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const toggleSidebar = () => setOpen((prev) => !prev);

  return (
    <div className={`app-shell ${open ? 'nav-open' : ''}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-hidden={!open ? undefined : false}>
        <div className="brand">
          <AppLogo size={48} className="brand-logo" />
          <div className="brand-text">
            <strong>شاروالی هوشمند</strong>
            <span>تنظیف شهری</span>
          </div>
          <button
            type="button"
            className="burger-btn sidebar-close"
            onClick={() => setOpen(false)}
            aria-label="بستن منو"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="side-nav">
          {visibleGroups.map((group) => {
            const isCollapsed = collapsed[group.title];
            return (
              <div className="nav-group" key={group.title}>
                <button type="button" className="nav-group-title" onClick={() => toggleGroup(group.title)}>
                  <span>{group.title}</span>
                  <ChevronDown size={14} className={isCollapsed ? 'rotated' : ''} />
                </button>
                {!isCollapsed && group.items.map(([path, label, Icon]) => (
                  <NavLink key={path} to={path} end={path === '/'} onClick={() => setOpen(false)}>
                    <Icon size={16} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <button type="button" className="logout-button" onClick={logout}>
          <LogOut size={16} /> خروج
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-start">
            <button
              type="button"
              className="burger-btn"
              onClick={toggleSidebar}
              aria-label={open ? 'بستن منو' : 'باز کردن منو'}
              aria-expanded={open}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div className="topbar-title">
              <div className="topbar-kicker">شاروالی هوشمند</div>
              <h1>{pageTitle}</h1>
              <p>مدیریت یکپارچه خدمات شهری و مالی</p>
            </div>
          </div>

          <div className="topbar-end">
            <div className="topbar-date" title={todayLabel.short}>
              <span className="topbar-date-icon"><Calendar size={16} /></span>
              <div>
                <strong>{todayLabel.text}</strong>
                <span>امروز</span>
              </div>
            </div>

            <div className="user-card">
              <div className="user-meta">
                <strong>{user.fullName || 'مدیر سیستم'}</strong>
                <span>{roleLabels[user.role] || 'کاربر'}</span>
              </div>
              <div className="avatar">{user.fullName?.slice(0, 1) || 'م'}</div>
            </div>
          </div>
        </header>
        <section className="page-area"><Outlet /></section>
      </main>

      <button
        type="button"
        className={`overlay ${open ? 'show' : ''}`}
        aria-label="بستن منو"
        onClick={() => setOpen(false)}
      />
    </div>
  );
}
