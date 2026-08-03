import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Base path da Base de Preços conforme a rota atual (admin vs gestão comercial).
 * Evita navegar para URL errada ao abrir detalhe da tabela.
 */
export function usePriceBaseBasePath() {
  const { pathname } = useLocation();
  return useMemo(() => {
    if (pathname.startsWith('/admin/base-precos')) return '/admin/base-precos';
    return '/gestao-comercial/base-de-preco';
  }, [pathname]);
}
