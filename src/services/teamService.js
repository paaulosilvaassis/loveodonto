import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, assertRequired, normalizeText } from './helpers.js';
import { logAction } from './logService.js';

export const listUsers = () => loadDb().users;
export const listRooms = () => loadDb().rooms;
export const listTimeEntries = () => loadDb().timeEntries;

export const createUser = (user, payload) => {
  requirePermission(user, 'team:write');
  const nextUser = {
    id: createId('user'),
    name: normalizeText(payload.name),
    role: normalizeText(payload.role),
    active: payload.active !== false,
    commissionRate: Number(payload.commissionRate || 0.05),
  };
  assertRequired(nextUser.name, 'Nome é obrigatório.');
  assertRequired(nextUser.role, 'Cargo é obrigatório.');
  withDb((db) => {
    db.users.push(nextUser);
    return db;
  });
  logAction('team:user:create', { createdUserId: nextUser.id, userId: user.id });
  return nextUser;
};

export const createRoom = (user, payload) => {
  requirePermission(user, 'team:write');
  const room = {
    id: createId('room'),
    name: normalizeText(payload.name),
    active: payload.active !== false,
  };
  assertRequired(room.name, 'Nome da sala é obrigatório.');
  withDb((db) => {
    db.rooms.push(room);
    return db;
  });
  logAction('team:room:create', { roomId: room.id, userId: user.id });
  return room;
};

export const registerTimeEntry = (user, payload) => {
  requirePermission(user, 'team:write');
  const entry = {
    id: createId('time'),
    userId: normalizeText(payload.userId),
    date: normalizeText(payload.date) || new Date().toISOString().slice(0, 10),
    startTime: normalizeText(payload.startTime),
    endTime: normalizeText(payload.endTime),
    note: normalizeText(payload.note),
  };
  assertRequired(entry.userId, 'Usuário é obrigatório.');
  assertRequired(entry.startTime, 'Entrada é obrigatória.');
  assertRequired(entry.endTime, 'Saída é obrigatória.');
  withDb((db) => {
    db.timeEntries.push(entry);
    return db;
  });
  logAction('team:time:create', { entryId: entry.id, userId: user.id });
  return entry;
};
