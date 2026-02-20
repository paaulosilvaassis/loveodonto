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

Promise.all([
  import('./App.jsx'),
  import('./components/ErrorBoundary.jsx'),
  import('./db/index.js').then((m) => (m.seedAdminCredentialsIfEmpty && m.seedAdminCredentialsIfEmpty()) || Promise.resolve()).catch(() => {})
]).then(([appMod, ebMod]) => {
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
}).catch(showLoadError);
