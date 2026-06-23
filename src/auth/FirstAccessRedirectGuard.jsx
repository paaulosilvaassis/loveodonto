import { useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  auditFirstAccess,
  resolvePrimeiroAcessoRedirect,
} from '../utils/firstAccessSession.js';

/**
 * SPA fallback: preserva hash/code ao cair em /login ou outra rota pública.
 */
export default function FirstAccessRedirectGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    const target = resolvePrimeiroAcessoRedirect(location);
    if (!target) return;
    auditFirstAccess('redirecionamento executado', {
      from: `${location.pathname}${location.search}${location.hash}`,
      to: target,
      reason: 'FirstAccessRedirectGuard',
    });
    navigate(target, { replace: true });
  }, [location, navigate]);

  return null;
}
