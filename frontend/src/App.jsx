import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import IncomesPage from './pages/IncomesPage';
import HousesPage from './pages/HousesPage';
import EmployeesPage from './pages/EmployeesPage';
import CrudPage from './pages/CrudPage';
import Layout from './components/Layout';
import { moduleConfigs } from './moduleConfigs';
import { canAccessPath, getStoredUser, normalizePermissions } from './permissionsCatalog';

function ProtectedRoute({ children }) {
  return localStorage.getItem('waste_token') ? children : <Navigate to="/login" replace />;
}

function PermissionRoute({ children, pageKey }) {
  const location = useLocation();
  const user = getStoredUser();
  const permissions = normalizePermissions(user.role, user.permissions);

  if (pageKey && !permissions.includes(pageKey)) {
    return <Navigate to="/" replace />;
  }

  if (!canAccessPath(permissions, location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  const crudModules = Object.entries(moduleConfigs).filter(
    ([key]) => !['users', 'incomes', 'areas', 'payments', 'employees'].includes(key)
  );

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<PermissionRoute pageKey="dashboard"><DashboardPage /></PermissionRoute>} />
        <Route path="reports" element={<PermissionRoute pageKey="reports"><ReportsPage /></PermissionRoute>} />
        <Route path="users" element={<PermissionRoute pageKey="users"><UsersPage /></PermissionRoute>} />
        <Route path="settings" element={<PermissionRoute pageKey="settings"><SettingsPage /></PermissionRoute>} />
        <Route path="incomes" element={<PermissionRoute pageKey="incomes"><IncomesPage /></PermissionRoute>} />
        <Route path="employees" element={<PermissionRoute pageKey="employees"><EmployeesPage /></PermissionRoute>} />
        <Route path="areas" element={<PermissionRoute pageKey="areas"><HousesPage /></PermissionRoute>} />
        {crudModules.map(([key, config]) => (
          <Route
            key={key}
            path={key}
            element={(
              <PermissionRoute pageKey={key === 'material_sales' ? 'material_sales' : key}>
                <CrudPage config={config} />
              </PermissionRoute>
            )}
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
