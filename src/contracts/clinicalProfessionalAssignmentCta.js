/**
 * CTA de atribuição do profissional clínico — ação do atendimento, nunca RH.
 */

export const ASSIGN_CLINICAL_PROFESSIONAL_ACTION = 'assign_clinical_professional';
export const ASSIGN_CLINICAL_PROFESSIONAL_MODE = 'assign_clinical_modal';
export const ASSIGN_CLINICAL_PROFESSIONAL_LABEL = 'Definir profissional clínico';

const ASSIGNMENT_TAGS = new Set([
  'professional:missing-clinical',
  'professional:missing',
  '#dentistaNomeCompleto',
  '#profissional_nome',
]);

function itemBlob(item) {
  return `${item?.tag || ''} ${item?.label || ''} ${item?.field || ''}`;
}

function hrefOf(destination) {
  return String(destination?.href || destination?.ctaHref || '');
}

export function isMissingClinicalProfessionalItem(item) {
  if (!item) return false;
  if (ASSIGNMENT_TAGS.has(item.tag)) return true;
  return /defina o profissional cl[ií]nico/i.test(itemBlob(item));
}

export function isClinicalProfessionalAssignmentCta(card) {
  const destination = card?.destination || card || {};
  if (destination.action === ASSIGN_CLINICAL_PROFESSIONAL_ACTION) return true;
  if (destination.mode === ASSIGN_CLINICAL_PROFESSIONAL_MODE) return true;
  if (destination.ctaLabel === ASSIGN_CLINICAL_PROFESSIONAL_LABEL) return true;
  if (destination.ctaAction === ASSIGN_CLINICAL_PROFESSIONAL_ACTION) return true;
  const items = card?.items || [];
  if ((card?.group === 'profissional' || destination.key === 'profissional')
    && items.some(isMissingClinicalProfessionalItem)) {
    return true;
  }
  return false;
}

/**
 * Kill-switch: este blocker nunca pode navegar para Dados da Equipe.
 * CRO de dentista já atribuído continua podendo ir ao cadastro.
 */
export function shouldOpenClinicalProfessionalSelector(card, { hasAssignedClinicalProfessional = false } = {}) {
  if (isClinicalProfessionalAssignmentCta(card)) return true;
  const href = hrefOf(card?.destination);
  if (!href.includes('/admin/colaboradores')) return false;
  if (card?.group !== 'profissional') return false;
  if (hasAssignedClinicalProfessional) return false;
  return true;
}

export function isForbiddenAdminRedirectForClinicalAssignment(href) {
  return String(href || '').includes('/admin/colaboradores');
}
