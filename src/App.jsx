import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { RequireAuth } from './auth/RequireAuth.jsx';
import RequireTenantAccess from './auth/RequireTenantAccess.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ActivatePage from './pages/ActivatePage.jsx';
import PrimeiroAcessoPage from './pages/PrimeiroAcessoPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ConvitePage from './pages/ConvitePage.jsx';
import ContractSignPublicPage from './pages/contratos/ContractSignPublicPage.jsx';
import { PlatformAuthProvider } from './auth/PlatformAuthContext.jsx';
import RequirePlatformAuth from './auth/RequirePlatformAuth.jsx';
import { TenantProvider } from './tenant/TenantContext.jsx';
import PlatformLayout from './platform/PlatformLayout.jsx';
import PlatformLoginPage from './pages/platform/PlatformLoginPage.jsx';
import PlatformDashboardPage from './pages/platform/PlatformDashboardPage.jsx';
import PlatformTenantsPage from './pages/platform/PlatformTenantsPage.jsx';
import PlatformTenantDetailPage from './pages/platform/PlatformTenantDetailPage.jsx';
import PlatformPlansPage from './pages/platform/PlatformPlansPage.jsx';
import PlatformBillingPage from './pages/platform/PlatformBillingPage.jsx';
import PlatformProvidersPage from './pages/platform/PlatformProvidersPage.jsx';
import PlatformTeamPage from './pages/platform/PlatformTeamPage.jsx';

const ProtectedApp = lazy(() => import('./ProtectedApp.jsx'));
const StabilityHealthPage = lazy(() => import('./pages/StabilityHealthPage.jsx'));
const DevMigratePage = lazy(() => import('./pages/DevMigratePage.jsx'));
const DevResetPage = lazy(() => import('./pages/DevResetPage.jsx'));
const DevSeedPage = lazy(() => import('./pages/DevSeedPage.jsx'));

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <BrowserRouter>
          <PlatformAuthProvider>
            <Routes>
            {import.meta.env?.DEV ? (
              <>
                <Route path="/dev/migrate-db" element={<Suspense fallback={null}><DevMigratePage /></Suspense>} />
                <Route path="/dev/reset-db" element={<Suspense fallback={null}><DevResetPage /></Suspense>} />
                <Route path="/dev/seed-db" element={<Suspense fallback={null}><DevSeedPage /></Suspense>} />
              </>
            ) : null}
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Navigate to="/gestao/dashboard" replace />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/activate" element={<ActivatePage />} />
            <Route path="/primeiro-acesso" element={<PrimeiroAcessoPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/convite" element={<ConvitePage />} />
            <Route path="/assinatura/:token" element={<ContractSignPublicPage />} />
            <Route path="/platform/login" element={<PlatformLoginPage />} />
            <Route path="/platform" element={<RequirePlatformAuth><PlatformLayout /></RequirePlatformAuth>}>
              <Route index element={<Navigate to="/platform/dashboard" replace />} />
              <Route path="dashboard" element={<PlatformDashboardPage />} />
              <Route path="tenants" element={<PlatformTenantsPage />} />
              <Route path="tenants/:id" element={<PlatformTenantDetailPage />} />
              <Route path="plans" element={<PlatformPlansPage />} />
              <Route path="billing" element={<PlatformBillingPage />} />
              <Route path="providers" element={<PlatformProvidersPage />} />
              <Route path="team" element={<PlatformTeamPage />} />
            </Route>
            <Route
              path="/stability/health"
              element={(
                <RequireAuth>
                  <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>Carregando…</div>}>
                    <StabilityHealthPage />
                  </Suspense>
                </RequireAuth>
              )}
            />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <RequireTenantAccess>
                    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>Carregando…</div>}>
                      <ProtectedApp />
                    </Suspense>
                  </RequireTenantAccess>
                </RequireAuth>
              }
            />
            </Routes>
          </PlatformAuthProvider>
        </BrowserRouter>
      </TenantProvider>
    </AuthProvider>
  );
}
