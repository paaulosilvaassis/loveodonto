const AUDIT_ACTION_LABELS = {
  'tenant.provision.completed': 'Clínica provisionada',
  'tenant.access.resent': 'Acesso master reenviado',
  'tenant.blocked': 'Clínica bloqueada',
  'tenant.unblocked': 'Clínica desbloqueada',
  'tenant.module.enabled': 'Módulo habilitado',
  'tenant.module.disabled': 'Módulo desabilitado',
  'tenant.plan.changed': 'Plano alterado',
  'feature_flag.updated': 'Funcionalidade atualizada',
};

const AUDIT_TARGET_TYPE_LABELS = {
  tenant: 'Clínica',
  tenant_module: 'Módulo da clínica',
  tenant_subscription: 'Assinatura da clínica',
  feature_flag: 'Funcionalidade',
};

const AUDIT_ACTOR_ROLE_LABELS = {
  super_admin: 'Super admin',
  owner: 'Proprietário',
  support: 'Suporte',
  finance: 'Financeiro',
  leitura: 'Somente leitura',
  system: 'Sistema',
};

const METADATA_SKIP_KEYS = new Set(['actor_email', 'actor_admin_id']);

function normalizeMeta(metadata) {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) return metadata;
  return {};
}

function shortId(value) {
  const id = String(value || '').trim();
  if (!id) return '—';
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

export function toFriendlyAuditAction(action) {
  const key = String(action || '').trim();
  if (!key) return '—';
  if (AUDIT_ACTION_LABELS[key]) return AUDIT_ACTION_LABELS[key];
  return key
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .join(' · ');
}

export function toFriendlyAuditTargetType(targetType) {
  const normalized = String(targetType || '').trim().toLowerCase();
  if (!normalized) return '—';
  return AUDIT_TARGET_TYPE_LABELS[normalized] || targetType;
}

export function toFriendlyAuditActorRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (!normalized) return '—';
  return AUDIT_ACTOR_ROLE_LABELS[normalized] || role;
}

export function formatAuditTargetLabel({ targetType, targetId, metadata }) {
  const typeLabel = toFriendlyAuditTargetType(targetType);
  const meta = normalizeMeta(metadata);
  const name = meta.clinicName || meta.tradeName || meta.legalName || meta.name;
  if (name) return `${typeLabel}: ${name}`;
  return `${typeLabel}: ${shortId(targetId)}`;
}

export function formatAuditMetadata(metadata) {
  const meta = normalizeMeta(metadata);
  const parts = [];

  if (meta.clinicName) parts.push(`Clínica: ${meta.clinicName}`);
  if (meta.plan) parts.push(`Plano: ${meta.plan}`);
  if (meta.nextPlan) parts.push(`Novo plano: ${meta.nextPlan}`);
  if (meta.moduleName) parts.push(`Módulo: ${meta.moduleName}`);
  if (typeof meta.enabled === 'boolean') parts.push(meta.enabled ? 'Habilitado' : 'Desabilitado');
  if (meta.key) parts.push(`Chave: ${meta.key}`);
  if (Array.isArray(meta.modules) && meta.modules.length) {
    parts.push(`Módulos: ${meta.modules.join(', ')}`);
  }
  if (meta.responsible_email) parts.push(`Responsável: ${meta.responsible_email}`);

  if (parts.length) return parts.join(' · ');

  const fallback = Object.entries(meta)
    .filter(([key, value]) => !METADATA_SKIP_KEYS.has(key) && value != null && value !== '')
    .map(([key, value]) => {
      if (typeof value === 'object') return `${key}: ${JSON.stringify(value)}`;
      return `${key}: ${value}`;
    });

  return fallback.length ? fallback.join(' · ') : '—';
}

export function mapAuditLogForDisplay(log) {
  const meta = normalizeMeta(log.metadata);
  const actorRole = log.actor_role || log.actorRole || '';
  const actorEmail = meta.actor_email;
  let actor = actorEmail || '—';
  if (!actorEmail && String(actorRole).toLowerCase() === 'system') {
    actor = 'Sistema';
  } else if (!actorEmail && actorRole) {
    actor = toFriendlyAuditActorRole(actorRole);
  }

  const actionCode = log.action || '';
  const targetType = log.target_type || log.targetType;
  const targetId = log.target_id || log.targetId;

  return {
    id: log.id,
    actor,
    actorRole: toFriendlyAuditActorRole(actorRole),
    action: toFriendlyAuditAction(actionCode),
    actionCode,
    target: formatAuditTargetLabel({ targetType, targetId, metadata: meta }),
    targetType,
    targetId,
    metadata: formatAuditMetadata(log.metadata),
    createdAt: log.created_at || log.createdAt,
  };
}
