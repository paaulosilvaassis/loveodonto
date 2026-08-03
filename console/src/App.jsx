import { Routes, Route, Navigate } from 'react-router-dom';
import RequirePlatformAuth from './auth/RequirePlatformAuth.jsx';
import RequirePlatformPermission from './auth/RequirePlatformPermission.jsx';
import ConsoleShellLayout from './layout/ConsoleShellLayout.jsx';
import ConsoleLoginPage from './pages/ConsoleLoginPage.jsx';
import ConsoleDashboardPage from './pages/ConsoleDashboardPage.jsx';
import ConsoleTenantsPage from './pages/ConsoleTenantsPage.jsx';
import ConsoleTenantDetailPage from './pages/ConsoleTenantDetailPage.jsx';
import ConsolePlansPage from './pages/ConsolePlansPage.jsx';
import ConsoleBillingPage from './pages/ConsoleBillingPage.jsx';
import ConsoleBillingTenantDetailPage from './pages/ConsoleBillingTenantDetailPage.jsx';
import ConsoleConnectivityPage from './pages/ConsoleConnectivityPage.jsx';
import ConsoleSupportPage from './pages/ConsoleSupportPage.jsx';
import ConsoleLogsErrorsPage from './pages/ConsoleLogsErrorsPage.jsx';
import ConsoleFeatureFlagsPage from './pages/ConsoleFeatureFlagsPage.jsx';
import ConsoleAuditPage from './pages/ConsoleAuditPage.jsx';
import ConsoleSettingsPage from './pages/ConsoleSettingsPage.jsx';

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
        <Route path="billing" element={<ConsoleBillingPage />} />
        <Route path="billing/:tenantId" element={<ConsoleBillingTenantDetailPage />} />
        <Route path="subscriptions" element={<ConsolePlansPage />} />
        <Route path="connectivities" element={<ConsoleConnectivityPage />} />
        <Route path="support" element={<ConsoleSupportPage />} />
        <Route path="logs-errors" element={<ConsoleLogsErrorsPage />} />
        <Route
          path="feature-flags"
          element={(
            <RequirePlatformPermission permission="flags:write">
              <ConsoleFeatureFlagsPage />
            </RequirePlatformPermission>
          )}
        />
        <Route path="audit" element={<ConsoleAuditPage />} />
        <Route path="settings" element={<ConsoleSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
