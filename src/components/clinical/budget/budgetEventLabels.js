/** Rótulos amigáveis para eventos do orçamento clínico. */
export const BUDGET_EVENT_LABELS = {
  budget_generated: 'Orçamento criado a partir do planejamento',
  budget_created: 'Orçamento criado',
  budget_updated: 'Orçamento salvo',
  budget_sent: 'Orçamento enviado ao paciente',
  budget_status_changed: 'Status do orçamento alterado',
  budget_approved: 'Orçamento aprovado',
  budget_rejected: 'Orçamento reprovado',
  budget_cancelled: 'Orçamento cancelado',
  budget_pdf_generated: 'PDF do orçamento gerado',
  budget_payment_presented: 'Condição apresentada ao paciente',
  budget_payment_chosen: 'Paciente escolheu forma de pagamento',
  appointment_finished: 'Atendimento encerrado',
  procedure_planned: null,
};

function humanizePaymentLabel(label) {
  if (!label) return '';
  const lower = label.toLowerCase();
  if (lower.includes('financiamento')) return 'financiamento';
  if (lower.includes('vista') || lower === 'à vista') return 'PIX / à vista';
  if (lower.includes('parcelado')) return 'parcelado pela clínica';
  if (lower.includes('cartão') || lower.includes('cartao')) return 'cartão';
  return lower;
}

export function formatBudgetEventLabel(event) {
  if (!event?.type) return null;
  const base = BUDGET_EVENT_LABELS[event.type];
  if (base === null) return null;

  const paymentLabel = event.data?.label || '';

  if (event.type === 'budget_payment_presented') {
    const name = humanizePaymentLabel(paymentLabel);
    return name
      ? `Condição ${name} apresentada ao paciente`
      : 'Condição apresentada ao paciente';
  }

  if (event.type === 'budget_payment_chosen') {
    const name = humanizePaymentLabel(paymentLabel);
    return name
      ? `Paciente escolheu ${name}`
      : 'Paciente escolheu forma de pagamento';
  }

  if (event.type === 'budget_status_changed' && event.data?.status) {
    return `Status alterado para ${event.data.status}`;
  }

  if (event.type === 'appointment_finished') {
    const reason = event.data?.reasonLabel || 'Atendimento encerrado';
    const notes = event.data?.notes ? ` — ${event.data.notes}` : '';
    return `${reason}${notes}`;
  }

  if (typeof base === 'string') return base;

  return null;
}

export function getPaymentOptionTitle(opt) {
  if (!opt) return '';
  const titles = {
    a_vista: 'À vista',
    parcelado_clinica: 'Parcelado pela clínica',
    cartao: 'Cartão',
    financiamento: 'Financiamento',
  };
  return titles[opt.type] || opt.label?.replace(/^Opção \d+ — /, '') || 'Condição';
}
