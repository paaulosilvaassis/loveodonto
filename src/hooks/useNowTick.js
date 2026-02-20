import { useState, useEffect } from 'react';

/**
 * Hook que atualiza a cada intervalo especificado
 * Útil para contadores em tempo real sem causar re-renders pesados
 * @param {number} intervalMs - Intervalo em milissegundos (padrão: 1000)
 * @returns {Date} - Data atual atualizada
 */
export const useNowTick = (intervalMs = 1000) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, intervalMs);

    return () => clearInterval(interval);
  }, [intervalMs]);

  return now;
};
