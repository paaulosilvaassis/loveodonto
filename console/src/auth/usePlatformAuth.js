import { useContext } from 'react';
import { PlatformAuthContext } from './platformAuthContext.js';

export function usePlatformAuth() {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error('usePlatformAuth deve ser usado dentro de PlatformAuthProvider.');
  return ctx;
}
