/**
 * Mapeamento central para exibição da Timeline do CRM em PT-BR.
 * Apenas transformação de exibição; não altera dados persistidos.
 */

// ─── Tipos de evento (event.type) → label humano ─────────────────────────────
export const EVENT_TYPE_LABELS = {
  status_change: 'Mudança de etapa',
  contact: 'Contato',
  message_sent: 'Mensagem enviada',
  note_added: 'Observação adicionada',
  budget_created: 'Orçamento criado',
  budget_presented: 'Orçamento apresentado',
  budget_approved: 'Orçamento aprovado',
  budget_rejected: 'Orçamento recusado',
  budget_em_analise_followup: 'Orçamento em análise → Follow-up criado',
  appointment_scheduled: 'Agendamento realizado',
  appointment_done: 'Consulta realizada',
  converted_to_patient: 'Convertido em paciente',
  tag_added: 'Tag adicionada',
  follow_up_created: 'Follow-up criado',
  meta_lead_received: 'Lead recebido do Instagram/Facebook',
  meta_lead_updated: 'Lead atualizado via Meta',
  task_created: 'Tarefa criada',
  task_done: 'Tarefa concluída',
};

// ─── Slugs de status/etapa → label humano ────────────────────────────────────
export const STATUS_LABELS = {
  novo_lead: 'Novo lead',
  contato_realizado: 'Contato realizado',
  avaliacao_agendada: 'Avaliação agendada',
  avaliacao_realizada: 'Avaliação realizada',
  orcamento_apresentado: 'Orçamento apresentado',
  em_negociacao: 'Em negociação',
  aprovado: 'Aprovado',
  em_tratamento: 'Em tratamento',
  finalizado: 'Finalizado',
  perdido: 'Perdido',
  desmarcou: 'Desmarcou',
  falta: 'Falta',
  reagendar: 'Reagendar',
};

/** Badge de categoria por tipo de evento */
export const EVENT_TYPE_BADGE = {
  status_change: 'CRM',
  contact: 'CRM',
  message_sent: 'WhatsApp',
  budget_created: 'Orçamento',
  budget_presented: 'Orçamento',
  budget_approved: 'Orçamento',
  budget_rejected: 'Orçamento',
  budget_em_analise_followup: 'Orçamento',
  appointment_scheduled: 'Agenda',
  appointment_done: 'Agenda',
  converted_to_patient: 'CRM',
  tag_added: 'CRM',
  follow_up_created: 'CRM',
  meta_lead_received: 'Meta',
  meta_lead_updated: 'Meta',
  note_added: 'CRM',
  task_created: 'Tarefa',
  task_done: 'Tarefa',
};

/** Tom visual (classe CSS) por tipo: neutral | success | warning | danger | meta */
export const EVENT_TYPE_TONE = {
  status_change: 'neutral',
  contact: 'neutral',
  message_sent: 'success',
  budget_created: 'neutral',
  budget_presented: 'neutral',
  budget_approved: 'success',
  budget_rejected: 'danger',
  budget_em_analise_followup: 'neutral',
  appointment_scheduled: 'success',
  appointment_done: 'success',
  converted_to_patient: 'success',
  tag_added: 'neutral',
  follow_up_created: 'neutral',
  meta_lead_received: 'meta',
  meta_lead_updated: 'meta',
  note_added: 'neutral',
  task_created: 'neutral',
  task_done: 'success',
};

/**
 * Converte slug de status para label. Fallback: capitalizar e trocar _ por espaço.
 */
export function getStatusLabel(slug) {
  if (!slug) return '';
  const s = String(slug).trim();
  return STATUS_LABELS[s] || s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Converte type de evento para label. Fallback: "Evento" ou slug formatado.
 */
export function getEventTypeLabel(type) {
  if (!type) return 'Evento';
  const t = String(type).trim();
  return EVENT_TYPE_LABELS[t] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Formata data/hora para exibição PT-BR: "04/02/2026 • 15:14"
 */
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatTimelineDate(isoString) {
  if (!isoString) return '';
  try {
    const parts = dateTimeFormat.formatToParts(new Date(isoString));
    const day = parts.find((p) => p.type === 'day').value;
    const month = parts.find((p) => p.type === 'month').value;
    const year = parts.find((p) => p.type === 'year').value;
    const hour = parts.find((p) => p.type === 'hour').value;
    const minute = parts.find((p) => p.type === 'minute').value;
    return `${day}/${month}/${year} • ${hour}:${minute}`;
  } catch {
    return '';
  }
}

/**
 * Retorna { title, description, badge, tone } para um evento da timeline.
 * description: subtítulo (ex.: "De: X → Para: Y" para status_change).
 */
export function formatTimelineEvent(event) {
  const type = event?.type || '';
  const data = event?.data || {};
  const title = getEventTypeLabel(type);
  const badge = EVENT_TYPE_BADGE[type] || 'CRM';
  const tone = EVENT_TYPE_TONE[type] || 'neutral';

  let description = '';
  if (type === 'status_change' && (data.fromStage != null || data.toStage != null)) {
    const from = getStatusLabel(data.fromStage) || '—';
    const to = getStatusLabel(data.toStage) || '—';
    description = `De: ${from} → Para: ${to}`;
  } else if (data.description) {
    description = data.description;
  } else if (data.messagePreview) {
    description = data.messagePreview.length > 100 ? `${data.messagePreview.slice(0, 100)}…` : data.messagePreview;
  } else if (type === 'follow_up_created' && data.dueAt) {
    try {
      description = `Para: ${formatTimelineDate(data.dueAt)}`;
    } catch {
      description = '';
    }
  } else if (type === 'converted_to_patient' && data.patientId) {
    description = 'Lead vinculado ao prontuário do paciente.';
  } else if ((type === 'task_created' || type === 'task_done') && data.description) {
    description = data.description;
  } else if (type === 'task_created' && data.taskTitle && data.dueAt) {
    try {
      const d = new Date(data.dueAt);
      description = `${data.taskTitle} • Venc.: ${d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`;
    } catch {
      description = data.taskTitle;
    }
  } else if (type === 'task_done' && data.taskTitle) {
    description = data.taskTitle;
  } else if (type === 'budget_rejected' && data.deniedReason) {
    description = `Motivo: ${data.deniedReason}`;
  } else if ((type === 'budget_approved' || type === 'budget_em_analise_followup') && data.description) {
    description = data.description;
  }

  return { title, description, badge, tone };
}
