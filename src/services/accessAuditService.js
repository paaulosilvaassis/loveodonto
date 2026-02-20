import { withDb } from '../db/index.js';
import { createId } from './helpers.js';

export const logAccess = ({ entityType, entityId, action, userId, metadata = {}, deviceInfo = {} }) => {
  const entry = {
    id: createId('audit'),
    entity_type: entityType,
    entity_id: entityId,
    action,
    user_id: userId || '',
    metadata,
    device_info: deviceInfo,
    at: new Date().toISOString(),
  };
  withDb((db) => {
    db.accessAuditLogs = db.accessAuditLogs || [];
    db.accessAuditLogs.unshift(entry);
    if (db.accessAuditLogs.length > 5000) {
      db.accessAuditLogs = db.accessAuditLogs.slice(0, 5000);
    }
    return db;
  });
  return entry;
};

export const listAccessLogs = (entityType, entityId) => {
  return withDb((db) => {
    db.accessAuditLogs = db.accessAuditLogs || [];
    return db.accessAuditLogs.filter((item) => item.entity_type === entityType && item.entity_id === entityId);
  });
};
