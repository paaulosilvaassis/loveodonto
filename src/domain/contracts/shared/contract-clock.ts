/**
 * @module domain/contracts/shared/contract-clock
 * @description Clock injetável para testes determinísticos — Phase 10.5.
 */

export interface ContractClock {
  now(): Date;
  nowIso(): string;
}

export function createSystemContractClock(): ContractClock {
  return {
    now: () => new Date(),
    nowIso: () => new Date().toISOString(),
  };
}

/** Clock fixo / avançável para testes. */
export function createFixedContractClock(initialIso: string): ContractClock & {
  advanceMs(ms: number): void;
  setIso(iso: string): void;
} {
  let current = new Date(initialIso);
  return {
    now: () => new Date(current.getTime()),
    nowIso: () => current.toISOString(),
    advanceMs(ms: number) {
      current = new Date(current.getTime() + ms);
    },
    setIso(iso: string) {
      current = new Date(iso);
    },
  };
}
