/**
 * CRM Clínico — Repository (storage adapter)
 * Acesso ao banco (loadDb/withDb). Uma única camada de persistência para o CRM.
 */

import { loadDb, withDb } from '../../db/index.js';

export function getDb() {
  return loadDb();
}

export function mutateDb(mutator) {
  return withDb(mutator);
}

// ─── Leitura (sem mutar) ──────────────────────────────────────────────────────

export function findAllLeads() {
  return getDb().crmLeads || [];
}

export function findLeadById(leadId) {
  return (getDb().crmLeads || []).find((l) => l.id === leadId) || null;
}

export function findLeadsByStage(stageKey) {
  return (getDb().crmLeads || []).filter((l) => l.stageKey === stageKey);
}

export function findAllPipelineStages() {
  const stages = getDb().crmPipelineStages || [];
  return [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function findAllLeadEvents(leadId) {
  const events = (getDb().crmLeadEvents || []).filter((e) => e.leadId === leadId);
  return [...events].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function findAllMessageLogs(leadId) {
  const logs = (getDb().crmMessageLogs || []).filter((m) => m.leadId === leadId);
  return [...logs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function findAllFollowUps(filters = {}) {
  let list = getDb().crmFollowUps || [];
  if (filters.leadId) list = list.filter((f) => f.leadId === filters.leadId);
  if (filters.pending === true) list = list.filter((f) => !f.doneAt);
  return [...list].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}

export function findAllBudgetLinks(leadId) {
  return (getDb().crmBudgetLinks || []).filter((b) => b.leadId === leadId);
}

export function findAllAutomations() {
  return getDb().crmAutomations || [];
}
