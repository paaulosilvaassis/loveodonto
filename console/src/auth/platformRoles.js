/**
 * Slugs de `platform_roles.role_slug` (ver console/supabase/seeds/001_platform_console_seed.sql).
 * Usados em permissões da Console; valores sempre em minúsculas para bater com normalizeRole().
 */
export const PLATFORM_ROLES = {
  OWNER: 'owner',
  SUPER_ADMIN: 'super_admin',
  SUPORTE: 'suporte',
  FINANCEIRO: 'financeiro',
  OPERACOES: 'operacoes',
  LEITURA: 'leitura',
};
