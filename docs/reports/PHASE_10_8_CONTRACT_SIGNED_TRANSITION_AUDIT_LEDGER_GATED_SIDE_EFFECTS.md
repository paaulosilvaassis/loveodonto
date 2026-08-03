# PHASE_10.8 — CONTRACT SIGNED TRANSITION, AUDIT LEDGER AND GATED SIDE-EFFECTS

## 1. Baseline

| Item | Valor |
|------|--------|
| Branch | `main` |
| Commit base | `b95eff1` |
| Working tree | Alterações não commitadas das Phases 10.2–10.8 |
| Repo | `appgestaoodonto/` |
| Data | 2026-08-03 |

## 2. Auditoria

Somente leitura confirmou (antes de alterar código):

- `ContractApplicationService` e SM: `APPROVED → PENDING_SIGNATURES → PARTIALLY_SIGNED|SIGNED`; `SIGNED` não reabre
- `SignatureEnvelopeApplicationService` + reconciliação de envelopes (10.6)
- `ContractDocumentArtifactPipeline`, evidence report, integrity manifest (10.7)
- Repositories memory de contratos/arquivos/artefatos
- `app_contract_audit_events` = audit operacional — **insuficiente** para ledger jurídico (sem sequenceNumber/hash chain)
- Idempotência 10.5/10.6 reutilizável (`COMPLETE_CONTRACT_SIGNING` adicionado)
- `ContractMemoryRepository.withTransaction` (snapshot/rollback)
- Registry legado `CONTRACT_SIGNED` em domain-events — **não acionado**
- Feature flags existentes, todas OFF; `contract_audit_ledger_enabled` já existia
- Migrations 028/029 **não aplicadas**; nenhum fluxo v2 ativo

## 3. Arquivos criados

### Domínio / ledger / completion

- `src/domain/contracts/ledger/contract-ledger.types.ts`
- `src/domain/contracts/ledger/contract-ledger.hash.ts`
- `src/domain/contracts/ledger/contract-ledger.repository.ts`
- `src/domain/contracts/completion/contract-signing-completion.validator.ts`
- `src/domain/contracts/completion/contract-signed-effects.policy.ts`
- `src/domain/contracts/completion/contract-signing-completion.service.ts`
- `src/domain/contracts/completion/contract-signed-reconciliation.service.ts`
- `src/domain/contracts/completion/signing-completion.harness.ts`
- `src/repositories/contracts/contractLedgerPostgres.repository.ts` (stub, sem wiring)

### API / UI / testes / migration / docs

- `server/lib/contractSigningCompletionV2Api.js`
- `src/services/contractSigningCompletionV2Service.js`
- `src/pages/contratos/ContractsConclusaoV2Page.jsx`
- `src/__tests__/phase108ContractSignedTransitionLedgerEffects.test.js`
- `supabase/migrations/030_app_contract_ledger.sql`
- `supabase-local/migrations/030_app_contract_ledger.sql`
- `supabase-local/supabase/migrations/030_app_contract_ledger.sql`
- `docs/reports/PHASE_10_8_CONTRACT_SIGNED_TRANSITION_AUDIT_LEDGER_GATED_SIDE_EFFECTS.md`

## 4. Arquivos alterados

- `src/domain/contracts/contract.errors.ts` — códigos SIGNING/LEDGER/SIGNED
- `src/domain/contracts/contract.events.ts` — eventos de completion/ledger
- `src/domain/contracts/contract.ids.ts` — `ContractLedgerEntryId`
- `src/domain/contracts/idempotency/contract-idempotency.ts` — op `COMPLETE_CONTRACT_SIGNING`
- `src/domain/contracts/index.ts` — exports 10.8
- `src/permissions/catalog.js` — permissões (sem roleDefaults)
- `src/contracts/contractsShellConfig.js` — nav `conclusao-v2`
- `src/ProtectedApp.jsx` — rota gated
- `server/index.js` — endpoints técnicos

## 5. Completion service

`createContractSigningCompletionService`:

- `validateCompletion`
- `completeSigning`
- `reconcileSigningCompletion`
- `retryPendingCompletion`

Clock/repos/idempotency/ledger injetáveis. Sem IndexedDB, legado, event bus ou efeitos externos.

## 6. Validator final

`validateContractSigningCompletion` valida contrato/versão/envelope/PDF/evidence/manifesto/ledger chain.

## 7. Transições

Política auditável (sem salto silencioso):

```text
APPROVED → PENDING_SIGNATURES → SIGNED
(+ PARTIALLY_SIGNED somente se parcial histórico)
```

Cada passo valida SM, atualiza rowVersion, registra ledger, preserva conteúdo/hash/versão.

## 8. Ledger

Domínio `ContractLedgerEntry` append-only, separado do audit operacional.

## 9. Eventos (ledger mínimos)

Inclui: `CONTRACT_SIGNING_VALIDATED`, `CONTRACT_STATUS_PENDING_SIGNATURES`, `CONTRACT_STATUS_PARTIALLY_SIGNED`, `CONTRACT_SIGNED`, `CONTRACT_SIGNED_EFFECTS_PREPARED` (+ tipos históricos do enum).

Domínio retornado (não publicado no bus):

- `contract.signing_completion.*`
- `contract.signed`
- `contract.signed_effects_prepared`
- `contract.signed_reconciliation_required`
- `contract.ledger.*`

## 10. Hash encadeado

SHA-256 sobre representação canônica (tenant, contract, version, envelope, sequence, eventType, payload, actor, source, previousEntryHash, occurredAt, correlation/causation/idempotency).

## 11. Repository

`ContractLedgerMemoryRepository`: append-only, verifyChain, withTransaction (snapshot/rollback).  
`ContractLedgerPostgresRepository`: stub sem conexão.

## 12. Migration

`030_app_contract_ledger.sql` — tabela `app_contract_ledger`, FKs compostas, uniques, hash format, append-only triggers, RLS select/insert, sem update/delete.

## 13. Confirmação de não aplicação

Migration **criada e espelhada**; **não aplicada** em remoto/local runtime. Nenhuma tabela criada no Supabase nesta fase.

## 14. Atomicidade

Unidade lógica: validar → reservar idempotência → ledger VALIDATED → transições → CONTRACT_SIGNED → effects prepared → complete idempotência.  
`withTransaction` aninhado (contract + ledger).

## 15. Rollback

Falha em qualquer append/transição restaura snapshots; idempotência marcada FAILED; retry seguro.

## 16. Idempotência

Operação `COMPLETE_CONTRACT_SIGNING` com fingerprint de IDs + hashes dos 3 artefatos. Replay idêntico; conflito se artefatos diferem; contrato SIGNED com mesmos artefatos → replay.

## 17. Pending effects

`ContractSignedPendingEffects` com `executed: false` sempre (financeiro, prontuário, jornada, CRM, delivery, notify, analytics).

## 18. Effect policy

`deriveContractSignedPendingEffects` — pura; readiness exige `signed=true`; sem consultas externas.

## 19. Reconciliação

`createContractSignedReconciliationService`: `inspect` + `repairLedgerProjection` (plano apenas; `autoExecuted: false`).

## 20. Endpoints

Atrás de flags (OFF):

- `POST /internal/app/contracts-v2/:id/validate-signing-completion`
- `POST /internal/app/contracts-v2/:id/complete-signing`
- `GET  /internal/app/contracts-v2/:id/ledger`
- `POST /internal/app/contracts-v2/:id/ledger/verify`
- `GET  /internal/app/contracts-v2/:id/signed-effects`
- `POST /internal/app/contracts-v2/:id/reconcile-signed-state`

Handlers sem harness → 403/501. Sem legado/efeitos.

## 21. UI técnica

Rota `/gestao/contratos/conclusao-v2` montada somente com 7 flags ON (todas OFF). Harness fixtures/memory.

## 22. Permissões

Catálogo (sem grants em `roleDefaults`):

- `contracts:complete_signing`
- `contracts:view_ledger`
- `contracts:verify_ledger`
- `contracts:view_signed_effects`
- `contracts:reconcile_signed_state`

## 23. Feature flags

Todas permanecem `false`:

- `contracts_domain_v2_enabled`
- `contracts_module_v2_enabled`
- `contract_versioning_enabled`
- `contract_internal_signature_v2_enabled`
- `contract_pdf_v2_enabled`
- `contract_storage_v2_enabled`
- `contract_audit_ledger_enabled`

Também OFF: `contract_financial_activation_on_signed_enabled`, `contract_patient_portal_enabled`, `contract_public_verification_enabled`.

## 24. Testes

`phase108ContractSignedTransitionLedgerEffects.test.js` — 25 testes: validator, transition, ledger, atomicidade/rollback, idempotência, effects, reconciliation, cross-tenant, migration 030 estática, UI/API gate.

## 25. Cross-tenant

Coberto: conclusão/leitura/verify de ledger isolados por tenant.

## 26. Validação manual (checklist)

- `/gestao/contratos` intacta; assinatura/PDF legado intactos
- Rota v2 conclusão não visível com flags OFF
- Migrations 028/029/030 não aplicadas; sem bucket; sem efeitos reais
- Ledger apenas memory/repo injetado; `executed=false`

## 27. Comandos executados

```bash
git status -sb && git rev-parse HEAD
npx vitest run src/__tests__/phase108ContractSignedTransitionLedgerEffects.test.js
npx vitest run src/__tests__/phase102*.test.js … phase108*.test.js
npx vitest run src/__tests__/contractSignatureFlow.test.js …
npm run build
npx tsc --noEmit -p tsconfig.json  # dívida pré-existente fora de contracts
```

## 28. Resultados

| Suite | Resultado |
|-------|-----------|
| Phase 10.8 | 25 passed |
| Phase 10.2–10.8 regressão | 178 passed |
| Build | OK |
| Legacy `contractSignatureFlow` | 1 falha pré-existente (`window.location.origin`) |
| Typecheck global | Dívida pré-existente (CRM etc.); erros 10.8 do validator/stub corrigidos |

## 29. Regressões

- Nenhuma regressão nova em 10.2–10.8
- Falha legada `contractSignatureFlow` pré-existente (não alterada)

## 30. Segurança

- Tenant em todas as operações; artefatos consistentes
- Ledger append-only + hash chain
- Payload sem HTML/CPF/token/OTP/URL
- Idempotência por tenant; optimistic concurrency; SIGNED não reabre
- Sem efeitos externos; sem master SaaS com acesso clínico irrestrito na migration

## 31. Riscos

- Nested transactions memory vs Postgres futuro precisam do mesmo padrão atômico
- Manifesto em storage ainda é a versão preliminar do pipeline 10.7 (hashes signed/evidence OK)
- Registry legado `CONTRACT_SIGNED` permanece desconectado (intencional)

## 32. Pendências

- Aplicar migration 030 (fase futura, com aprovação)
- Wiring Postgres real do ledger
- Execução controlada de pending effects (fase seguinte)
- Ativação de flags por ambiente controlado

## 33. Gate

**APROVADO para conclusão da Phase 10.8** — critérios do brief atendidos sem commit, sem apply, sem flags ON, sem efeitos reais.

## 34. Próxima fase recomendada

**Phase 10.9** — execução gated/controlada dos pending effects (financeiro/prontuário/jornada/CRM/entrega/notificações) atrás de flags dedicadas, com outbox/idempotência e sem dual-write indevido — somente após aprovação explícita.
