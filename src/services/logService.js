import { withDb } from '../db/index.js';

export const logAction = (action, data = {}) => {
  const entry = {
    id: `log-${crypto.randomUUID()}`,
    action,
    data,
    timestamp: new Date().toISOString(),
  };
  withDb((db) => {
    db.auditLogs.unshift(entry);
    if (db.auditLogs.length > 5000) {
      db.auditLogs = db.auditLogs.slice(0, 5000);
    }
    return db;
  });
  return entry;
};
