/**
 * @module repositories/contracts
 * @description Persistência Contracts V2 — Phase 10.3.
 * Sem wiring em services/UI. Feature flags OFF. IndexedDB permanece SSOT.
 */

export * from './contractPersistenceTables.js';
export * from './contractPersistenceErrors.js';
export * from './contractPersistenceTypes.js';
export * from './contractPersistenceMappers.js';
export * from './contractSupabaseRepository.js';
export * from './contractTemplateSupabaseRepository.js';
export * from './contractPackageSupabaseRepository.js';
export * from './signatureEnvelopeSupabaseRepository.js';
export * from './contractFileSupabaseRepository.js';
export * from './contractAuditSupabaseRepository.js';
export * from './contractLedgerPostgres.repository.js';
export * from './contractIdempotencyPostgres.repository.js';
export * from './contractNumberSequencePostgres.js';
export * from './contractsV2EnvironmentGuard.js';
export * from './contractsV2Transaction.js';
export * from './createContractsV2Repositories.js';
export * from './signingSessionPostgres.repository.js';
export * from './signatureChallengePostgres.repository.js';
export * from './signatureRateLimitPostgres.repository.js';
