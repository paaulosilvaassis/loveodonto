/**
 * Contrato explícito de flags RH para Vitest — Phase 5.1.
 * Independente de .env.local / staging / produção.
 */
export const RH_TEST_FLAG_CONTRACT = {
  VITE_RH_SUPABASE_READ: 'false',
  VITE_RH_SUPABASE_READ_PRIMARY: 'false',
  VITE_RH_SUPABASE_WRITE: 'false',
  VITE_RH_SHADOW_READ: 'false',
  VITE_RH_COMPARE_IDB_SUPABASE: 'false',
  VITE_RH_IDB_WRITE_DISABLED: 'false',
};

/** Contrato Phase 5.5 — Clinic Profile read cutover (defaults OFF). */
export const CLINIC_PROFILE_TEST_FLAG_CONTRACT = {
  VITE_CLINIC_PROFILE_READ: 'false',
  VITE_CLINIC_PROFILE_READ_PRIMARY: 'false',
  VITE_CLINIC_PROFILE_WRITE: 'false',
  VITE_CLINIC_PROFILE_SHADOW_READ: 'false',
  VITE_CLINIC_PROFILE_COMPARE_IDB_REMOTE: 'false',
};

/** Flags resolvidas para testes read-primary staging/dev. */
export const CLINIC_PROFILE_READ_PRIMARY_FLAGS_RESOLVED = {
  CLINIC_PROFILE_READ: true,
  CLINIC_PROFILE_READ_PRIMARY: true,
  CLINIC_PROFILE_WRITE: false,
  CLINIC_PROFILE_SHADOW_READ: false,
  CLINIC_PROFILE_COMPARE_IDB_REMOTE: false,
};

/** Contrato Phase 5.7 — Agenda repository foundation (defaults OFF). */
export const AGENDA_TEST_FLAG_CONTRACT = {
  VITE_AGENDA_READ: 'false',
  VITE_AGENDA_READ_PRIMARY: 'false',
  VITE_AGENDA_WRITE: 'false',
  VITE_AGENDA_SHADOW: 'false',
  VITE_AGENDA_COMPARE: 'false',
};

/** Flags resolvidas para testes read-primary (futuro Phase 5.8). */
export const AGENDA_READ_PRIMARY_FLAGS_RESOLVED = {
  AGENDA_READ: true,
  AGENDA_READ_PRIMARY: true,
  AGENDA_WRITE: false,
  AGENDA_SHADOW: false,
  AGENDA_COMPARE: false,
};

/** Flags resolvidas para testes write cutover staging/dev. */
export const AGENDA_WRITE_FLAGS_RESOLVED = {
  AGENDA_READ: true,
  AGENDA_READ_PRIMARY: false,
  AGENDA_WRITE: true,
  AGENDA_SHADOW: false,
  AGENDA_COMPARE: false,
};

/**
 * Contrato Phase 5.10 — soak staging/dev Agenda (NUNCA produção).
 * @see docs/reports/PHASE_5_10_AGENDA_WRITE_SOAK_VALIDATION.md
 */
export const AGENDA_STAGING_SOAK_FLAG_CONTRACT = {
  VITE_AGENDA_READ: 'true',
  VITE_AGENDA_READ_PRIMARY: 'true',
  VITE_AGENDA_WRITE: 'true',
  VITE_AGENDA_SHADOW: 'true',
  VITE_AGENDA_COMPARE: 'true',
};

/** Flags resolvidas equivalentes ao contrato soak Agenda (para overrides em testes). */
export const AGENDA_STAGING_SOAK_FLAGS_RESOLVED = {
  AGENDA_READ: true,
  AGENDA_READ_PRIMARY: true,
  AGENDA_WRITE: true,
  AGENDA_SHADOW: true,
  AGENDA_COMPARE: true,
};

/** Contrato Phase 5.11 — Financeiro repository foundation (defaults OFF). */
export const FINANCIAL_TEST_FLAG_CONTRACT = {
  VITE_FINANCIAL_READ: 'false',
  VITE_FINANCIAL_READ_PRIMARY: 'false',
  VITE_FINANCIAL_SHADOW: 'false',
  VITE_FINANCIAL_COMPARE: 'false',
  VITE_FINANCIAL_WRITE: 'false',
  VITE_FINANCIAL_WRITE_PRIMARY: 'false',
  VITE_FINANCIAL_DUAL_WRITE: 'false',
  VITE_FINANCIAL_WRITE_COMPARE: 'false',
};

/** Flags resolvidas para testes read-primary (futuro Phase 5.12). */
export const FINANCIAL_READ_PRIMARY_FLAGS_RESOLVED = {
  FINANCIAL_READ: true,
  FINANCIAL_READ_PRIMARY: true,
  FINANCIAL_SHADOW: false,
  FINANCIAL_COMPARE: false,
  FINANCIAL_WRITE: false,
  FINANCIAL_WRITE_PRIMARY: false,
  FINANCIAL_DUAL_WRITE: false,
  FINANCIAL_WRITE_COMPARE: false,
};

/** Flags resolvidas para testes dual-write cutover staging/dev (Phase 5.13). */
export const FINANCIAL_DUAL_WRITE_FLAGS_RESOLVED = {
  FINANCIAL_READ: true,
  FINANCIAL_READ_PRIMARY: false,
  FINANCIAL_SHADOW: false,
  FINANCIAL_COMPARE: false,
  FINANCIAL_WRITE: true,
  FINANCIAL_WRITE_PRIMARY: false,
  FINANCIAL_DUAL_WRITE: true,
  FINANCIAL_WRITE_COMPARE: false,
};

/** Flags resolvidas para primary write staging/dev (Phase 5.14). */
export const FINANCIAL_WRITE_PRIMARY_FLAGS_RESOLVED = {
  FINANCIAL_READ: true,
  FINANCIAL_READ_PRIMARY: false,
  FINANCIAL_SHADOW: false,
  FINANCIAL_COMPARE: false,
  FINANCIAL_WRITE: true,
  FINANCIAL_WRITE_PRIMARY: true,
  FINANCIAL_DUAL_WRITE: false,
  FINANCIAL_WRITE_COMPARE: false,
};

/**
 * Contrato Phase 5.14 — soak staging/dev Financeiro (NUNCA produção).
 */
export const FINANCIAL_STAGING_SOAK_FLAG_CONTRACT = {
  VITE_FINANCIAL_READ: 'true',
  VITE_FINANCIAL_READ_PRIMARY: 'true',
  VITE_FINANCIAL_SHADOW: 'true',
  VITE_FINANCIAL_COMPARE: 'true',
  VITE_FINANCIAL_WRITE: 'true',
  VITE_FINANCIAL_WRITE_PRIMARY: 'true',
  VITE_FINANCIAL_DUAL_WRITE: 'false',
  VITE_FINANCIAL_WRITE_COMPARE: 'true',
};

/** Flags resolvidas equivalentes ao contrato soak Financeiro. */
export const FINANCIAL_STAGING_SOAK_FLAGS_RESOLVED = {
  FINANCIAL_READ: true,
  FINANCIAL_READ_PRIMARY: true,
  FINANCIAL_SHADOW: true,
  FINANCIAL_COMPARE: true,
  FINANCIAL_WRITE: true,
  FINANCIAL_WRITE_PRIMARY: true,
  FINANCIAL_DUAL_WRITE: false,
  FINANCIAL_WRITE_COMPARE: true,
};

/** Flags resolvidas para testes write cutover staging/dev. */
export const CLINIC_PROFILE_WRITE_FLAGS_RESOLVED = {
  CLINIC_PROFILE_READ: true,
  CLINIC_PROFILE_READ_PRIMARY: false,
  CLINIC_PROFILE_WRITE: true,
  CLINIC_PROFILE_SHADOW_READ: false,
  CLINIC_PROFILE_COMPARE_IDB_REMOTE: false,
};

/**
 * Contrato Phase 5.4 — soak staging/dev (NUNCA produção).
 * @see docs/reports/PHASE_5_4_WRITE_SOAK_VALIDATION.md
 */
export const RH_STAGING_SOAK_FLAG_CONTRACT = {
  VITE_RH_SUPABASE_READ: 'true',
  VITE_RH_SUPABASE_READ_PRIMARY: 'true',
  VITE_RH_SUPABASE_WRITE: 'true',
  VITE_RH_SHADOW_READ: 'true',
  VITE_RH_COMPARE_IDB_SUPABASE: 'true',
  VITE_RH_IDB_WRITE_DISABLED: 'false',
};

/** Flags resolvidas equivalentes ao contrato staging soak (para overrides em testes). */
export const RH_STAGING_SOAK_FLAGS_RESOLVED = {
  RH_SUPABASE_READ: true,
  RH_SUPABASE_READ_PRIMARY: true,
  RH_SUPABASE_WRITE: true,
  RH_IDB_WRITE_DISABLED: false,
  RH_ALLOW_SYNTHETIC_STUBS: true,
  RH_SHADOW_READ: true,
  RH_COMPARE_IDB_SUPABASE: true,
};

/** Contrato Phase 6.1/6.3/6.6 — CRM/Kanban + Activity Stream (defaults OFF). */
export const CRM_TEST_FLAG_CONTRACT = {
  VITE_CRM_READ: 'false',
  VITE_CRM_READ_PRIMARY: 'false',
  VITE_CRM_SHADOW: 'false',
  VITE_CRM_COMPARE: 'false',
  VITE_CRM_WRITE: 'false',
  VITE_CRM_WRITE_PRIMARY: 'false',
  VITE_CRM_DUAL_WRITE: 'false',
  VITE_CRM_WRITE_COMPARE: 'false',
  VITE_CRM_ACTIVITY_READ: 'false',
  VITE_CRM_ACTIVITY_READ_PRIMARY: 'false',
  VITE_CRM_ACTIVITY_SHADOW: 'false',
  VITE_CRM_ACTIVITY_COMPARE: 'false',
  VITE_CRM_ACTIVITY_WRITE: 'false',
  VITE_CRM_ACTIVITY_WRITE_PRIMARY: 'false',
  VITE_CRM_ACTIVITY_DUAL_WRITE: 'false',
  VITE_CRM_ACTIVITY_WRITE_COMPARE: 'false',
};

/** Domain Events foundation (Phase 6.9 / 7.6) — defaults OFF no Vitest. */
export const DOMAIN_EVENT_TEST_FLAG_CONTRACT = {
  VITE_DOMAIN_EVENTS: 'false',
  VITE_DOMAIN_EVENT_AUDIT: 'false',
  VITE_DOMAIN_EVENT_OBSERVABILITY: 'false',
  VITE_DOMAIN_EVENT_CONSUMERS: 'false',
  VITE_DOMAIN_EVENT_CONSUMER_AUDIT: 'false',
  VITE_DOMAIN_EVENT_CONSUMER_RETRY: 'false',
  VITE_DOMAIN_EVENT_PROJECTION: 'false',
  VITE_DOMAIN_EVENT_ANALYTICS: 'false',
  VITE_LEAD_ANALYTICS_READ_MODEL: 'false',
  VITE_CQRS_READ_MODEL: 'false',
  VITE_APPOINTMENT_ANALYTICS_READ_MODEL: 'false',
  VITE_FINANCIAL_ANALYTICS_READ_MODEL: 'false',
  VITE_CQRS_READ_MODEL_SOAK: 'false',
  VITE_CQRS_READ_MODEL_CONSISTENCY: 'false',
};

/** Flags resolvidas para testes read-primary (Phase 6.2). */
export const CRM_READ_PRIMARY_FLAGS_RESOLVED = {
  CRM_READ: true,
  CRM_READ_PRIMARY: true,
  CRM_SHADOW: false,
  CRM_COMPARE: false,
  CRM_WRITE: false,
  CRM_WRITE_PRIMARY: false,
  CRM_DUAL_WRITE: false,
  CRM_WRITE_COMPARE: false,
};

/** Flags resolvidas para testes dual-write (Phase 6.3). */
export const CRM_DUAL_WRITE_FLAGS_RESOLVED = {
  CRM_READ: true,
  CRM_READ_PRIMARY: false,
  CRM_SHADOW: false,
  CRM_COMPARE: false,
  CRM_WRITE: true,
  CRM_WRITE_PRIMARY: false,
  CRM_DUAL_WRITE: true,
  CRM_WRITE_COMPARE: false,
};

/** Flags resolvidas para testes primary write (Phase 6.4). */
export const CRM_WRITE_PRIMARY_FLAGS_RESOLVED = {
  CRM_READ: true,
  CRM_READ_PRIMARY: false,
  CRM_SHADOW: false,
  CRM_COMPARE: false,
  CRM_WRITE: true,
  CRM_WRITE_PRIMARY: true,
  CRM_DUAL_WRITE: false,
  CRM_WRITE_COMPARE: false,
};

/** Flags resolvidas para testes Activity Stream Primary Read (Phase 6.6). */
export const CRM_ACTIVITY_READ_PRIMARY_FLAGS_RESOLVED = {
  CRM_ACTIVITY_READ: true,
  CRM_ACTIVITY_READ_PRIMARY: true,
  CRM_ACTIVITY_SHADOW: false,
  CRM_ACTIVITY_COMPARE: false,
  CRM_ACTIVITY_WRITE: false,
  CRM_ACTIVITY_WRITE_PRIMARY: false,
  CRM_ACTIVITY_DUAL_WRITE: false,
  CRM_ACTIVITY_WRITE_COMPARE: false,
};

/** Flags resolvidas para testes Activity Dual Write (Phase 6.7). */
export const CRM_ACTIVITY_DUAL_WRITE_FLAGS_RESOLVED = {
  CRM_ACTIVITY_READ: true,
  CRM_ACTIVITY_READ_PRIMARY: false,
  CRM_ACTIVITY_SHADOW: false,
  CRM_ACTIVITY_COMPARE: false,
  CRM_ACTIVITY_WRITE: true,
  CRM_ACTIVITY_WRITE_PRIMARY: false,
  CRM_ACTIVITY_DUAL_WRITE: true,
  CRM_ACTIVITY_WRITE_COMPARE: false,
};

/** Flags resolvidas para testes Activity Primary Write (Phase 6.8). */
export const CRM_ACTIVITY_WRITE_PRIMARY_FLAGS_RESOLVED = {
  CRM_ACTIVITY_READ: true,
  CRM_ACTIVITY_READ_PRIMARY: false,
  CRM_ACTIVITY_SHADOW: false,
  CRM_ACTIVITY_COMPARE: false,
  CRM_ACTIVITY_WRITE: true,
  CRM_ACTIVITY_WRITE_PRIMARY: true,
  CRM_ACTIVITY_DUAL_WRITE: false,
  CRM_ACTIVITY_WRITE_COMPARE: false,
};

/** Flags resolvidas para testes Domain Events (Phase 6.9+) — só em testes controlados. */
export const DOMAIN_EVENTS_FLAGS_RESOLVED = {
  DOMAIN_EVENTS: true,
  DOMAIN_EVENT_AUDIT: true,
  DOMAIN_EVENT_OBSERVABILITY: true,
  DOMAIN_EVENT_CONSUMERS: true,
  DOMAIN_EVENT_CONSUMER_AUDIT: true,
  DOMAIN_EVENT_CONSUMER_RETRY: true,
  DOMAIN_EVENT_PROJECTION: true,
  DOMAIN_EVENT_ANALYTICS: true,
  LEAD_ANALYTICS_READ_MODEL: true,
  CQRS_READ_MODEL: true,
  APPOINTMENT_ANALYTICS_READ_MODEL: true,
  FINANCIAL_ANALYTICS_READ_MODEL: true,
  CQRS_READ_MODEL_SOAK: true,
  CQRS_READ_MODEL_CONSISTENCY: true,
};

/** Desativa detecção SaaS em testes unitários (evita branch API sem token). */
export const SAAS_TEST_ISOLATION = {
  VITE_ACCESS_SAAS_ENABLED: '',
  VITE_SUPABASE_PLATFORM_URL: '',
  VITE_SUPABASE_PLATFORM_ANON_KEY: '',
};

/** Evita cliente Supabase real e chamadas de rede durante testes. */
export const SUPABASE_TEST_ISOLATION = {
  VITE_SUPABASE_APP_URL: '',
  VITE_SUPABASE_APP_ANON_KEY: '',
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
};

export function applyVitestIsolationContract(vi) {
  const contract = {
    ...RH_TEST_FLAG_CONTRACT,
    ...CLINIC_PROFILE_TEST_FLAG_CONTRACT,
    ...AGENDA_TEST_FLAG_CONTRACT,
    ...FINANCIAL_TEST_FLAG_CONTRACT,
    ...CRM_TEST_FLAG_CONTRACT,
    ...DOMAIN_EVENT_TEST_FLAG_CONTRACT,
    ...SAAS_TEST_ISOLATION,
    ...SUPABASE_TEST_ISOLATION,
  };
  for (const [key, value] of Object.entries(contract)) {
    vi.stubEnv(key, value);
  }
}
