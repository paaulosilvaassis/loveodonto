import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');

function showLoadError(err) {
  if (!rootElement) return;
  const msg = err?.message || String(err);
  const stack = err?.stack || '';
  rootElement.innerHTML = '<pre style="padding:1rem;background:#1a1a1a;color:#ef4444;white-space:pre-wrap;margin:0;font:14px monospace">ERRO AO CARREGAR APP:\n\n' + msg + '\n\n' + stack + '</pre>';
}

(async () => {
  const dbMod = await import('./db/index.js');
  await (dbMod.seedAdminCredentialsIfEmpty?.() ?? Promise.resolve()).catch(() => {});
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
})().catch(showLoadError);
