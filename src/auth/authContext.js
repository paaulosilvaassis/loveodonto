import { createContext } from 'react';

const AUTH_CONTEXT_KEY = '__appgestaoodonto_auth_context__';

function getAuthContext() {
  if (typeof globalThis === 'undefined') return createContext(null);
  if (!globalThis[AUTH_CONTEXT_KEY]) {
    globalThis[AUTH_CONTEXT_KEY] = createContext(null);
  }
  return globalThis[AUTH_CONTEXT_KEY];
}

/** Exportado para `useAuth.js` e `AuthContext.jsx` (Provider) — mesmo singleton. */
export const AuthContext = getAuthContext();
