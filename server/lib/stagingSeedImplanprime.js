import { randomUUID } from 'node:crypto';

/** @readonly */
export const STAGING_PROJECT_REF = 'tckdjyunwmdpqmewrwvt';
/** @readonly */
export const PROD_PROJECT_REF = 'uoepkwhqztmsjnzirpev';
/** @readonly UUID produção Implanprime — nunca reutilizar em staging. */
export const PROD_IMPLANPRIME_TENANT_ID = 'b2f95268-101c-42cb-8a8e-8d3681aa7dfa';
/** @readonly */
export const DEFAULT_STAGING_PASSWORD = 'StagingTest2026!';
/** @readonly */
export const STAGING_CLINIC_CODE = 'implanprime-staging';

/** Legacy IDs do export RH (IndexedDB) — usados no backfill. */
export const EXPORT_LEGACY_IDS = {
  paulo: 'col-saas-362c17b7-0abd-4d3f-8669-69c8f409b341',
  juliana: 'col-f93e5dbf-bcc0-4c6d-8f94-f90f7f46bb70',
  renata: 'col-6b85c4cb-345a-4cff-9636-f07ac1aea9f2',
  melissa: 'col-c52fd5ce-4bc9-4c7d-a4c0-298525d401a3',
};

/** collaborator_id text divergente em tenant_users (cenário prod Juliana/Renata). */
export const DIVERGENT_TENANT_USER_COLLABORATOR_IDS = {
  juliana: 'col-saas-c9a3cc7e-d4ab-4934-aad3-56cb0558f1d6',
  renata: 'col-c92cf731-eddc-4b0d-9e40-8c77a7a2ee06',
};

/** E-mails anonimizados por legacy_id do export RH (para backfill staging). */
export const STAGING_RH_EMAIL_BY_LEGACY_ID = {
  [EXPORT_LEGACY_IDS.paulo]: 'paulo+staging@implanprime.test',
  [EXPORT_LEGACY_IDS.melissa]: 'melissa+staging@implanprime.test',
  [EXPORT_LEGACY_IDS.juliana]: 'juliana+staging@implanprime.test',
  [EXPORT_LEGACY_IDS.renata]: 'renata+staging@implanprime.test',
};

export function remapRhExportForStaging(exportRows, targetTenantId) {
  assertNewStagingTenantId(targetTenantId);
  return (exportRows || []).map((row) => {
    const legacyId = String(row?.id || row?.legacy_id || '').trim();
    const stagingEmail = STAGING_RH_EMAIL_BY_LEGACY_ID[legacyId];
    return {
      ...row,
      tenant_id: targetTenantId,
      tenantId: targetTenantId,
      ...(stagingEmail ? { email: stagingEmail } : {}),
    };
  });
}

const USER_SPECS = [
  {
    key: 'paulo',
    email: 'paulo+staging@implanprime.test',
    full_name: 'Paulo Staging Assis',
    role_slug: 'master',
    status: 'active',
    has_system_access: true,
    invitation_status: 'accepted',
    collaborator_id: EXPORT_LEGACY_IDS.paulo,
    collaborator_id_alignment: 'export_legacy',
    cpf: '00000000191',
    phone: '31990000001',
  },
  {
    key: 'melissa',
    email: 'melissa+staging@implanprime.test',
    full_name: 'Melissa Staging Guimarães',
    role_slug: 'gerente',
    status: 'inactive',
    has_system_access: false,
    invitation_status: 'accepted',
    collaborator_id: EXPORT_LEGACY_IDS.melissa,
    collaborator_id_alignment: 'export_legacy',
  },
  {
    key: 'juliana',
    email: 'juliana+staging@implanprime.test',
    full_name: 'Juliana Staging Freire',
    role_slug: 'administrativo',
    status: 'active',
    has_system_access: true,
    invitation_status: 'accepted',
    collaborator_id: DIVERGENT_TENANT_USER_COLLABORATOR_IDS.juliana,
    collaborator_id_alignment: 'divergent_from_export',
    export_legacy_id: EXPORT_LEGACY_IDS.juliana,
  },
  {
    key: 'renata',
    email: 'renata+staging@implanprime.test',
    full_name: 'Renata Staging Assis',
    role_slug: 'administrativo',
    status: 'active',
    has_system_access: true,
    invitation_status: 'accepted',
    collaborator_id: DIVERGENT_TENANT_USER_COLLABORATOR_IDS.renata,
    collaborator_id_alignment: 'divergent_from_export',
    export_legacy_id: EXPORT_LEGACY_IDS.renata,
  },
];

const INVITE_SPECS = [
  { userKey: 'melissa', profile_role: 'atendimento', export_collaborator_id: EXPORT_LEGACY_IDS.melissa },
  { userKey: 'juliana', profile_role: 'profissional', export_collaborator_id: EXPORT_LEGACY_IDS.juliana },
  { userKey: 'renata', profile_role: 'gerente', export_collaborator_id: EXPORT_LEGACY_IDS.renata },
];

const DEFAULT_MODULES = ['MARKETING', 'FINANCEIRO', 'AGENDA', 'PRONTUARIO'];

export function extractProjectRef(supabaseUrl) {
  const raw = String(supabaseUrl || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

export function assertStagingSupabaseUrl(supabaseUrl) {
  const ref = extractProjectRef(supabaseUrl);
  const raw = String(supabaseUrl || '').trim().toLowerCase();
  if (!ref && !raw) {
    throw new Error('ABORT: SUPABASE URL ausente. Defina STAGING_SUPABASE_URL ou --supabase-url.');
  }
  if (raw.includes(PROD_PROJECT_REF) || ref === PROD_PROJECT_REF) {
    throw new Error(
      `ABORT: URL aponta para PRODUÇÃO (${PROD_PROJECT_REF}). `
      + 'Use STAGING_SUPABASE_URL / STAGING_SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  if (ref !== STAGING_PROJECT_REF && !raw.includes(STAGING_PROJECT_REF)) {
    throw new Error(
      `ABORT: URL deve apontar para staging (${STAGING_PROJECT_REF}). Recebido: ${ref || raw}`,
    );
  }
  return ref;
}

export function assertNewStagingTenantId(tenantId) {
  const id = String(tenantId || '').trim().toLowerCase();
  if (!id) throw new Error('tenant_id inválido.');
  if (id === PROD_IMPLANPRIME_TENANT_ID.toLowerCase()) {
    throw new Error(
      `ABORT: tenant_id coincide com produção Implanprime (${PROD_IMPLANPRIME_TENANT_ID}). Gere UUID novo.`,
    );
  }
}

export function buildSeedPlan({ tenantId = randomUUID() } = {}) {
  assertNewStagingTenantId(tenantId);

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const tenant = {
    id: tenantId,
    clinic_code: STAGING_CLINIC_CODE,
    legal_name: 'Implanprime Staging LTDA',
    trade_name: 'Implanprime Odontologia (Staging)',
    cnpj: '99999999000199',
    status: 'active',
    billing_status: 'ok',
    plan_code: 'Scale',
    owner_name: 'Paulo Staging Assis',
    owner_email: 'paulo+staging@implanprime.test',
    city: 'Cidade Teste',
    state: 'MG',
  };

  const clinic_profile = {
    tenant_id: tenantId,
    name: 'Implanprime Odontologia (Staging)',
    fantasy_name: 'Implanprime Odontologia (Staging)',
    legal_name: 'Implanprime Staging LTDA',
    logo_url: null,
    email: 'contato+staging@implanprime.test',
    phone: '3139000000',
    cnpj: '99999999000199',
    status: 'active',
  };

  const users = USER_SPECS.map((spec) => ({
    ...spec,
    tenant_id: tenantId,
    collaborator_uuid: null,
    has_custom_permissions: false,
    is_active: spec.status === 'active',
    role: spec.role_slug,
  }));

  const invitations = INVITE_SPECS.map((inv) => ({
    tenant_id: tenantId,
    email: USER_SPECS.find((u) => u.key === inv.userKey)?.email,
    collaborator_id: inv.export_collaborator_id,
    profile_role: inv.profile_role,
    status: 'accepted',
    expires_at: expiresAt,
    sent_at: now,
    accepted_at: now,
    user_key: inv.userKey,
  }));

  const identities = users.map((u) => ({
    tenant_id: tenantId,
    collaborator_id: u.collaborator_id,
    email: u.email,
    full_name: u.full_name,
    role_slug: u.role_slug,
    status: u.has_system_access ? 'active' : 'disabled',
    invitation_status: u.invitation_status === 'accepted' ? 'accepted' : 'none',
    password_status: 'created',
    identity_health: 'healthy',
    metadata: {
      seed_source: 'staging-seed-implanprime',
      collaborator_id_alignment: u.collaborator_id_alignment,
      export_legacy_id: u.export_legacy_id || u.collaborator_id,
    },
    user_key: u.key,
  }));

  const identity_events = [
    {
      tenant_id: tenantId,
      action: 'staging_seed.tenant_planned',
      result: 'success',
      message: 'Plano de seed Implanprime staging (anonimizado).',
      origin: 'staging-seed-implanprime',
      details: { clinic_code: STAGING_CLINIC_CODE },
    },
    ...users.map((u) => ({
      tenant_id: tenantId,
      action: 'staging_seed.user_planned',
      result: 'success',
      message: `Usuário de teste ${u.key}`,
      origin: 'staging-seed-implanprime',
      details: {
        email: u.email,
        collaborator_id_alignment: u.collaborator_id_alignment,
        collaborator_id: u.collaborator_id,
      },
    })),
  ];

  const tenant_modules = DEFAULT_MODULES.map((module_key) => ({
    tenant_id: tenantId,
    module_key,
    enabled: true,
  }));

  const tenant_limits = {
    tenant_id: tenantId,
    limits_json: { users: 20, patients: 5000, collaborators: 50 },
  };

  return {
    generated_at: now,
    tenant_id: tenantId,
    prod_tenant_id_blocked: PROD_IMPLANPRIME_TENANT_ID,
    staging_project_ref: STAGING_PROJECT_REF,
    password_note: 'Senha padrão configurada no apply (não persistida neste relatório).',
    scenario: {
      aligned_collaborator_id: ['paulo', 'melissa'],
      divergent_collaborator_id: ['juliana', 'renata'],
      export_legacy_ids: EXPORT_LEGACY_IDS,
    },
    summary: {
      auth_users: users.length,
      tenant_users: users.length,
      invitations: invitations.length,
      identities: identities.length,
      identity_events: identity_events.length,
      tenant_modules: tenant_modules.length,
      tenant_limits: 1,
    },
    tenant,
    clinic_profile,
    users,
    invitations,
    identities,
    identity_events,
    tenant_modules,
    tenant_limits,
  };
}

export async function validateStagingEnvironment(supabase) {
  const errors = [];

  const { error: tuError } = await supabase
    .from('tenant_users')
    .select('collaborator_uuid')
    .limit(1);
  if (tuError && !tuError.message.includes('does not exist')) {
    errors.push({ check: 'tenant_users', message: tuError.message });
  }

  const { error: collabError } = await supabase
    .from('collaborators')
    .select('id')
    .limit(1);
  if (collabError) {
    errors.push({ check: 'collaborators_table', message: collabError.message });
  }

  const { error: permError } = await supabase
    .from('permission_catalog')
    .select('id')
    .limit(1);
  if (permError) {
    errors.push({ check: 'permission_catalog', message: permError.message });
  }

  return {
    ok: errors.length === 0,
    errors,
    migration_018_detected: false,
    notes: [
      'Migration 018 (FK NOT NULL) não é aplicada neste seed.',
      'collaborator_uuid permanece nullable até backfill + gate 018.',
    ],
  };
}

export async function validatePreApply(supabase, plan) {
  const issues = [];

  assertNewStagingTenantId(plan.tenant_id);

  const { data: existingTenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, clinic_code')
    .or(`id.eq.${plan.tenant_id},clinic_code.eq.${STAGING_CLINIC_CODE}`)
    .maybeSingle();
  if (tenantError) issues.push({ scope: 'tenants', message: tenantError.message });
  else if (existingTenant?.id) {
    issues.push({
      scope: 'tenants',
      message: `Tenant já existe (id=${existingTenant.id}, clinic_code=${existingTenant.clinic_code}).`,
    });
  }

  const { data: authList, error: authError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  });
  if (authError) {
    issues.push({ scope: 'auth', message: authError.message });
  } else {
    const existingEmails = new Set(
      (authList?.users || []).map((u) => String(u.email || '').toLowerCase()),
    );
    for (const user of plan.users) {
      if (existingEmails.has(user.email.toLowerCase())) {
        issues.push({
          scope: 'auth',
          message: `Auth user já existe para ${user.email}. Remova ou altere o e-mail de staging.`,
        });
      }
    }
  }

  const envCheck = await validateStagingEnvironment(supabase);

  return {
    ok: issues.length === 0 && envCheck.ok,
    issues,
    environment: envCheck,
  };
}

async function createAuthUser(supabase, { email, password, fullName, tenantId, roleSlug }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { tenant_id: tenantId, role: roleSlug },
  });
  if (error) throw error;
  if (!data?.user?.id) throw new Error(`Falha ao criar auth user: ${email}`);
  return data.user;
}

async function safeDeleteAuthUsers(supabase, authUserIds) {
  for (const id of authUserIds) {
    await supabase.auth.admin.deleteUser(id).catch(() => {});
  }
}

export async function applySeedPlan(supabase, plan, { password = DEFAULT_STAGING_PASSWORD } = {}) {
  assertNewStagingTenantId(plan.tenant_id);
  const createdAuthIds = [];
  const result = {
    tenant_id: plan.tenant_id,
    auth_users: [],
    tenant_users: [],
    invitations: [],
    identities: [],
    identity_events: [],
    clinic_profile: null,
    tenant_modules: [],
    tenant_limits: null,
  };

  try {
    const { data: tenantRow, error: tenantError } = await supabase
      .from('tenants')
      .insert(plan.tenant)
      .select('id, clinic_code, trade_name')
      .single();
    if (tenantError) throw tenantError;
    result.tenant = tenantRow;

    for (const userSpec of plan.users) {
      const authUser = await createAuthUser(supabase, {
        email: userSpec.email,
        password,
        fullName: userSpec.full_name,
        tenantId: plan.tenant_id,
        roleSlug: userSpec.role_slug,
      });
      createdAuthIds.push(authUser.id);

      const tuPayload = {
        tenant_id: plan.tenant_id,
        user_id: authUser.id,
        email: userSpec.email,
        full_name: userSpec.full_name,
        role: userSpec.role_slug,
        role_slug: userSpec.role_slug,
        status: userSpec.status,
        is_active: userSpec.is_active,
        has_system_access: userSpec.has_system_access,
        invitation_status: userSpec.invitation_status,
        collaborator_id: userSpec.collaborator_id,
        collaborator_uuid: null,
        has_custom_permissions: false,
      };

      const { data: tuRow, error: tuError } = await supabase
        .from('tenant_users')
        .insert(tuPayload)
        .select('id, email, collaborator_id, collaborator_uuid, role_slug, has_system_access')
        .single();
      if (tuError) throw tuError;

      result.auth_users.push({ key: userSpec.key, auth_user_id: authUser.id, email: userSpec.email });
      result.tenant_users.push({ key: userSpec.key, ...tuRow });
    }

    const tuByKey = Object.fromEntries(
      plan.users.map((u, i) => [u.key, result.tenant_users[i]]),
    );
    const pauloAuthId = result.auth_users.find((u) => u.key === 'paulo')?.auth_user_id;

    const { data: clinicRow, error: clinicError } = await supabase
      .from('clinic_profiles')
      .insert(plan.clinic_profile)
      .select('id, tenant_id, name')
      .single();
    if (clinicError) throw clinicError;
    result.clinic_profile = clinicRow;

    for (const invSpec of plan.invitations) {
      const tu = tuByKey[invSpec.user_key];
      const { data: invRow, error: invError } = await supabase
        .from('invitations')
        .insert({
          tenant_id: plan.tenant_id,
          tenant_user_id: tu?.id || null,
          collaborator_id: invSpec.collaborator_id,
          email: invSpec.email,
          profile_role: invSpec.profile_role,
          status: invSpec.status,
          expires_at: invSpec.expires_at,
          sent_at: invSpec.sent_at,
          accepted_at: invSpec.accepted_at,
          created_by: pauloAuthId || null,
        })
        .select('id, email, collaborator_id, status')
        .single();
      if (invError) throw invError;
      result.invitations.push({ user_key: invSpec.user_key, ...invRow });
    }

    for (const idSpec of plan.identities) {
      const tu = tuByKey[idSpec.user_key];
      const auth = result.auth_users.find((u) => u.key === idSpec.user_key);
      const { data: idRow, error: idError } = await supabase
        .from('identities')
        .insert({
          tenant_id: plan.tenant_id,
          collaborator_id: idSpec.collaborator_id,
          tenant_user_id: tu?.id || null,
          auth_user_id: auth?.auth_user_id || null,
          email: idSpec.email,
          full_name: idSpec.full_name,
          role_slug: idSpec.role_slug,
          status: idSpec.status,
          invitation_status: idSpec.invitation_status,
          password_status: idSpec.password_status,
          identity_health: idSpec.identity_health,
          metadata: idSpec.metadata,
        })
        .select('id, email, collaborator_id, status')
        .single();
      if (idError) throw idError;
      result.identities.push({ user_key: idSpec.user_key, ...idRow });
    }

    const idByKey = Object.fromEntries(
      plan.identities.map((spec, index) => [spec.user_key, result.identities[index]]),
    );

    for (const evSpec of plan.identity_events) {
      const details = { ...(evSpec.details || {}) };
      const { data: evRow, error: evError } = await supabase
        .from('identity_events')
        .insert({
          tenant_id: plan.tenant_id,
          identity_id: null,
          action: evSpec.action,
          result: evSpec.result,
          message: evSpec.message,
          origin: evSpec.origin,
          details,
          actor_email: 'staging-seed@implanprime.test',
        })
        .select('id, action')
        .single();
      if (evError) throw evError;
      result.identity_events.push(evRow);
    }

    // Evento pós-apply por usuário (vínculo mínimo)
    for (const user of result.auth_users) {
      const identity = idByKey[user.key];
      const tu = tuByKey[user.key];
      await supabase.from('identity_events').insert({
        tenant_id: plan.tenant_id,
        identity_id: identity?.id || null,
        tenant_user_id: tu?.id || null,
        auth_user_id: user.auth_user_id,
        action: 'staging_seed.user_applied',
        result: 'success',
        message: `Seed aplicado: ${user.email}`,
        origin: 'staging-seed-implanprime',
        details: { user_key: user.key },
        actor_email: 'staging-seed@implanprime.test',
      });
    }

    if (plan.tenant_modules?.length) {
      const { data: modRows, error: modError } = await supabase
        .from('tenant_modules')
        .insert(plan.tenant_modules)
        .select('module_key, enabled');
      if (!modError && modRows) result.tenant_modules = modRows;
    }

    const { data: limitsRow, error: limitsError } = await supabase
      .from('tenant_limits')
      .insert(plan.tenant_limits)
      .select('tenant_id, limits_json')
      .maybeSingle();
    if (!limitsError && limitsRow) result.tenant_limits = limitsRow;

    return result;
  } catch (err) {
    await safeDeleteAuthUsers(supabase, createdAuthIds);
    if (plan.tenant_id) {
      try {
        await supabase.from('tenants').delete().eq('id', plan.tenant_id);
      } catch {
        /* best-effort rollback */
      }
    }
    throw err;
  }
}

export function buildApplyCommand(tenantId) {
  return `node scripts/staging-seed-implanprime.mjs --tenant-id ${tenantId} --apply --confirm APPLY`;
}

export function buildRhBackfillDryRunCommand(tenantId, rhExport = './collaborators-export.json') {
  return `node scripts/rh-backfill-to-supabase.mjs --tenant-id ${tenantId} --rh-export ${rhExport}`;
}
