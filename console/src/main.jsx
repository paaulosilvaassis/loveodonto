import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { PlatformAuthProvider } from './auth/PlatformAuthContext.jsx';
import './index.css';

/** Chaves legadas do modo mock/local — removidas para não confundir após upgrade. */
const LEGACY_CONSOLE_STORAGE_KEYS = ['loveodonto_platform_console_state_v1', 'platform_console_local_auth'];
try {
  LEGACY_CONSOLE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
} catch {
  /* ignore */
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PlatformAuthProvider>
        <App />
      </PlatformAuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
