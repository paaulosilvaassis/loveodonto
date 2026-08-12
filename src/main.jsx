import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { preflightLoginPageAuthStorage } from './auth/saasAuthStorage.js';
import './utils/firstAccessSession.js';
import './index.css';
import {
  assertStagingTestModeSafe,
  assertStagingExternalCommunicationDisabled,
} from './domain/contracts/staging/staging-browser-test-mode.ts';

preflightLoginPageAuthStorage();

const rootElement = document.getElementById('root');

function showLoadError(err) {
  if (!rootElement) return;
  const msg = err?.message || String(err);
  const stack = err?.stack || '';
  rootElement.innerHTML = '<pre style="padding:1rem;background:#1a1a1a;color:#ef4444;white-space:pre-wrap;margin:0;font:14px monospace">ERRO AO CARREGAR APP:\n\n' + msg + '\n\n' + stack + '</pre>';
}

function showStagingHardStop(reason) {
  if (!rootElement) return;
  rootElement.innerHTML = [
    '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;',
    'background:#1c1917;color:#fecaca;font:16px/1.5 ui-sans-serif,system-ui;padding:2rem;text-align:center">',
    '<div style="max-width:36rem">',
    '<div style="font-size:1.25rem;font-weight:800;color:#fbbf24;margin-bottom:0.75rem">STAGING_TEST_MODE — HARD STOP</div>',
    '<p style="margin:0 0 1rem">', String(reason || 'Production detectado').replace(/</g, '&lt;'), '</p>',
    '<p style="margin:0;opacity:0.85;font-size:0.9rem">Use <code>.env.staging.local</code> + <code>npm run staging:browser</code>. Nunca misture production.</p>',
    '</div></div>',
  ].join('');
}

(async () => {
  const env = import.meta.env || {};
  const guard = assertStagingTestModeSafe(env);
  if (!guard.ok) {
    showStagingHardStop(guard.blockedReason);
    throw new Error(guard.blockedReason || 'STAGING_TEST_MODE blocked');
  }
  const comm = assertStagingExternalCommunicationDisabled(env);
  if (!comm.ok) {
    showStagingHardStop(comm.blockedReason);
    throw new Error(comm.blockedReason || 'delivery blocked');
  }

  const dbMod = await import('./db/index.js');
  const { raceWithTimeout } = await import('./utils/async.js');
  await raceWithTimeout(
    dbMod.initDb(),
    120000,
    'Inicialização do banco local (IndexedDB) excedeu 2 minutos. Tente fechar outras abas do app e recarregar.',
  );
  if (guard.stagingTestMode) {
    try {
      const { ensureStagingFictionalCommercialBootstrap } = await import(
        './domain/contracts/staging/ensureStagingFictionalClinicContractPrereqs.js'
      );
      ensureStagingFictionalCommercialBootstrap();
    } catch {
      /* seed nunca bloqueia boot */
    }
  }
  setTimeout(() => {
    (dbMod.seedAdminCredentialsIfEmpty?.() ?? Promise.resolve()).catch(() => {});
  }, 0);
  const [appMod, ebMod] = await Promise.all([import('./App.jsx'), import('./components/ErrorBoundary.jsx')]);
  const App = appMod.default;
  const ErrorBoundary = ebMod.default;
  if (rootElement) {
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    );
  }
})().catch((err) => {
  showLoadError(err);
});
