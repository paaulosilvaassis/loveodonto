import { createContext } from 'react';

/** Instância única; Provider em `TenantContext.jsx`, hook em `useTenant.js` (Fast Refresh). */
export const TenantContext = createContext(null);
