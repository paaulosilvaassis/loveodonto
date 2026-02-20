/**
 * CRM Clínico — Schemas/Types (domain)
 * Modelos de dados preparados para evolução. Não simplificar.
 */

// ─── Lead ───────────────────────────────────────────────────────────────────
/** @typedef {Object} Lead
 * @property {string} id
 * @property {string} name
 * @property {string} phone (apenas dígitos)
 * @property {string} source - LeadSource key
 * @property {string} interest
 * @property {string} notes
 * @property {string|null} assignedToUserId - UserOwner (responsável)
 * @property {string} stageKey - PipelineStage key
 * @property {string|null} patientId - se convertido
 * @property {string[]} tags - LeadTag (nomes das tags)
 * @property {string|null} lastContactAt - ISO
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} createdByUserId
 * @property {string|null} updatedByUserId
 */

// ─── PipelineStage ───────────────────────────────────────────────────────────
/** @typedef {Object} PipelineStage
 * @property {string} id
 * @property {string} key - ex: novo_lead, contato_realizado
 * @property {string} label
 * @property {number} order
 * @property {string} color - hex
 */

// ─── LeadStageHistory (timeline/auditoria) ────────────────────────────────────
/** @typedef {Object} LeadStageHistory
 * @property {string} id
 * @property {string} leadId
 * @property {string} type - status_change | contact | message_sent | budget_* | appointment_* | converted_to_patient | tag_added | follow_up_created
 * @property {string|null} userId
 * @property {Object} data - payload (fromStage, toStage, description, etc.)
 * @property {string} createdAt - ISO
 */

// ─── LeadTag ─────────────────────────────────────────────────────────────────
/** @typedef {string} LeadTag - tag é string (ex: "Quente", "Alto Ticket"); armazenado em lead.tags[] */

// ─── LeadTask (follow-up) ────────────────────────────────────────────────────
/** @typedef {Object} LeadTask
 * @property {string} id
 * @property {string} leadId
 * @property {string} dueAt - ISO
 * @property {string} type - retorno | orcamento_sem_resposta | etc.
 * @property {string} notes
 * @property {string|null} doneAt - ISO
 * @property {string} createdAt
 * @property {string|null} createdByUserId
 */

// ─── LeadMessageLog (WhatsApp / comunicação) ──────────────────────────────────
/** @typedef {Object} LeadMessageLog
 * @property {string} id
 * @property {string} leadId
 * @property {string} channel - "whatsapp"
 * @property {string|null} templateId
 * @property {string} messagePreview - resumo ou texto enviado
 * @property {string} createdAt - ISO
 * @property {string|null} createdBy - userId
 */

// ─── LeadSource ───────────────────────────────────────────────────────────────
/** @typedef {Object} LeadSource
 * @property {string} key - whatsapp | instagram | site | google_ads | indicacao | telefone | walk_in | manual
 * @property {string} label
 */

// ─── BudgetLink (vínculo com orçamentos) ─────────────────────────────────────
/** @typedef {Object} BudgetLink
 * @property {string} id
 * @property {string} clinicId
 * @property {string} leadId
 * @property {string} budgetId
 * @property {string} createdAt - ISO
 */

// ─── CrmBudget (orçamento do CRM) ───────────────────────────────────────────
/** @typedef {Object} CrmBudget
 * @property {string} id
 * @property {string} clinicId
 * @property {string} leadId
 * @property {string|null} patientId - preenchido quando aprovado
 * @property {string} title
 * @property {number} totalValue
 * @property {Array<{description:string, value:number}>} itemsJson
 * @property {string} status - em_analise | aprovado | negado
 * @property {string|null} deniedReason - obrigatório quando negado
 * @property {string|null} createdBy
 * @property {string} createdAt - ISO
 * @property {string} updatedAt - ISO
 * @property {string|null} approvedAt - ISO
 * @property {string|null} deniedAt - ISO
 */

// ─── UserOwner (responsável) ───────────────────────────────────────────────────
/** @typedef {Object} UserOwner
 * @property {string} id - userId (collaborator/user)
 * @property {string} name
 * @property {string} [role]
 */

// ─── AutomationRule ──────────────────────────────────────────────────────────
/** @typedef {Object} AutomationRule
 * @property {string} id
 * @property {string} name
 * @property {Object} trigger - ex: { type: "stage_change", stageKey: "orcamento_apresentado" }
 * @property {Object} [condition] - ex: { delayHours: 24 }
 * @property {Object} action - ex: { type: "send_message", templateId: "x" }
 * @property {boolean} active
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export const LEAD_SOURCE_KEYS = [
  'whatsapp', 'instagram', 'site', 'google_ads', 'indicacao', 'telefone', 'walk_in', 'manual',
];

export const CRM_EVENT_TYPES = [
  'status_change', 'contact', 'message_sent', 'budget_created', 'budget_presented',
  'budget_approved', 'budget_rejected', 'budget_em_analise_followup',
  'appointment_scheduled', 'appointment_done', 'converted_to_patient', 'tag_added', 'follow_up_created',
];

export const MESSAGE_CHANNEL = {
  WHATSAPP: 'whatsapp',
};
