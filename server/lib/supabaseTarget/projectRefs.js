/**
 * SPF.1A.1 — fonte única e versionada dos project refs Supabase do Love Odonto.
 * Refs são identificadores públicos (aparecem na URL do projeto); nunca colocar chaves aqui.
 * Novos módulos devem importar daqui em vez de declarar constantes próprias.
 */

export const STAGING_PROJECT_REF = 'tckdjyunwmdpqmewrwvt';
export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';

/** Pseudo-ref para Supabase local (localhost / docker). */
export const LOCAL_PROJECT_REF = 'local';

export const TARGET_ENVS = Object.freeze(['local', 'staging', 'production']);

export const SUPABASE_PROJECT_REFS = Object.freeze({
  local: LOCAL_PROJECT_REF,
  staging: STAGING_PROJECT_REF,
  production: PRODUCTION_PROJECT_REF,
});

export function expectedRefForTargetEnv(targetEnv) {
  return SUPABASE_PROJECT_REFS[targetEnv] || null;
}

export function classifyProjectRef(ref) {
  if (ref === PRODUCTION_PROJECT_REF) return 'PRODUCTION';
  if (ref === STAGING_PROJECT_REF) return 'STAGING';
  if (ref === LOCAL_PROJECT_REF) return 'LOCAL';
  return ref ? 'UNKNOWN' : 'ABSENT';
}
