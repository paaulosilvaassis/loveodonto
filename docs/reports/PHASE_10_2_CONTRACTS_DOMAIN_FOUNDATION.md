# PHASE_10_2 — Contracts Domain Foundation

**Status:** CONCLUÍDA  
**Baseline branch:** `main`  
**Baseline commit:** `b95eff1` (`b95eff1b5f151326b218d0f97482bb387c12f993`)  
**Referência:** `docs/reports/PHASE_10_1_CONTRACTS_DISCOVERY_AND_LEGACY_AUDIT.md`  
**Commit:** não realizado  
**Migrations criadas/aplicadas:** nenhuma  
**Dependências instaladas:** nenhuma  
**Feature flags ligadas:** nenhuma (todas `false`)

---

## 1. Objetivo

Criar a fundação de domínio tipada do módulo Contratos V2 — tipos, enums, máquina de estados, validators, interfaces de repositório/serviço, feature flags OFF, adapters legados e testes — **sem cutover** e sem alterar o runtime IndexedDB atual.

## 2. Escopo

| In scope | Out of scope |
|----------|--------------|
| Domínio isolado em `src/domain/contracts/` | Persistência Postgres / migrations |
| State machine pura | UI / telas novas |
| Validators puros | PDF / storage / assinatura real |
| Repository & service interfaces | Wiring em services legados |
| Feature flags default OFF | Ativação financeira |
| Legacy mappers (não persistentes) | Event bus publish |
| Testes unitários da foundation | Cutover / dual-write |

## 3. Auditoria inicial

| Item | Resultado |
|------|-----------|
| Branch | `main` |
| Commit | `b95eff1` — OK |
| Relatório 10.1 | Lido |
| Convenção IDs | Aliases `string` (como `PatientRef`) — sem branded runtime |
| Schema lib | Nenhuma (zod/yup ausentes) → validators manuais |
| Feature flags | Padrão Repository V3 (`readEnvFlag` / `readTenantFlag`) |
| Estrutura | Criado `src/domain/contracts/` (isolado de `src/contracts/` legado) |

## 4. Arquivos auditados (principais)

- `src/contracts/contractConstants.js`
- `src/services/contractModuleService.js` / `contractService.js` / `contractSignatureFlowService.js`
- `src/db/schema.js` (stores de contratos)
- `supabase/migrations/006_app_contracts.sql`
- `src/repositories/patient/patientTypes.ts` / `patientRepositoryFlags.ts`
- `src/repositories/shared/repositoryV3FlagHelpers.ts`
- `src/tenant/tenantAccess.js`
- `docs/reports/PHASE_10_1_CONTRACTS_DISCOVERY_AND_LEGACY_AUDIT.md`

## 5. Arquivos criados

| Arquivo |
|---------|
| `src/domain/contracts/index.ts` |
| `src/domain/contracts/contract.ids.ts` |
| `src/domain/contracts/contract.constants.ts` |
| `src/domain/contracts/contract.errors.ts` |
| `src/domain/contracts/contract.types.ts` |
| `src/domain/contracts/contract-status.machine.ts` |
| `src/domain/contracts/contract.validators.ts` |
| `src/domain/contracts/contract.repository.ts` |
| `src/domain/contracts/contract.service.ts` |
| `src/domain/contracts/contract-feature-flags.ts` |
| `src/domain/contracts/contract.events.ts` |
| `src/domain/contracts/templates/contract-template.types.ts` |
| `src/domain/contracts/templates/contract-template.validators.ts` |
| `src/domain/contracts/templates/contract-template.repository.ts` |
| `src/domain/contracts/signatures/signature.types.ts` |
| `src/domain/contracts/signatures/signature.validators.ts` |
| `src/domain/contracts/signatures/signature.repository.ts` |
| `src/domain/contracts/signatures/signature-provider.interface.ts` |
| `src/domain/contracts/packages/contract-package.types.ts` |
| `src/domain/contracts/packages/contract-package.validators.ts` |
| `src/domain/contracts/packages/contract-package.repository.ts` |
| `src/domain/contracts/files/contract-file.types.ts` |
| `src/domain/contracts/files/contract-file.repository.ts` |
| `src/domain/contracts/audit/contract-audit.types.ts` |
| `src/domain/contracts/audit/contract-audit.repository.ts` |
| `src/domain/contracts/legacy/legacy-contract.types.ts` |
| `src/domain/contracts/legacy/legacy-contract.mapper.ts` |
| `src/__tests__/phase102ContractsDomainFoundation.test.js` |
| `docs/reports/PHASE_10_2_CONTRACTS_DOMAIN_FOUNDATION.md` |

## 6. Arquivos alterados

Nenhum arquivo de produto legado foi alterado (`src/services/contract*`, `src/contracts/*`, migrations, package.json intactos).

Somente artefatos novos + este relatório.

## 7. Tipos implementados

- IDs: `TenantId`, `ContractId`, `ContractVersionId`, `ContractTemplateId`, `ContractTemplateVersionId`, `ContractPackageId`, `SignatureEnvelopeId`, `SignatureSignerId`, `SignaturePolicyId`, `ContractFileId`, `PatientId`, `BudgetId`, …
- Entidades: `Contract`, `ContractVersion`, snapshots (patient/guardian/clinic/professional/budget/treatment/odontogram/financial/consents/signers/attachments/terms)
- Templates: `ContractTemplate`, `ContractTemplateVersion`, requirements, variables
- Packages: `ContractPackage`, items, requirements
- Signatures: `SignaturePolicy`, `Envelope`, `Signer`, levels/methods/statuses, `SignatureProvider`
- Files: `ContractFile` por referência de storage (não data URL definitiva)
- Audit: `ContractAuditEvent` append-only ready
- Errors/warnings serializáveis com códigos estáveis

## 8. Estados canônicos

```text
DRAFT, READY_FOR_REVIEW, PENDING_INTERNAL_APPROVAL, APPROVED,
PENDING_SIGNATURES, PARTIALLY_SIGNED, SIGNED, DECLINED, EXPIRED,
CANCELLED, SUPERSEDED, TERMINATED, VOIDED
```

### Compatibilidade de status

| Direção | Política |
|---------|----------|
| Legacy → Domain | Tabela explícita (`draft→DRAFT`, `sent→PENDING_SIGNATURES`, `signed_by_*→PARTIALLY_SIGNED`, `completed/signed→SIGNED`, …) |
| Domain → Legacy | Conservador; `READY_FOR_REVIEW` / `PENDING_INTERNAL_APPROVAL` / `VOIDED` → **erro tipado** (sem fallback silencioso) |
| Remote 006 → Domain | `draft/generated/signed/canceled` apenas; outros → `REMOTE_STATUS_NOT_MAPPABLE` |

Proibido e testado: reduzir silenciosamente `DECLINED/EXPIRED/SUPERSEDED/TERMINATED` para `canceled`.

### Document types

Canônicos conforme brief. Legado desconhecido/`garantia`/`menor_idade`/… → `CUSTOM` + warning (nunca outro tipo clínico específico incorreto). Consentimento + treatment `implante_*` → `IMPLANT_CONSENT`, etc.

## 9. Tabela de transições

| From | To permitidos |
|------|----------------|
| DRAFT | READY_FOR_REVIEW, CANCELLED |
| READY_FOR_REVIEW | DRAFT, PENDING_INTERNAL_APPROVAL, APPROVED, CANCELLED |
| PENDING_INTERNAL_APPROVAL | READY_FOR_REVIEW, APPROVED, CANCELLED |
| APPROVED | PENDING_SIGNATURES, CANCELLED |
| PENDING_SIGNATURES | PARTIALLY_SIGNED, SIGNED, DECLINED, EXPIRED, CANCELLED |
| PARTIALLY_SIGNED | SIGNED, DECLINED, EXPIRED, CANCELLED |
| SIGNED | SUPERSEDED, TERMINATED |
| Terminais | nenhuma |

Regras reforçadas: `SIGNED↛DRAFT/APPROVED`; cancelamento com motivo; assinatura exige versão locked; conclusão exige assinaturas; SUPERSEDED exige referência; content lock em `PARTIALLY_SIGNED` e pós-envio.

## 10. Validators

`validateContract`, `validateContractVersion`, `validateContractReadyForReview|Approval|Signature|Completion`, template/package/envelope/signer validators. Formato `{ valid, errors, warnings }`. Sem lib externa.

## 11. Repository interfaces

Todas exigem `tenantId` como primeiro argumento:

- `ContractRepository`
- `ContractTemplateRepository`
- `ContractPackageRepository`
- `SignatureEnvelopeRepository`
- `ContractFileRepository`
- `ContractAuditRepository` (append-only)

`ContractRepositoryNotImplementedError` para stubs futuros.

## 12. Service interfaces

`ContractDomainService`, `ContractGenerationService`, `ContractVersionService`, `ContractPackageService`, `ContractPdfRenderer`, `ContractFileStorage`, `ContractAuditService`, `ContractSignatureOrchestrator`, `SignatureProvider` (abstração sem implementação).

## 13. Feature flags (todas OFF)

```text
contracts_domain_v2_enabled
contracts_module_v2_enabled
contract_templates_v2_enabled
contract_packages_enabled
contract_versioning_enabled
contract_pdf_v2_enabled
contract_internal_signature_v2_enabled
contract_external_signature_enabled
contract_storage_v2_enabled
contract_budget_integration_v2_enabled
contract_financial_activation_on_signed_enabled
contract_odontogram_snapshot_enabled
contract_patient_portal_enabled
contract_audit_ledger_enabled
contract_public_verification_enabled
```

Helper: `isContractFeatureEnabled(flag, context)` — ausência ⇒ `false` (diferente de `tenantAccess.isFeatureFlagEnabled`).

Nenhuma flag wired em rotas/UI/services.

## 14. Legacy adapters

Funções puras em `legacy/legacy-contract.mapper.ts`:

- `mapLegacyGeneratedContractToDomain`
- `mapDomainContractToLegacyGeneratedContract`
- `mapLegacyContractStatusToDomain` / `mapDomainContractStatusToLegacy`
- `mapRemoteContractStatusToDomain`
- `mapLegacyDocumentTypeToDomain`
- `mapLegacySignatureToDomain`
- `mapLegacyAttachmentToDomain`

Não persistem; não inventam assinatura/storage/odontograma/hash crypto; preservam IDs e status original em metadata.

## 15. Eventos tipados

`CONTRACT_DOMAIN_EVENT_TYPES` + `createContractDomainEvent` — factory pura, sem publish no bus, sem financeiro/prontuário.

## 16. Testes

Arquivo: `src/__tests__/phase102ContractsDomainFoundation.test.js`

```text
Test Files  1 passed
Tests       39 passed
```

Cobertura: artefatos, state machine, validators, legacy mapper, flags, events, tenantId em repository contracts.

## 17. Comandos executados e resultados

| Comando | Resultado |
|---------|-----------|
| `git branch/rev-parse` | `main` @ `b95eff1` |
| `vitest run …phase102ContractsDomainFoundation.test.js` | **39 passed** |
| `vitest run` contractModule / hashtags / variableResolver / budgetFlow / signatureFlow | 30 passed; **1 falha preexistente** em `contractSignatureFlow` (`window.location.origin` undefined no Node) — serviço legado não alterado |
| `tsc -b` | **0 erros em `src/domain/contracts/**`**; ~43 erros preexistentes em repositories CRM/agenda/financial |
| `eslint src/domain/contracts/**` | arquivos `.ts` ignorados pela config ESLint atual (padrão do repo) |
| `npm run build` | **✓ built** (~5s) |

## 18. Dívida não relacionada (não corrigida)

- TypeScript em `repositories/crm/*`, `agenda`, `financial`, `collaborator`
- ESLint global (~1100+ problemas preexistentes)
- Teste `sendContractForDigitalSignature` depende de `window.location` (ambiente Node)
- ESLint não cobre `src/domain/**/*.ts` (ignore config)

## 19. Riscos

1. Domínio ainda não wired — risco de drift se legado evoluir sem atualizar mappers.  
2. `Domain→Legacy` para estados novos exige fallback explícito do chamador.  
3. Hash/`lockedAt` legados fracos — mappers emitem warnings, não “promovem” imutabilidade falsa.  
4. Flags OFF garantem isolamento, mas cutover futuro precisará wiring cuidadoso.

## 20. Pendências (para fases seguintes)

1. Escolher provedor externo de assinatura.  
2. Decidir ativação financeira: manter approve-budget vs `contract.signed`.  
3. Lista oficial de pacote documental obrigatório por procedimento.  
4. Deprecar oficialmente `AdminContratosConsentimentosPage` órfã.

## 21. Veredito / Gates

| Gate | Status |
|------|--------|
| Domínio isolado | ✅ |
| App legado intacto (sem wiring) | ✅ |
| Nenhuma migration | ✅ |
| Nenhuma dependência nova | ✅ |
| Flags todas OFF | ✅ |
| Status salvos não alterados | ✅ |
| Contratos legados não regravados | ✅ |
| State machine testada | ✅ |
| Validators testados | ✅ |
| Legacy mappers testados | ✅ |
| Interfaces exigem tenantId | ✅ |
| Assinatura externa sem implementação | ✅ |
| Financeiro no fluxo atual | ✅ |
| Relatório criado | ✅ |
| Build OK | ✅ |

## 22. Recomendação — Phase 10.3

**PHASE_10.3 — Persistência e tenant security**

- Criar migrations **manuais revisáveis** (não aplicar automaticamente) para templates/versions/contracts/versions/parties/snapshots/audit.
- RLS / isolamento equivalente + testes cross-tenant.
- Manter IndexedDB como SSOT operacional até cutover controlado.
- Não ligar feature flags.

---

**FIM Phase 10.2 — aguardar aprovação formal. Commit não realizado.**
)
