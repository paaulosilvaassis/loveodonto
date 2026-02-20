/**
 * Formata horas decimais em leitura humana.
 * @param {number} hours - Horas em decimal (ex: 52.6)
 * @returns {string} Ex: "6 min", "52h 36m", "5d 19h"
 */
export function formatDurationHours(hours) {
  if (hours == null || (typeof hours === 'number' && Number.isNaN(hours))) return '—';
  const h = Number(hours);
  if (h < 0) return '—';
  if (h < 1) {
    const min = Math.round(h * 60);
    return min === 0 ? '0 min' : `${min} min`;
  }
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const remainder = h % 24;
    const hrs = Math.round(remainder);
    return hrs > 0 ? `${d}d ${hrs}h` : `${d}d`;
  }
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  return min > 0 ? `${hrs}h ${min}m` : `${hrs}h`;
}
