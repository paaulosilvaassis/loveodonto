import { loadDb, withDb } from '../db/index.js';
import { getDelinquency } from './financeService.js';
import { logAction } from './logService.js';
import { createId } from './helpers.js';

export const listAutomationTasks = () => loadDb().automationTasks;

export const generateAutomationTasks = () => {
  const db = loadDb();
  const tasks = [];
  const delinquent = getDelinquency();
  delinquent.forEach((txn) => {
    tasks.push({
      id: createId('task'),
      type: 'cobranca',
      referenceId: txn.id,
      status: 'pendente',
      createdAt: new Date().toISOString(),
      description: `Cobrar parcela vencida (${txn.description || txn.id}).`,
    });
  });

  db.materials.forEach((material) => {
    if (material.currentQty <= material.minQty) {
      tasks.push({
        id: createId('task'),
        type: 'estoque',
        referenceId: material.id,
        status: 'pendente',
        createdAt: new Date().toISOString(),
        description: `Repor estoque de ${material.name}.`,
      });
    }
  });

  withDb((state) => {
    state.automationTasks = tasks;
    return state;
  });
  logAction('automation:generate', { total: tasks.length });
  return tasks;
};
