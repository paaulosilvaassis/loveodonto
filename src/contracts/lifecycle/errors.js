/** Erros de lifecycle sem secrets. */

export function createLifecycleError(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  const keys = ['contractId', 'normalizedStatus', 'from', 'to', 'action'];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (extra[key] != null && extra[key] !== '') err[key] = extra[key];
  }
  return err;
}
