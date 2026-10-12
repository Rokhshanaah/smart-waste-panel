export const PAGE_PERMISSIONS = [
  { key: 'dashboard', path: '/', label: 'داشبورد' },
  { key: 'reports', path: '/reports', label: 'گزارشات' },
  { key: 'bills', path: '/bills', label: 'بل‌ها' },
  { key: 'incomes', path: '/incomes', label: 'درآمدها' },
  { key: 'expenses', path: '/expenses', label: 'هزینه‌ها' },
  { key: 'cash_box_transactions', path: '/cash_box_transactions', label: 'صندوق' },
  { key: 'material_sales', path: '/material_sales', label: 'فروش مواد' },
  { key: 'customers', path: '/customers', label: 'شهروندان' },
  { key: 'areas', path: '/areas', label: 'مناطق و خانه‌ها' },
  { key: 'employees', path: '/employees', label: 'کارمندان' },
  { key: 'trucks', path: '/trucks', label: 'موترها' },
  { key: 'collection_schedules', path: '/collection_schedules', label: 'برنامه جمع‌آوری' },
  { key: 'recycling_records', path: '/recycling_records', label: 'بازیافت' },
  { key: 'complaints', path: '/complaints', label: 'شکایت‌ها' },
  { key: 'users', path: '/users', label: 'کاربران' },
  { key: 'settings', path: '/settings', label: 'تنظیمات' },
];

export const ALL_PERMISSION_KEYS = PAGE_PERMISSIONS.map((page) => page.key);

export function parsePermissions(value) {
  if (Array.isArray(value)) return value.filter((key) => ALL_PERMISSION_KEYS.includes(key));
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((key) => ALL_PERMISSION_KEYS.includes(key));
      }
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizePermissions(role, permissions) {
  if (role === 'admin') return [...ALL_PERMISSION_KEYS];
  const selected = parsePermissions(permissions);
  if (!selected.includes('dashboard')) selected.unshift('dashboard');
  return [...new Set(selected)];
}

export function canAccessPath(permissions, pathname) {
  if (!permissions?.length) return false;
  if (permissions.includes('settings') === false && pathname.startsWith('/settings')) return false;

  const match = PAGE_PERMISSIONS.find((page) => {
    if (page.path === '/') return pathname === '/';
    return pathname === page.path || pathname.startsWith(`${page.path}/`);
  });

  if (!match) return true;
  return permissions.includes(match.key);
}
