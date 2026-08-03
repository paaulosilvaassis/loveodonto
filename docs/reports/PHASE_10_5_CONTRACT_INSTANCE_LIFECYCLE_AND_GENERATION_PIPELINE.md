# PHASE_10_5 — Contract Instance Lifecycle and Generation Pipeline

**Status:** CONCLUÍDA  
**Baseline branch:** `main`  
**Baseline commit:** `b95eff1`  
**Working tree:** Phases 10.2–10.5 não commitadas  
**Referências:** relatórios Phase 10.1–10.4

**Migrations aplicadas:** **NÃO**  
**Commit:** não realizado  
**Feature flags:** `contracts_domain_v2_enabled`, `contracts_module_v2_enabled`, `contract_versioning_enabled`, `contract_packages_enabled` = `false`  
**SSOT:** IndexedDB inalterado  
**Integrações reais:** nenhuma (fixtures only)

---

## 1. Baseline

| Item | Valor |
|------|-------|
| Branch | `main` |
| Commit | `b95eff1` |
| Working tree | 10.2 + 10.3 + 10.4 + 10.5 |

---

## 2. Auditoria inicial

| Item | Resultado |
|------|-----------|
| Tipos/status/origins | Phase 10.2 em `contract.types.ts` / `contract.constants.ts` |
| Repositories 10.3 | `src/repositories/contracts/*` — sem wiring produção |
| Template app service 10.4 | `createContractTemplateApplicationService` |
| Clock injetável | **não existia** — criado em 10.5 |
| Idempotência | schema 028 preparado; serviço criado em 10.5 (memory) |
| Numeração | legado `CTR-YYYY-#####`; V2 `CTR-YYYY-000001` memory |
| Transaction helpers | apenas template publish; memory `withTransaction` em 10.5 |
| Wiring produção contracts-v2 | **ausente** antes desta fase |
| Migrations 028/029 | existem; **não aplicadas** |

---

## 3. Arquivos criados

### Shared / hash / numbering / idempotency

- `src/domain/contracts/shared/contract-clock.ts`
- `src/domain/contracts/shared/contract-id-factory.ts`
- `src/domain/contracts/hash/contract-content-hasher.ts`
- `src/domain/contracts/numbering/contract-number.generator.ts`
- `src/domain/contracts/idempotency/contract-idempotency.ts`

### Snapshots / generation / application

- `src/domain/contracts/snapshots/contract-snapshot.factories.ts`
- `src/domain/contracts/generation/contract-generation.types.ts`
- `src/domain/contracts/generation/contract-generation.pipeline.ts`
- `src/domain/contracts/application/contract-memory.repository.ts`
- `src/domain/contracts/application/contract-readiness.ts`
- `src/domain/contracts/application/contract.application-service.ts`
- `src/domain/contracts/application/contract-package.application-service.ts`
- `src/domain/contracts/audit/contract-audit.factory.ts`
- `src/domain/contracts/fixtures/contract-v2.fixtures.ts`

### UI / API / tests / docs

- `src/pages/contratos/ContractsInstanciasV2Page.jsx`
- `src/services/contractsV2Service.js`
- `server/lib/contractsV2Api.js`
- `src/__tests__/phase105ContractInstanceLifecyclePipeline.test.js`
- `docs/reports/PHASE_10_5_CONTRACT_INSTANCE_LIFECYCLE_AND_GENERATION_PIPELINE.md`

---

## 4. Arquivos alterados

- `src/domain/contracts/contract.constants.ts` — generation reasons estendidos
- `src/domain/contracts/contract.events.ts` — `package_created` / `package_completed`
- `src/domain/contracts/contract.errors.ts` — códigos 10.5
- `src/domain/contracts/index.ts` — exports
- `src/permissions/catalog.js` — módulo `contracts` (**sem** roleDefaults)
- `src/contracts/contractsShellConfig.js` — nav Instâncias v2
- `src/contracts/ui/ContractsShellLayout.jsx` — `featureFlagsAll`
- `src/ProtectedApp.jsx` — rota gated
- `server/index.js` — endpoints contracts-v2 / packages-v2

**Não alterados:** IndexedDB, `generatedContracts`, migration 006, UI/geração/assinatura legadas, financeiro, orçamento real, PDF, buckets.

---

## 5. Application service

`createContractApplicationService` — createDraft, get/list, updateDraft, createVersion, validateReadiness, transitionStatus (até APPROVED), lockVersion, cancel, duplicate.  
Tenant obrigatório; clock/IDs/repo/idempotency injetáveis; eventos retornados sem publish.

---

## 6. Package service

`createContractPackageApplicationService` — create/add/validate/complete com fixtures.  
Mesmo paciente/tenant; requisito obrigatório bloqueia conclusão; cancelado não satisfaz requisito.

---

## 7. Geração de números

`ContractNumberGenerator` memory: `CTR-YYYY-000001`  
`PackageNumberGenerator` memory: `PKG-YYYY-000001`  
Sequência monotônica por tenant+ano (não reutiliza). Sequence Postgres documentada como pendência futura (sem migration nesta fase).

---

## 8. Snapshot factories

Factories puras com cópia defensiva, bloqueio de data URL/tokens/funções, normalização ISO, warnings tipados, validação financeira coerente.

---

## 9. Generation context

`ContractGenerationContext` — montado só com dados fornecidos (fixtures). Sem stores legados.

---

## 10. Pipeline

Etapas: validar tenant/contrato/template/requisitos/snapshots → render → variáveis → plain text → version → SHA-256 → save → update currentVersionId → eventos tipados.  
Rollback via `withTransaction` no memory repo.

---

## 11. Renderização

Reutiliza content schema, parser, catálogo, sanitização da 10.4.  
Gera `contentSchemaSnapshot`, `renderedHtmlSnapshot`, `plainTextSnapshot`. Sem PDF.

---

## 12. Canonicalização

`canonicalizeJsonValue` — ordenação recursiva de chaves; JSON estável.

---

## 13. Hash

SHA-256 via `crypto.subtle`; hex lowercase; erro `HASH_UNAVAILABLE` se API ausente.  
Considera tenant, contractId, versionNumber, templateVersionId, reason, previousHash, html, plainText, snapshots.

---

## 14. Versionamento

`versionNumber` incremental; `previousVersionHash`; reasons estendidos (`MANUAL_REVISION`, `DATA_CORRECTION`, `BUDGET_CHANGE`, …).  
Bloqueia geração se `signaturesStarted`.

---

## 15. Lock

`lockVersion` — exige hash + snapshots mínimos; idempotente se já locked; imutabilidade via bloqueio de updateDraft; evento `contract.version_locked` (não publicado).

---

## 16. Readiness

`validateReadyForReview` / `Approval` / `Signature` (só validator — sem envelope).

---

## 17. Idempotência

Memory repo: CREATE_CONTRACT / CREATE_VERSION / CREATE_PACKAGE.  
Replay mesmo fingerprint; conflito se payload divergir; escopo por tenant.

---

## 18. Eventos

Payloads tipados + `createContractDomainEvent`. **Não publicados.**  
Tipos novos: `contract.package_created`, `contract.package_completed`.

---

## 19. Auditoria

`createContractAuditEvent` — metadata sanitizada (sem HTML/CPF/snapshots). Sink em memória opcional.

---

## 20. Endpoints

`/internal/app/contracts-v2*` e `/internal/app/contract-packages-v2*` — flag OFF ⇒ 403; sem service ⇒ 501.

---

## 21. UI técnica

`/gestao/contratos/instancias-v2` — monta só com 3 flags ON (default false).  
Fixtures only: criar demo, gerar versão, preview, hash, lock, readiness, transição até APPROVED.

---

## 22. Fixtures

`contract-v2.fixtures.ts` — tenant/clínica/paciente/responsável/profissional/orçamento/tratamento/odontograma/financeiro/signers/template demo. CPF mascarado; e-mails `*.example`.

---

## 23. Feature flags

Todas OFF. UI/API/service bloqueiam sem override de teste.

---

## 24. Permissões

Catalog `contracts:{view,create,update_draft,review,approve,cancel,view_audit}` — **sem** roleDefaults.

---

## 25. Testes

`phase105ContractInstanceLifecyclePipeline.test.js` — **22 passed**  
Cobertura: flags, numbers, snapshots, hash, service, pipeline, lock, readiness, transitions, idempotency, packages, audit, API, UI gate.

---

## 26. Validação manual (checklist)

| Item | Esperado |
|------|----------|
| `/gestao/contratos` legado | intacto |
| Nav Instâncias v2 | ausente (flags OFF) |
| Paciente/orçamento real | não consultados |
| PDF / assinatura / financeiro | não acionados |
| Migrations apply | não |
| `generated_contracts` | sem write |

---

## 27. Comandos executados

```text
npx vitest run src/__tests__/phase105ContractInstanceLifecyclePipeline.test.js
npx vitest run phase102 + phase103 + phase104 + phase105 + legado contratos
npx tsc -b  (domain/contracts 10.5 limpo após rename ReadinessInput)
npm run build
```

---

## 28. Resultados

| Suite | Resultado |
|-------|-----------|
| Phase 10.5 | 22 passed |
| Phase 10.2–10.4 | passed |
| Legado contratos | passed |
| Build | OK |
| TS domain/contracts (novo) | 0 erros |

---

## 29. Migrations

Nenhuma nova. 028/029 permanecem não aplicadas.  
**Pendência documentada:** sequence/contador persistido de numeração e wiring completo de `app_contract_idempotency_keys` — requer aprovação antes de migration.

---

## 30. Confirmação de não aplicação automática

Nenhum apply/push/migrate remoto ou local executado.

---

## 31. Regressões

Nenhuma introduzida nas suites executadas. Dívida TS preexistente (CRM/etc.) não tocada.

---

## 32. Riscos

1. Supabase publish/create version ainda não wired (memory only).  
2. Numeração memory não sobrevive restart — sequence futura necessária.  
3. UI técnica depende de service injetado em testes (default unavailable).  
4. Transições de assinatura existem no domínio mas são bloqueadas no application service desta fase.

---

## 33. Pendências

- Apply controlado 028/029  
- Wiring Supabase do lifecycle  
- Sequence de numeração persistida  
- Integração orçamento/paciente (fase posterior, atrás de flags)  
- PDF / assinatura / financeiro  
- Grants RBAC  
- Ativação gradual de flags  

---

## 34. Gate

| Critério | Status |
|----------|--------|
| DRAFT + packages + versões | OK |
| Snapshots defensivos | OK |
| Render determinístico + hash | OK |
| Lock imutável | OK |
| Readiness | OK |
| Idempotência | OK |
| Eventos sem publish | OK |
| UI fixtures + flags OFF | OK |
| Sem integração real | OK |
| Migrations não aplicadas | OK |
| Legado intacto | OK |
| Testes + build | OK |
| Relatório | OK |

**GATE Phase 10.5: APROVADO (técnico) — isolado, reversível, flags OFF.**

---

## 35. Próxima fase recomendada

**Phase 10.6 — Signature Envelope Foundation (internal only, flags OFF)**  
Preparar envelopes/signers/políticas sem providers externos e sem cutover do fluxo legado de assinatura.
