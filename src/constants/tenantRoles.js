/**
 * Roles de membership (vínculo usuário–tenant).
 * MASTER: único por tenant, gerencia clínica e usuários.
 */

export const ROLE_MASTER = 'master';

export const MEMBERSHIP_ROLES = [
  ROLE_MASTER,
  'administrativo',
  'comercial',
  'financeiro',
  'atendimento',
  'dentista',
  'gerente',
  'recepcao',
  'profissional',
];

export const MEMBERSHIP_ROLE_LABELS = {
  master: 'Administrador (MASTER)',
  administrativo: 'Administrativo',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  atendimento: 'Atendimento',
  dentista: 'Dentista',
  gerente: 'Gerente',
  recepcao: 'Recepção',
  profissional: 'Profissional',
};

/** Roles que podem ser atribuídos em convites (não MASTER). */
export const INVITABLE_ROLES = MEMBERSHIP_ROLES.filter((r) => r !== ROLE_MASTER);

export const INVITATION_EXPIRY_DAYS = 7;

export const ACCESS_AUDIT_EVENTS = {
  INVITE_CREATED: 'INVITE_CREATED',
  INVITE_ACCEPTED: 'INVITE_ACCEPTED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  ACCESS_TOGGLED: 'ACCESS_TOGGLED',
  USER_REMOVED: 'USER_REMOVED',
  TENANT_UPDATED: 'TENANT_UPDATED',
};
