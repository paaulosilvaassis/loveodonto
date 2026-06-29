/**
 * Utilitários async compartilhados (timeouts, etc.).
 */

/**
 * Executa uma Promise com limite de tempo; cancela o timer se a Promise resolver antes.
 * @param {Promise<unknown>} promise
 * @param {number} timeoutMs
 * @param {string} timeoutMessage
 */
export function raceWithTimeout(promise, timeoutMs = 10000, timeoutMessage = 'Tempo limite excedido') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}
