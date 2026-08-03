/**
 * @module domain-events/staging-activation/handoff/stagingHumanReviewChecklist
 */

import type { StagingHumanReviewItem } from './stagingHandoffTypes.js';

const ITEMS = Object.freeze([
  'ambiente é staging real',
  'host não é produção',
  'projectRef não é produção',
  'Architecture Version confere',
  'tenants são explícitos',
  'nenhum wildcard',
  'acesso é realmente read-only',
  'secrets estão bloqueados',
  'rollback foi compreendido',
  'riscos foram aceitos individualmente',
  'Stage 1 contém somente três flags',
  'Stage 1 possui duração máxima',
  'success criteria foram revisados',
  'failure criteria foram revisados',
  'Execution Approval está separado',
  'nenhuma autorização permite produção',
] as const);

export function buildStagingHumanReviewChecklist(
  reviews: Partial<Record<string, Partial<StagingHumanReviewItem>>> = {},
): readonly StagingHumanReviewItem[] {
  return Object.freeze(
    ITEMS.map((description, idx) => {
      const itemId = `hr-${idx + 1}`;
      const o = reviews[itemId] || {};
      const reviewed = o.reviewed === true && Boolean(o.reviewedBy?.trim());
      return Object.freeze({
        itemId,
        description,
        reviewed,
        reviewedBy: reviewed ? (o.reviewedBy || null) : null,
        reviewedAt: reviewed ? (o.reviewedAt || null) : null,
        notes: o.notes ?? null,
      });
    }),
  );
}

export function humanReviewCompletedCount(items: readonly StagingHumanReviewItem[]): number {
  return items.filter((i) => i.reviewed).length;
}

export function humanReviewAllComplete(items: readonly StagingHumanReviewItem[]): boolean {
  return items.length > 0 && items.every((i) => i.reviewed);
}
