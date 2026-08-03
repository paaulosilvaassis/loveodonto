# PHASE_10_4 — Contract Templates and Editor Foundation

**Status:** CONCLUÍDA  
**Baseline branch:** `main`  
**Baseline commit:** `b95eff1`  
**Working tree:** inclui Phases 10.1–10.3 + artefatos desta fase (não commitados)  
**Referências:**  
- `docs/reports/PHASE_10_1_CONTRACTS_DISCOVERY_AND_LEGACY_AUDIT.md`  
- `docs/reports/PHASE_10_2_CONTRACTS_DOMAIN_FOUNDATION.md`  
- `docs/reports/PHASE_10_3_CONTRACTS_PERSISTENCE_AND_TENANT_SECURITY.md`

**Migrations aplicadas:** **NÃO**  
**Commit:** não realizado  
**Feature flags:** `contract_templates_v2_enabled` e `contracts_domain_v2_enabled` = `false`  
**SSOT operacional:** IndexedDB (inalterado)  
**UI legada:** intacta (`/gestao/contratos/modelos`)

---

## 1. Baseline

| Item | Valor |
|------|-------|
| Branch | `main` |
| Commit | `b95eff1` |
| Working tree | alterações não commitadas 10.2 + 10.3 + 10.4 |

---

## 2. Auditoria

| Item | Resultado |
|------|-----------|
| Modelos legado | `ContractsModelosPage.jsx` + TipTap `ContractRichEditor.jsx` |
| Admin órfã | `AdminContratosConsentimentosPage.jsx` (não montada) |
| Shell nav | `contractsShellConfig.js` — item Modelos v2 adicionado com `featureFlag` |
| Sanitização HTML instalada | sem DOMPurify dedicado no app; TipTap usa `purify` no bundle — **allowlist própria** criada |
| Cláusulas na migration 028 | **não** — apenas `clauses_snapshot` em versões |
| Persistência local 028/029 | **não aplicada** |
| Feature flags | domínio Phase 10.2; default `false` |
| Permissões legado | `admin_contratos:*` — não ampliadas em `roleDefaults` |
| Repository pattern | client/repo injetável (10.3) + memory/unavailable (10.4) |

### Decisão: biblioteca de cláusulas

Sem tabela Postgres de cláusulas na 10.3. **Não foi criada migration nesta fase.**  
Biblioteca de sistema + repository in-memory (`contract-clause.library.ts`). Snapshot imutável na versão.

---

## 3. Arquivos criados

### Domínio / templates

- `src/domain/contracts/templates/contract-template-content.schema.ts`
- `src/domain/contracts/templates/contract-template-variables.catalog.ts`
- `src/domain/contracts/templates/contract-template-parser.ts`
- `src/domain/contracts/templates/contract-template-sanitize.ts`
- `src/domain/contracts/templates/contract-template-status.machine.ts`
- `src/domain/contracts/templates/contract-template-validation.ts`
- `src/domain/contracts/templates/contract-template.application-repository.ts`
- `src/domain/contracts/templates/contract-template.application-service.ts`
- `src/domain/contracts/templates/contract-template-memory.repository.ts`
- `src/domain/contracts/templates/contract-template-unavailable.repository.ts`
- `src/domain/contracts/templates/contract-clause.types.ts`
- `src/domain/contracts/templates/contract-clause.library.ts`

### UI / client

- `src/pages/contratos/ContractsModelosV2Page.jsx`
- `src/components/contracts/v2/templateEditorUtils.js`
- `src/services/contractTemplatesV2Service.js`

### Server / testes / docs

- `server/lib/contractTemplatesV2Api.js`
- `src/__tests__/phase104ContractTemplatesEditorFoundation.test.js`
- `docs/reports/PHASE_10_4_CONTRACT_TEMPLATES_AND_EDITOR_FOUNDATION.md`

---

## 4. Arquivos alterados

- `src/domain/contracts/contract.errors.ts` — códigos/warnings de template
- `src/domain/contracts/templates/contract-template.types.ts` — requirements, inputs, validation result
- `src/domain/contracts/index.ts` — exports Phase 10.4
- `src/repositories/contracts/contractPersistenceMappers.ts` — map requirements estendidos
- `src/permissions/catalog.js` — módulo `contract_templates` (**sem** `roleDefaults`)
- `src/contracts/contractsShellConfig.js` — nav Modelos v2 + featureFlag
- `src/contracts/ui/ContractsShellLayout.jsx` — filtra nav por flag de domínio
- `src/ProtectedApp.jsx` — rota `modelos-v2` só se UI flag enabled
- `server/index.js` — registra endpoints internos v2

**Não alterados:** `generatedContracts`, migration `006`, UI legada de modelos, assinatura, financeiro, PDF, orçamento, SSOT IndexedDB, `roleDefaults`.

---

## 5. Arquitetura do editor

```text
Lista (flag ON)
  → Editor 3 colunas
      Esq: blocos / variáveis / cláusulas
      Centro: documento (blocos reordenáveis ↑↓)
      Dir: propriedades / requisitos / versão
  Modos: Editar | Pré-visualizar | Validar
  Publicação: confirmação + changeSummary
```

Sem TipTap no v2 (evita WYSIWYG externo adicional). Editor baseado em blocos serializáveis.

---

## 6. Modelo de blocos

`ContractContentSchema` (`schemaVersion: 1`) com tipos:

`HEADING`, `PARAGRAPH`, `CLAUSE`, `TABLE`, `VARIABLE`, `PAGE_BREAK`, `SIGNATURES`, `ODONTOGRAM`, `FINANCIAL_SUMMARY`, `TREATMENT_TABLE`, `DIVIDER`

Conversão determinística → HTML via `contentSchemaToHtml`.

---

## 7. Catálogo de variáveis

`CONTRACT_TEMPLATE_VARIABLE_CATALOG` — chaves `clinic.*`, `patient.*`, `guardian.*`, `professional.*`, `budget.*`, `financial.*`, `treatment.*`, `odontogram.*`, `contract.*`, `signature.*`  
Preview fictício apenas (`João da Silva`, CPF mascarado, `ORC-DEMO-001`, etc.).

---

## 8. Parser

Formato `{{path.segment}}` — sem eval/Function/expressões.  
Bloqueia `constructor`, `__proto__`, `prototype`, operadores.  
Resolve apenas chaves flat do mapa de valores.  
HTML escapado por default; tipo `html` passa por sanitizer.

---

## 9. Sanitização

Allowlist própria (sem nova dependência): tags `p/br/strong/.../table/...`, attrs `colspan/rowspan/class/data-variable`.  
Remove `script`, `iframe`, `on*`, `javascript:`, links/src/style.

---

## 10. State machine

`DRAFT → IN_REVIEW|ARCHIVED`  
`IN_REVIEW → DRAFT|PUBLISHED|ARCHIVED`  
`PUBLISHED → SUPERSEDED|ARCHIVED`  
`SUPERSEDED → ARCHIVED`  
`ARCHIVED → ∅`  
Publicação exige `IN_REVIEW` (não pula DRAFT→PUBLISHED).

---

## 11. Application service

`createContractTemplateApplicationService` — CRUD, versões, review, publish transacional (via repo), duplicate, archive, validate, preview.  
Tenant obrigatório; flags; permissões `contract_templates:*`; erros tipados; eventos tipados **sem** publish no bus.

---

## 12. Repositories utilizados

| Repo | Uso |
|------|-----|
| `ContractTemplateUnavailableRepository` | default client (migrations não aplicadas) |
| `ContractTemplateMemoryRepository` | testes / injeção |
| `ContractTemplateSupabaseRepository` (10.3) | permanece; wiring completo de publish transaction fica para fase com apply |

Nenhum dual-write para tabelas legadas.

---

## 13. Endpoints

Prefixo `/internal/app/` (flag OFF ⇒ 403):

- `GET/POST /contract-templates-v2`
- `GET/PATCH /contract-templates-v2/:id`
- `POST .../duplicate`, `.../archive`
- `GET/POST .../:id/versions`
- `GET/PATCH /contract-template-versions-v2/:versionId`
- `POST .../review`, `.../publish`, `.../validate`, `.../preview`

Tenant do `tenantContext`; body `tenantId` ignorado como fonte de verdade.

---

## 14. Permissões

Catalog: `contract_templates:{view,create,update_draft,review,publish,archive,duplicate,view_history,manage_clauses}`  
**Não** adicionadas a `roleDefaults` (ninguém ganha acesso automático).

---

## 15. Feature flags

| Flag | Default |
|------|---------|
| `contracts_domain_v2_enabled` | `false` |
| `contract_templates_v2_enabled` | `false` |

UI não monta rota; nav oculta; API 403; service bloqueia sem override de teste.

---

## 16. Preview

`buildPreviewVariableValues()` — dados fictícios apenas; sem consulta a paciente real; sem PDF/arquivo/persistência.

---

## 17. Testes

`src/__tests__/phase104ContractTemplatesEditorFoundation.test.js` — **26 passed**  
Cobertura: parser, sanitize, schema, state machine, catalog, application service, API guards, UI flag, validação.

---

## 18. Validação manual (checklist)

| Checagem | Resultado esperado |
|----------|-------------------|
| `/gestao/contratos` | intacto |
| Modelos legado | intacto |
| Nav Modelos v2 | **ausente** (flag off) |
| Rota `modelos-v2` | **não montada** |
| Migrations apply | **não** |
| Preview pacientes reais | **não** |
| Legado IndexedDB | inalterado |

---

## 19. Comandos executados

```text
npx vitest run src/__tests__/phase104ContractTemplatesEditorFoundation.test.js
npx vitest run src/__tests__/phase102ContractsDomainFoundation.test.js
npx vitest run src/__tests__/phase103ContractsPersistenceTenantSecurity.test.js
npx vitest run src/__tests__/professionalContractTemplate.test.js
npx vitest run src/__tests__/contractModuleService.test.js
npx vitest run src/__tests__/contractBudgetFlow.test.js
npx vitest run src/__tests__/budgetContractStabilityGuards.test.js
npx tsc -b  (erros domain/contracts Phase 10.4 = 0; dívida preexistente em CRM/etc. ignorada)
npm run build
npx eslint (arquivos JS novos da fase)
```

---

## 20. Resultados

| Suite | Resultado |
|-------|-----------|
| Phase 10.4 | 26 passed |
| Phase 10.2 | 39 passed |
| Phase 10.3 | 27 passed |
| Legado contratos (module/budget/guards/professional) | passed |
| Build Vite | OK |
| TS em `src/domain/contracts` (10.4) | 0 erros novos |

---

## 21. Migrations

Nenhuma migration nova nesta fase.  
028/029 permanecem como criadas na 10.3.

**Pendência documentada (não criada):** tabela `app_contract_clauses` se persistência multi-tenant de cláusulas custom for necessária — requer aprovação antes de criar/aplicar.

---

## 22. Confirmação de não aplicação automática

Nenhum `supabase db push`, `migrate`, apply remoto ou local foi executado nesta fase.

---

## 23. Riscos

1. Editor v2 ainda sem wiring Supabase de publish transaction completo no repository 10.3 (memory cobre testes).  
2. Permissões no catalog sem grant em roles — ativação futura exige RBAC explícito.  
3. Allowlist HTML própria (não DOMPurify) — conservadora, mas deve ser revisitada em hardening.  
4. UI com `dangerouslySetInnerHTML` no preview — apenas após sanitize/render seguros.  
5. Sem tabela de cláusulas — custom clauses só in-memory até migration futura.

---

## 24. Pendências

- Apply controlado de 028/029 em ambiente efêmero  
- Wiring `ContractTemplateSupabaseRepository` → `publishVersionTransaction`  
- Migration opcional de cláusulas (após aprovação)  
- Atribuição RBAC das permissões `contract_templates:*`  
- Ativação gradual das flags (fase posterior)  
- PDF v2 / geração real / assinatura / orçamento (fora do escopo)

---

## 25. Gate

| Critério | Status |
|----------|--------|
| Editor v2 isolado | OK |
| Flags desligadas | OK |
| UI legada intacta | OK |
| Versionamento | OK |
| Versão publicada imutável | OK |
| Parser sem execução de código | OK |
| HTML sanitizado | OK |
| Variáveis tipadas | OK |
| Preview fictício | OK |
| Publish transacional (memory) | OK |
| Tenant obrigatório | OK |
| Permissões validadas no service/API | OK |
| Sem documento/PDF/assinatura real | OK |
| Migrations não aplicadas | OK |
| Testes + build | OK |
| Relatório | OK |

**GATE Phase 10.4: APROVADO para conclusão técnica (sem commit / sem activate).**

---

## 26. Próxima fase recomendada

**Phase 10.5 — Contract Instance Lifecycle & Generation Pipeline (ainda atrás de flags)**  
Foco sugerido: instanciação de contrato a partir de template publicado, snapshots, sem cutover do legado e sem PDF/assinatura externa até gates seguintes.
