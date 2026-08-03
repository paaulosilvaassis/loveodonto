/** Rótulo seguro para item de sugestão de paciente (agenda, CRM, etc.). */
export function getPatientSuggestLabel(patient) {
  if (!patient || typeof patient !== 'object') return 'Paciente';
  return (
    patient.name
    || patient.full_name
    || patient.nickname
    || patient.social_name
    || 'Paciente'
  );
}

/** ID válido do paciente na sugestão, ou string vazia. */
export function getPatientSuggestId(patient) {
  const id = patient?.id;
  return id != null && String(id).trim() ? String(id) : '';
}

/** Impede fechar modal Radix ao interagir com dropdown em portal. */
export function shouldPreventModalDismiss(event, portalDataId) {
  const target = event?.target;
  if (!target || typeof target.closest !== 'function') return false;
  if (portalDataId && target.closest(`[data-id="${portalDataId}"]`)) return true;
  if (target.closest?.('.search-suggest-list')) return true;
  if (target.closest?.('.search-suggest-item')) return true;
  return false;
}

export function handleModalInteractOutside(event, portalDataId, alwaysPrevent = false) {
  if (alwaysPrevent || shouldPreventModalDismiss(event, portalDataId)) {
    event.preventDefault();
  }
}
