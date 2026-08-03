/**
 * @module domain-events/certification/cqrsCertificationHistory
 * @description Histórico in-memory de certificação — Phase 8.5.
 */

import type { CqrsCertificationContract } from './cqrsCertificationTypes.js';

const history: CqrsCertificationContract[] = [];
const HISTORY_CAP = 50;

export function appendCqrsCertificationHistory(
  contract: CqrsCertificationContract,
): void {
  history.push(contract);
  while (history.length > HISTORY_CAP) history.shift();
}

export function getCqrsCertificationHistory(): CqrsCertificationContract[] {
  return history.map((c) => ({
    ...c,
    scope: [...c.scope],
    domains: [...c.domains],
    components: [...c.components],
    checks: [...c.checks],
    evidence: [...c.evidence],
    warnings: [...c.warnings],
    blockers: [...c.blockers],
    byReadModel: { ...c.byReadModel },
  }));
}

export function __clearCqrsCertificationHistoryForTest(): void {
  history.length = 0;
}
