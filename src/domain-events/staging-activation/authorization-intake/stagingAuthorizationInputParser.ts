/**
 * @module domain-events/staging-activation/authorization-intake/stagingAuthorizationInputParser
 * Parser estrito — não preenche approved, não infere dados ausentes.
 */

import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../../certification/cqrsArchitectureVersion.js';
import { AUTHORIZATION_INPUT_SOURCES } from './stagingAuthorizationInputSchema.js';
import {
  sanitizeAttachmentMetadata,
  sanitizeAuthorizationText,
  scanObjectForSensitive,
} from './stagingAuthorizationInputSanitizer.js';
import type {
  StagingAuthorizationDiagCode,
  StagingAuthorizationInputEnvelope,
  StagingAuthorizationInputSource,
  StagingAuthorizationParseResult,
} from './stagingAuthorizationIntakeTypes.js';

let inputSeq = 0;

function normDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function shallowCloneSection(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = sanitizeAuthorizationText(v);
    else if (Array.isArray(v)) {
      out[k] = v.map((x) => (typeof x === 'string' ? sanitizeAuthorizationText(x) : x));
    } else out[k] = v;
  }
  return out;
}

export interface ParseAuthorizationInputResult {
  readonly parseResult: StagingAuthorizationParseResult;
  readonly envelope: StagingAuthorizationInputEnvelope | null;
  readonly diagnostics: readonly StagingAuthorizationDiagCode[];
  readonly errors: readonly string[];
}

/**
 * Faz parse de input explícito. Não lê e-mail/Drive/Supabase/staging.
 */
export function parseStagingAuthorizationInput(
  raw: unknown,
): ParseAuthorizationInputResult {
  inputSeq += 1;
  const diagnostics: StagingAuthorizationDiagCode[] = [];
  const errors: string[] = [];

  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Object.freeze({
      parseResult: 'invalid',
      envelope: null,
      diagnostics: Object.freeze([]),
      errors: Object.freeze(['input deve ser objeto']),
    });
  }

  const r = raw as Record<string, unknown>;
  if (!r.submittedBy || !String(r.submittedBy).trim()) {
    errors.push('submittedBy obrigatório');
  }

  const source = String(r.inputSource || '') as StagingAuthorizationInputSource;
  if (!(AUTHORIZATION_INPUT_SOURCES as readonly string[]).includes(source)) {
    errors.push('inputSource inválido');
  }

  const scan = scanObjectForSensitive(r);
  if (!scan.ok) {
    diagnostics.push(...scan.diagnostics);
    errors.push(`conteúdo sensível: ${scan.detail}`);
  }

  const attach = sanitizeAttachmentMetadata(r.attachmentsMetadata);
  if (!attach.ok) {
    diagnostics.push(...attach.diagnostics);
    errors.push('attachments metadata inválida');
  }

  // Campos perigosos top-level
  for (const k of Object.keys(r)) {
    if (/password|secret|token|serviceRole|privateKey/i.test(k)) {
      diagnostics.push('UNSUPPORTED_AUTHORIZATION_FIELD');
      errors.push(`campo não suportado: ${k}`);
    }
  }

  if (errors.length > 0) {
    return Object.freeze({
      parseResult: 'invalid',
      envelope: null,
      diagnostics: Object.freeze([...new Set(diagnostics)]),
      errors: Object.freeze(errors),
    });
  }

  const env = shallowCloneSection(r.environmentDeclaration);
  const human = shallowCloneSection(r.humanApproval);
  const tenants = shallowCloneSection(r.tenantSelection);
  const readonly = shallowCloneSection(r.readonlyAccessDeclaration);
  const stage1 = shallowCloneSection(r.stageOneAuthorization);
  const rollback = shallowCloneSection(r.rollbackAcknowledgement);
  const evidence = shallowCloneSection(r.evidenceAcknowledgement);

  let risks: Record<string, unknown>[] | null = null;
  if (Array.isArray(r.riskAcknowledgements)) {
    risks = r.riskAcknowledgements
      .map((x) => shallowCloneSection(x))
      .filter(Boolean) as Record<string, unknown>[];
  } else if (r.riskAcknowledgements == null) {
    risks = null;
  } else {
    return Object.freeze({
      parseResult: 'invalid',
      envelope: null,
      diagnostics: Object.freeze(diagnostics),
      errors: Object.freeze(['riskAcknowledgements deve ser array']),
    });
  }

  // Normalizar datas conhecidas sem inventar approved
  const dateFields = ['submittedAt', 'declaredAt', 'approvedAt', 'requestedAt', 'expiresAt', 'verifiedAt', 'reviewedAt', 'authorizedAt', 'selectedAt', 'acceptedAt'];
  for (const section of [env, human, tenants, readonly, stage1, rollback, evidence]) {
    if (!section) continue;
    for (const f of dateFields) {
      if (f in section && section[f] != null) {
        const n = normDate(section[f]);
        if (section[f] && !n) {
          return Object.freeze({
            parseResult: 'invalid',
            envelope: null,
            diagnostics: Object.freeze(diagnostics),
            errors: Object.freeze([`data inválida em ${f}`]),
          });
        }
        if (n) section[f] = n;
      }
    }
  }

  const hasAnySection = Boolean(
    env || human || tenants || readonly || stage1 || rollback || evidence || (risks && risks.length),
  );

  const envelope: StagingAuthorizationInputEnvelope = Object.freeze({
    inputId: `auth-input-${inputSeq}`,
    inputSource: source,
    submittedBy: String(r.submittedBy).trim(),
    submittedAt: normDate(r.submittedAt) || new Date().toISOString(),
    architectureVersion:
      r.architectureVersion != null
        ? String(r.architectureVersion)
        : LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
    packageId: r.packageId != null ? String(r.packageId) : null,
    environmentDeclaration: env ? Object.freeze(env) : null,
    humanApproval: human ? Object.freeze(human) : null,
    tenantSelection: tenants ? Object.freeze(tenants) : null,
    readonlyAccessDeclaration: readonly ? Object.freeze(readonly) : null,
    stageOneAuthorization: stage1 ? Object.freeze(stage1) : null,
    rollbackAcknowledgement: rollback ? Object.freeze(rollback) : null,
    evidenceAcknowledgement: evidence ? Object.freeze(evidence) : null,
    riskAcknowledgements: risks
      ? Object.freeze(risks.map((x) => Object.freeze(x)))
      : null,
    attachmentsMetadata: Object.freeze(attach.items),
    notes: sanitizeAuthorizationText(r.notes),
  });

  return Object.freeze({
    parseResult: hasAnySection ? 'parsed' : 'incomplete',
    envelope,
    diagnostics: Object.freeze([...new Set(diagnostics)]),
    errors: Object.freeze([] as string[]),
  });
}

export function __resetAuthInputSeqForTest(): void {
  inputSeq = 0;
}
