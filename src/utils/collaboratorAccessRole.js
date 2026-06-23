import { isAgendaProfessional } from '../constants/collaboratorRhCatalog.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    category.includes('recepção')
    || category.includes('recepcao')
    || category.includes('atendimento')
    || roleCargo.includes('recepcionista')
  ) {
    return 'atendimento';
  }

  return 'atendimento';
}
