import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, assertRequired, normalizeText } from './helpers.js';
import { logAction } from './logService.js';

export const listMaterials = () => loadDb().materials;
export const listMovements = () => loadDb().stockMovements;
export const listSuppliers = () => loadDb().suppliers;
export const listPurchases = () => loadDb().purchases;

export const createMaterial = (user, payload) => {
  requirePermission(user, 'inventory:write');
  const material = {
    id: createId('mat'),
    name: normalizeText(payload.name),
    unit: normalizeText(payload.unit || 'un'),
    minQty: Number(payload.minQty || 0),
    currentQty: Number(payload.currentQty || 0),
  };
  assertRequired(material.name, 'Nome do material é obrigatório.');
  withDb((db) => {
    db.materials.push(material);
    return db;
  });
  logAction('inventory:material:create', { materialId: material.id, userId: user.id });
  return material;
};

export const registerMovement = (user, payload) => {
  requirePermission(user, 'inventory:write');
  const movement = {
    id: createId('mov'),
    materialId: normalizeText(payload.materialId),
    type: normalizeText(payload.type),
    qty: Number(payload.qty || 0),
    date: normalizeText(payload.date) || new Date().toISOString().slice(0, 10),
    reason: normalizeText(payload.reason),
  };
  assertRequired(movement.materialId, 'Material é obrigatório.');
  assertRequired(movement.type, 'Tipo é obrigatório.');
  assertRequired(movement.qty, 'Quantidade é obrigatória.');

  withDb((db) => {
    const material = db.materials.find((item) => item.id === movement.materialId);
    if (!material) throw new Error('Material não encontrado.');
    material.currentQty += movement.type === 'entrada' ? movement.qty : -movement.qty;
    db.stockMovements.push(movement);
    return db;
  });
  logAction('inventory:movement:create', { movementId: movement.id, userId: user.id });
  return movement;
};

export const createSupplier = (user, payload) => {
  requirePermission(user, 'inventory:write');
  const supplier = {
    id: createId('sup'),
    name: normalizeText(payload.name),
    contact: normalizeText(payload.contact),
  };
  assertRequired(supplier.name, 'Nome do fornecedor é obrigatório.');
  withDb((db) => {
    db.suppliers.push(supplier);
    return db;
  });
  logAction('inventory:supplier:create', { supplierId: supplier.id, userId: user.id });
  return supplier;
};

export const createPurchase = (user, payload) => {
  requirePermission(user, 'inventory:write');
  const purchase = {
    id: createId('purchase'),
    supplierId: normalizeText(payload.supplierId),
    date: normalizeText(payload.date) || new Date().toISOString().slice(0, 10),
    items: payload.items || [],
    total: Number(payload.total || 0),
  };
  assertRequired(purchase.supplierId, 'Fornecedor é obrigatório.');

  withDb((db) => {
    db.purchases.push(purchase);
    return db;
  });
  logAction('inventory:purchase:create', { purchaseId: purchase.id, userId: user.id });
  return purchase;
};

export const getConsumptionReport = ({ startDate, endDate }) => {
  const movements = listMovements().filter((movement) => {
    if (movement.type !== 'saida') return false;
    if (startDate && movement.date < startDate) return false;
    if (endDate && movement.date > endDate) return false;
    return true;
  });
  return movements;
};
