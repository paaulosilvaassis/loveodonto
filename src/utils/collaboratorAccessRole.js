import { isAgendaProfessional } from '../constants/collaboratorRhCatalog.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Perfis disponíveis na etapa de acesso ao sistema (slug → tenant_users.role). */
export const COLLABORATOR_PROFILE_ROLE_OPTIONS = [
  { value: 'master', label: 'Administrador (MASTER)' },
  { value: 'gerente', label: 'Gestor' },
  { value: 'dentista', label: 'Dentista' },
  { value: 'atendimento', label: 'Recepção / Atendimento' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'personalizado', label: 'Personalizado' },
];

export function isCollaboratorEmailValid(email) {
  const normalized = String(email || '').trim();
  if (!normalized) return false;
  return EMAIL_PATTERN.test(normalized);
}

/**
 * Mapeia categoria/cargo RH para o slug de perfil usado no tenant_users / convite.
 */
export function resolveCollaboratorProfileRole({ rhCategoria, cargo } = {}) {
  const category = String(rhCategoria || '').trim().toLowerCase();
  const roleCargo = String(cargo || '').trim().toLowerCase();

  if (
    category.includes('diretoria')
    || category.includes('gestão')
    || category.includes('gestao')
    || roleCargo.includes('gerente')
    || roleCargo.includes('gestor')
    || roleCargo.includes('administrador')
  ) {
    return 'gerente';
  }

  if (category.includes('financeiro') || roleCargo.includes('financeiro')) {
    return 'financeiro';
  }

  if (
    isAgendaProfessional({ rhCategoria, cargo })
    || category.includes('corpo clínico')
    || category.includes('corpo clinico')
    || category.includes('apoio clínico')
    || category.includes('apoio clinico')
  ) {
    return 'dentista';
  }

  if (
    category.includes('comercial')
    || roleCargo.includes('comercial')
    || roleCargo.includes('vendas')
  ) {
    return 'comercial';
  }

  if (
    category.includes('recepção')
    || category.includes('recepcao')
    || category.includes('atendimento')
    || roleCargo.includes('recepcionista')
  ) {
    return 'atendimento';
  }

  return 'atendimento';
}
