import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
// #region agent log
fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'main.jsx:after imports',message:'main.jsx module evaluated',data:{},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
// #endregion

const rootElement = document.getElementById('root');

function showLoadError(err) {
  if (!rootElement) return;
  const msg = err?.message || String(err);
  const stack = err?.stack || '';
  rootElement.innerHTML = '<pre style="padding:1rem;background:#1a1a1a;color:#ef4444;white-space:pre-wrap;margin:0;font:14px monospace">ERRO AO CARREGAR APP:\n\n' + msg + '\n\n' + stack + '</pre>';
}

(async () => {
  const dbMod = await import('./db/index.js');
  await dbMod.initDb();
  setTimeout(() => {
    (dbMod.seedAdminCredentialsIfEmpty?.() ?? Promise.resolve()).catch(() => {});
  }, 0);
  const [appMod, ebMod] = await Promise.all([import('./App.jsx'), import('./components/ErrorBoundary.jsx')]);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'main.jsx:after App import',message:'App and ErrorBoundary loaded',data:{},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
  const App = appMod.default;
  const ErrorBoundary = ebMod.default;
  if (rootElement) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'main.jsx:before createRoot',message:'about to createRoot',data:{},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    );
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'main.jsx:after render',message:'React render called',data:{},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
  }
})().catch((err) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'main.jsx:catch',message:'main async error',data:{message:String(err?.message||err),stack:String(err?.stack||'')},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  showLoadError(err);
});
