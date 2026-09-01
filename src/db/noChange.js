/**
 * Sentinel explícito: o mutator concluiu sem persistência.
 * Não inferir no-op por stringify do banco inteiro.
 */
export const DB_NO_CHANGE = Symbol.for('loveodonto.db.NO_CHANGE');

export function isDbNoChange(value) {
  return value === DB_NO_CHANGE;
}
