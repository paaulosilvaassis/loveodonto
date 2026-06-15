export const CONTRACT_EVENT_LABELS = {
  created: 'Contrato gerado',
  draft_saved: 'Contrato editado',
  finalized: 'Contrato finalizado',
  sent: 'Enviado para assinatura',
  viewed: 'Contrato visualizado pelo paciente',
  signed: 'Contrato assinado',
  canceled: 'Contrato cancelado',
  refused: 'Contrato recusado',
  pdf_exported: 'PDF do contrato exportado',
};

export function formatContractEventLabel(event) {
  if (!event) return null;
  const type = event.type || event.eventType || '';
  if (CONTRACT_EVENT_LABELS[type]) return CONTRACT_EVENT_LABELS[type];
  const action = String(event.action || '').toLowerCase();
  if (action.includes('sign')) return 'Contrato assinado';
  if (action.includes('send')) return 'Enviado para assinatura';
  if (action.includes('cancel')) return 'Contrato cancelado';
  if (action.includes('generat')) return 'Contrato gerado';
  return null;
}
