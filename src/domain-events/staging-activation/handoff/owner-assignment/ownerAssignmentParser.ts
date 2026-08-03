/**
 * @module domain-events/staging-activation/handoff/owner-assignment/ownerAssignmentParser
 */

import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../../../certification/cqrsArchitectureVersion.js';
import { REQUIRED_HANDOFF_ROLE_IDS } from '../stagingResponsibilityMatrix.js';
import type { StagingHandoffRoleId } from '../stagingHandoffTypes.js';
import {
  isTechnicalIdentity,
  sanitizeOwnerText,
  scanOwnerInputSensitive,
} from './ownerAssignmentSanitizer.js';
import type {
  OwnerAssignmentInputEnvelope,
  OwnerRoleAssignment,
} from './ownerAssignmentTypes.js';

let inputSeq = 0;

function normDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const t = Date.parse(String(value).trim());
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function parseAssignment(raw: unknown): OwnerRoleAssignment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const roleId = String(r.roleId || '') as StagingHandoffRoleId;
  if (!(REQUIRED_HANDOFF_ROLE_IDS as readonly string[]).includes(roleId)) return null;

  const person = sanitizeOwnerText(r.assignedPerson);
  const assignedBy = sanitizeOwnerText(r.assignedBy);
  const assignedAt = normDate(r.assignedAt);
  const validUntil = normDate(r.validUntil);
  const acknowledged = r.acknowledged === true;
  let status: OwnerRoleAssignment['status'] = 'missing';

  if (r.status === 'revoked') status = 'revoked';
  else if (validUntil && Date.parse(validUntil) < Date.now()) status = 'expired';
  else if (!person || !assignedBy || !assignedAt) status = person ? 'provided' : 'missing';
  else if (isTechnicalIdentity(person) || /^(all|\*|everyone)$/i.test(person)) status = 'invalid';
  else status = 'valid';

  if (status === 'valid' && !acknowledged) {
    // provided+valid structurally but ack pending — keep valid; completeness handles ack
  }

  return Object.freeze({
    roleId,
    assignedPerson: person,
    assignedBy,
    assignedAt,
    contactReference: sanitizeOwnerText(r.contactReference),
    acknowledged,
    acknowledgedAt: acknowledged ? normDate(r.acknowledgedAt) : null,
    acknowledgementScope: sanitizeOwnerText(r.acknowledgementScope),
    responsibilitiesAccepted: r.responsibilitiesAccepted === true,
    limitationsAccepted: r.limitationsAccepted === true,
    notes: sanitizeOwnerText(r.notes),
    justification: sanitizeOwnerText(r.justification),
    status,
    validUntil,
  });
}

export interface ParseOwnerAssignmentResult {
  readonly parseResult: 'parsed' | 'invalid' | 'incomplete' | 'empty';
  readonly envelope: OwnerAssignmentInputEnvelope | null;
  readonly errors: readonly string[];
}

export function parseOwnerAssignmentInput(raw: unknown): ParseOwnerAssignmentResult {
  inputSeq += 1;
  if (raw == null) {
    return Object.freeze({
      parseResult: 'empty',
      envelope: null,
      errors: Object.freeze(['input ausente']),
    });
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return Object.freeze({
      parseResult: 'invalid',
      envelope: null,
      errors: Object.freeze(['input deve ser objeto']),
    });
  }

  const r = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (!sanitizeOwnerText(r.submittedBy)) errors.push('submittedBy obrigatório');

  const scan = scanOwnerInputSensitive(r);
  if (!scan.ok) errors.push(`conteúdo sensível: ${scan.detail}`);

  for (const k of Object.keys(r)) {
    if (/password|secret|token|serviceRole|privateKey/i.test(k)) {
      errors.push(`campo não suportado: ${k}`);
    }
  }

  if (errors.length) {
    return Object.freeze({
      parseResult: 'invalid',
      envelope: null,
      errors: Object.freeze(errors),
    });
  }

  const rawAssignments = Array.isArray(r.assignments) ? r.assignments : [];
  const assignments: OwnerRoleAssignment[] = [];
  for (const a of rawAssignments) {
    const parsed = parseAssignment(a);
    if (!parsed) {
      errors.push('assignment com roleId inválido ou malformado');
      continue;
    }
    assignments.push(parsed);
  }

  if (errors.length) {
    return Object.freeze({
      parseResult: 'invalid',
      envelope: null,
      errors: Object.freeze(errors),
    });
  }

  let attachments: OwnerAssignmentInputEnvelope['attachmentsMetadata'] = Object.freeze([]);
  if (r.attachmentsMetadata != null) {
    if (!Array.isArray(r.attachmentsMetadata)) {
      return Object.freeze({
        parseResult: 'invalid',
        envelope: null,
        errors: Object.freeze(['attachmentsMetadata inválida']),
      });
    }
    const items = [];
    for (const row of r.attachmentsMetadata) {
      if (!row || typeof row !== 'object') {
        return Object.freeze({
          parseResult: 'invalid',
          envelope: null,
          errors: Object.freeze(['attachment inválido']),
        });
      }
      const meta = row as Record<string, unknown>;
      if (meta.content != null || meta.base64 != null || meta.data != null) {
        return Object.freeze({
          parseResult: 'invalid',
          envelope: null,
          errors: Object.freeze(['anexo com conteúdo proibido']),
        });
      }
      items.push({
        name: String(meta.name || 'unnamed').slice(0, 120),
        mediaType: meta.mediaType != null ? String(meta.mediaType).slice(0, 80) : null,
        sizeBytes: typeof meta.sizeBytes === 'number' ? meta.sizeBytes : null,
        contentIncluded: false as const,
      });
    }
    attachments = Object.freeze(items);
  }

  const envRef = r.environmentReference && typeof r.environmentReference === 'object'
    && !Array.isArray(r.environmentReference)
    ? Object.freeze({ ...(r.environmentReference as Record<string, unknown>) })
    : null;
  const tenantRef = r.tenantReference && typeof r.tenantReference === 'object'
    && !Array.isArray(r.tenantReference)
    ? Object.freeze({ ...(r.tenantReference as Record<string, unknown>) })
    : null;

  let approvalRefs: OwnerAssignmentInputEnvelope['approvalReferences'] = null;
  if (Array.isArray(r.approvalReferences)) {
    approvalRefs = Object.freeze(
      r.approvalReferences
        .filter((x) => x && typeof x === 'object')
        .map((x) => Object.freeze({ ...(x as Record<string, unknown>) })),
    );
  }

  const envelope: OwnerAssignmentInputEnvelope = Object.freeze({
    assignmentInputId: `owner-assign-${inputSeq}`,
    handoffId: r.handoffId != null ? String(r.handoffId) : null,
    submittedBy: String(r.submittedBy).trim(),
    submittedAt: normDate(r.submittedAt) || new Date().toISOString(),
    architectureVersion:
      r.architectureVersion != null
        ? String(r.architectureVersion)
        : LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
    assignments: Object.freeze(assignments),
    environmentReference: envRef,
    tenantReference: tenantRef,
    approvalReferences: approvalRefs,
    attachmentsMetadata: attachments,
    notes: sanitizeOwnerText(r.notes),
  });

  return Object.freeze({
    parseResult: assignments.length === 0 ? 'incomplete' : 'parsed',
    envelope,
    errors: Object.freeze([] as string[]),
  });
}

export function __resetOwnerAssignmentInputSeqForTest(): void {
  inputSeq = 0;
}
