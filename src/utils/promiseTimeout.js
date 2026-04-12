/**
 * Executa uma Promise com limite de tempo; cancela o timer se a Promise resolver antes.
 */
export function raceWithTimeout(promise, ms, timeoutErrorMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutErrorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}
