import { createContext } from 'react';

/** Contexto isolado para o Fast Refresh do Vite (não misturar com Provider + hook no mesmo arquivo). */
export const PlatformAuthContext = createContext(null);
