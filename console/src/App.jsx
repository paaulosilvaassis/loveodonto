import { Routes, Route, Navigate } from 'react-router-dom';
import RequirePlatformAuth from './auth/RequirePlatformAuth.jsx';
import ConsoleShellLayout from './layout/ConsoleShellLayout.jsx';
import ConsoleLoginPage from './pages/ConsoleLoginPage.jsx';
import ConsoleDashboardPage from './pages/ConsoleDashboardPage.jsx';
import ConsoleTenantsPage from './pages/ConsoleTenantsPage.jsx';
import ConsoleTenantDetailPage from './pages/ConsoleTenantDetailPage.jsx';
import ConsolePlansPage from './pages/ConsolePlansPage.jsx';
import ConsoleBillingPage from './pages/ConsoleBillingPage.jsx';
import ConsoleProvidersPage from './pages/ConsoleProvidersPage.jsx';
import ConsoleTeamPage from './pages/ConsoleTeamPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<ConsoleLoginPage />} />
      <Route
        path="/"
        element={
          <RequirePlatformAuth>
            <ConsoleShellLayout />
          </RequirePlatformAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ConsoleDashboardPage />} />
        <Route path="tenants" element={<ConsoleTenantsPage />} />
        <Route path="tenants/:id" element={<ConsoleTenantDetailPage />} />
        <Route path="plans" element={<ConsolePlansPage />} />
        <Route path="billing" element={<ConsoleBillingPage />} />
        <Route path="providers" element={<ConsoleProvidersPage />} />
        <Route path="team" element={<ConsoleTeamPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
