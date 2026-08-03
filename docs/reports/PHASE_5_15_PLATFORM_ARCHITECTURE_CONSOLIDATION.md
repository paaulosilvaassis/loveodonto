# Phase 5.15 — Platform Architecture Consolidation

**Status:** CONCLUÍDA  
**Baseline testes (Phase 5.14):** 1329 pass | 1 skip  
**Regressão final:** 1354 pass | 1 skip (+25)  
**Commit:** não realizado

---

## 1. Auditoria dos repositories existentes

### 1.1 Inventário por domínio

| Domínio | Path | Arquivos | Fases | Authority (flags OFF) |
|---------|------|----------|-------|------------------------|
| **Collaborators (RH)** | `src/repositories/collaborator/` | 15 | 5.1–5.4 | IndexedDB |
| **Clinic Profile** | `src/repositories/clinicProfile/` | 9 | 5.5–5.6 | IndexedDB |
| **Agenda** | `src/repositories/agenda/` | 9 | 5.7–5.10 | IndexedDB |
| **Financeiro** | `src/repositories/financial/` | 12 | 5.11–5.14 | IndexedDB |

### 1.2 Camadas implementadas

| Camada | RH | Clinic | Agenda | Financial |
|--------|:--:|:------:|:------:|:---------:|
| `{domain}Types.ts` | ✅ | ✅ | ✅ | ✅ |
| `{domain}RepositoryFlags.ts` | ✅ | ✅ | ✅ | ✅ |
| `{domain}Mapper.ts` | ✅ | ✅ | ✅ | ✅ |
| `{domain}IndexedDbRepository.ts` | ✅ | ✅ | ✅ | ✅ |
| `{domain}Cache.ts` | ✅ | ✅ | ✅ | ✅ |
| `{domain}AdminApiRepository.ts` | ✅ (Supabase direto legado) | ✅ | ✅ | ✅ |
| `{domain}RepositorySync.ts` | ✅ | ✅ | ✅ | ✅ |
| `{domain}Repository.ts` (facade) | ✅ | ✅ | ✅ | ✅ |
| Bridge | `collaboratorServiceRepositoryBridge.js` | `clinicProfileServiceRepositoryBridge.js` | `agendaRepositoryBridge.js` | `financialRepositoryBridge.js` |
| ReadAdapter | ✅ | ✅ | ✅ | ✅ |
| WriteAdapter | ✅ | ✅ | ✅ | ✅ |
| Idempotency | ➖ | ➖ | ➖ | ✅ `financialWriteIdempotency.ts` |
| Write Audit | ➖ | ➖ | ➖ | ✅ `financialWriteAudit.ts` |
| Soak metrics | ✅ (RH soak) | ➖ | ✅ | ✅ |

### 1.3 Admin API (server)

| Domínio | List | Write | Rotas base |
|---------|:----:|:-----:|------------|
| RH | ✅ | parcial (provision, permissions, assets) | `/internal/app/collaborators` |
| Clinic Profile | ✅ | ✅ (update) | `/internal/app/clinic-profile` |
| Agenda | ✅ | ✅ (create/update/cancel) | `/internal/app/appointments` |
| Financeiro | ✅ | ✅ (receivables/payables/financings) | `/internal/app/financial/*` |

### 1.4 Testes por domínio (arquitetura V3)

| Domínio | Foundation | Read Cutover | Write Cutover | Primary | Soak | API server |
|---------|:----------:|:------------:|:-------------:|:-------:|:----:|:----------:|
| RH | ✅ 30 | ✅ 10 | ✅ 13 | ➖ | ✅ 11 | ✅ 26+ |
| Clinic | ➖* | ✅ 12 | ✅ 14 | ➖ | ➖ | ➖ |
| Agenda | ✅ 20 | ✅ 20 | ✅ 15 | ➖ | ✅ 17 | ✅ 26 |
| Financial | ✅ 30 | ✅ 13 | ✅ 12 | ✅ 10 | ✅ 5 | ✅ 12 |

\* Clinic Profile reutiliza testes de read/write cutover sem arquivo `*Foundation*` dedicado — cobertura via `clinicProfileReadCutover` e `clinicProfileWriteCutover`.

### 1.5 Teste arquitetural cross-domain (novo)

`src/__tests__/repositoryV3ArchitectureContract.test.js` — **10 testes** validando:
- Estrutura foundation dos 4 domínios
- Existência da documentação e checklist
- Flags production-locked default `false`
- Production runtime lock (`import.meta.env.PROD`)
- Contrato Vitest isolation
- Bridges e write adapters
- `PRODUCTION_SUPABASE_PROJECT_REF` unificado

---

## 2. Padrões consolidados

### 2.1 Repository Pattern V3 (normativo)

Documento oficial: [`docs/platform/LOVE_ODONTO_V3_REPOSITORY_PATTERN.md`](../platform/LOVE_ODONTO_V3_REPOSITORY_PATTERN.md)

**Fluxo canônico:**

```
UI → Service legado (IDB authority)
  → ReadAdapter / WriteAdapter
  → RepositoryBridge (flags + remote clients)
  → {Domain}Repository (facade)
  → IDB | Cache | AdminApiRepository
  → server/lib/{domain}Api*.js
  → Supabase (SSOT quando flags ativas)
```

### 2.2 Padrões repetidos (100% dos domínios)

| Padrão | Implementação |
|--------|---------------|
| **Feature flags** | `{domain}RepositoryFlags.ts` — defaults `false`, validação de dependências |
| **Production locks** | `applyProductionSafeLocks()` + `lockDangerous*Flags()` em `PROD` |
| **Supabase prod guard** | `PRODUCTION_SUPABASE_PROJECT_REF = uoepkwhqztmsjnzirpev` |
| **Read cutover** | ReadAdapter: `fromRepo !== null ? repo : loadDb()` |
| **Shadow read** | `scheduleMicrotask` / `queueMicrotask` pós-retorno legado |
| **Compare mode** | Diff IDB vs remote; nunca altera retorno ao usuário |
| **Dual write** | IDB síncrono → microtask → remote (resultado shadow ou hydrate) |
| **Hydrate** | `{domain}RepositorySync.ts` — espelha remote no IDB |
| **Cache/Fallback** | Memória + IDB quando remote indisponível/offline |
| **Admin API tenant** | Tenant via Core Tenant; proibido no body/query |
| **Vitest isolation** | `rhTestFlagContract.js` + `applyVitestIsolationContract()` |
| **Logs DEV** | `if (import.meta.env?.DEV) console.debug(...)` |
| **Fases incrementais** | N.1 Foundation → N.2 Read → N.3 Write → N.4 Primary/Soak |

### 2.3 Convenções Admin API

- Prefixo: `/internal/app/{resource}`
- Auth: `requireAppUser`
- Listagem: paginação `page`, `pageSize`
- Tabela ausente: `503` + code `*_TABLE_MISSING`
- Body write: snake_case no server; camelCase no cliente via mapper

---

## 3. Divergências encontradas

### 3.1 Naming de flags

| Capacidade | RH | Clinic | Agenda | Financial |
|------------|-----|--------|--------|-----------|
| Read | `RH_SUPABASE_READ` | `CLINIC_PROFILE_READ` | `AGENDA_READ` | `FINANCIAL_READ` |
| Shadow | `RH_SHADOW_READ` | `CLINIC_PROFILE_SHADOW_READ` | `AGENDA_SHADOW` | `FINANCIAL_SHADOW` |
| Compare | `RH_COMPARE_IDB_SUPABASE` | `CLINIC_PROFILE_COMPARE_IDB_REMOTE` | `AGENDA_COMPARE` | `FINANCIAL_COMPARE` |

**Recomendação:** novos domínios adotar padrão curto Agenda/Financial (`{DOMAIN}_SHADOW`, `{DOMAIN}_COMPARE`).

### 3.2 Naming de bridges/adapters

| Domínio | Bridge | Write Adapter |
|---------|--------|---------------|
| RH | `collaboratorServiceRepositoryBridge` | `collaboratorServiceWriteAdapter` |
| Clinic | `clinicProfileServiceRepositoryBridge` | `clinicProfileServiceWriteAdapter` |
| Agenda | `agendaRepositoryBridge` | `agendaWriteAdapter` |
| Financial | `financialRepositoryBridge` | `financialWriteAdapter` |

**Recomendação:** padronizar `{domain}RepositoryBridge.js` + `{domain}WriteAdapter.js` em migrações futuras (sem renomear legado existente).

### 3.3 Capacidades exclusivas

| Recurso | Domínio | Notas |
|---------|---------|-------|
| `RH_IDB_WRITE_DISABLED` | RH | Cutover avançado — desabilita IDB write |
| `RH_ALLOW_SYNTHETIC_STUBS` | RH | Compatibilidade `col-saas-*` (transitório) |
| `FINANCIAL_DUAL_WRITE` | Financial | Shadow write explícito separado de `WRITE` |
| `FINANCIAL_WRITE_PRIMARY` | Financial | Primary write com hydrate |
| `FINANCIAL_WRITE_COMPARE` | Financial | Diff pós-write |
| Idempotency + Audit | Financial | `correlation_id` + `idempotency_key` |
| `collaboratorSupabaseRepository.ts` | RH | Cliente Supabase direto (legado RH) |
| Shadow diff classification | RH | `collaboratorShadowDiffClassification.ts` |
| QA IDB hydrate | RH | `collaboratorQaIdbHydrate.ts` |

### 3.4 Write path

| Domínio | Pattern atual | WRITE_PRIMARY |
|---------|---------------|---------------|
| RH | Write direto + hydrate | ➖ |
| Clinic | Dual-write update only | ➖ |
| Agenda | Dual-write create/update/cancel | ➖ (usa `AGENDA_WRITE`) |
| Financial | Dual-write + Primary + Soak | ✅ `FINANCIAL_WRITE_PRIMARY` |

### 3.5 Foundation tests

Clinic Profile não possui `clinicProfileRepositoryFoundation.test.js` — divergência de cobertura vs outros domínios.

---

## 4. Recomendações de padronização

### 4.1 Prioridade alta (próximas migrações)

1. **Naming flags:** `{DOMAIN}_READ`, `{DOMAIN}_READ_PRIMARY`, `{DOMAIN}_WRITE`, `{DOMAIN}_WRITE_PRIMARY`, `{DOMAIN}_DUAL_WRITE`, `{DOMAIN}_SHADOW`, `{DOMAIN}_COMPARE`, `{DOMAIN}_WRITE_COMPARE`
2. **Naming arquivos:** `{domain}RepositoryBridge.js`, `{domain}ReadAdapter.js`, `{domain}WriteAdapter.js`
3. **Foundation test obrigatório** em N.1 para todo domínio novo
4. **Idempotency + audit** replicar padrão Financial em domínios com write de alto volume
5. **Soak module** (`{domain}WriteSoak.ts`) em todo domínio com write cutover

### 4.2 Prioridade média (dívida técnica — sem alterar agora)

1. Adicionar `clinicProfileRepositoryFoundation.test.js` (backfill de cobertura)
2. Documentar equivalência `AGENDA_WRITE` ≈ write primary em Agenda
3. Unificar prefixo RH `RH_SUPABASE_*` → `RH_*` (breaking change — apenas em major cutover)

### 4.3 Prioridade baixa

1. Renomear bridges legados para padrão canônico (cosmético)
2. Extrair `repositoryV3BaseFlags.ts` compartilhado (avaliar YAGNI)

---

## 5. Checklist oficial de migração

**Documento:** [`docs/playbooks/REPOSITORY_V3_MIGRATION_CHECKLIST.md`](../playbooks/REPOSITORY_V3_MIGRATION_CHECKLIST.md)

Resumo das fases:

| Fase | Entregáveis |
|------|-------------|
| **N.1 Foundation** | Types, flags, mapper, IDB, cache, facade, foundation test |
| **N.2 Read Cutover** | Admin API GET, ReadAdapter, shadow/compare |
| **N.3 Write Cutover** | Admin API write, WriteAdapter dual-write |
| **N.4 Write Primary** | WRITE_PRIMARY, hydrate, soak |
| **N.5 Promote** | Homologação staging 48–72h, aprovação formal |

---

## 6. Template oficial para futuras phases

**Documento:** [`docs/reports/PHASE_REPORT_TEMPLATE.md`](./PHASE_REPORT_TEMPLATE.md)

16 seções padrão: objetivo, escopo, auditoria, arquitetura, flags, dual/shadow/primary, idempotência, fallback, Admin API, arquivos criados/modificados, testes, regressão, riscos, recomendações, confirmações finais.

---

## 7. Matriz de flags

**Documento:** [`docs/platform/REPOSITORY_V3_FLAG_MATRIX.md`](../platform/REPOSITORY_V3_FLAG_MATRIX.md)

### Modelo alvo para novos domínios

```
{DOMAIN}_READ=false
{DOMAIN}_READ_PRIMARY=false
{DOMAIN}_WRITE=false
{DOMAIN}_WRITE_PRIMARY=false
{DOMAIN}_DUAL_WRITE=false
{DOMAIN}_SHADOW=false
{DOMAIN}_COMPARE=false
{DOMAIN}_WRITE_COMPARE=false
```

**Contrato Vitest:** `src/__tests__/rhTestFlagContract.js` — todas default `'false'`.

---

## 8. Matriz de testes obrigatórios

| Categoria | Arquivo padrão | Quando |
|-----------|----------------|--------|
| **Foundation** | `{domain}RepositoryFoundation.test.js` | N.1 |
| **Flags** | `{domain}RepositoryFlags.test.js` ou contrato | N.1 |
| **Bridge wiring** | `{domain}RepositoryBridge.test.js` | N.1–N.2 |
| **Read cutover** | `{domain}ReadCutover.test.js` | N.2 |
| **Write cutover** | `{domain}WriteCutover.test.js` | N.3 |
| **Write primary** | `{domain}WritePrimary.test.js` | N.4 |
| **Soak validation** | `{domain}WriteSoakValidation.test.js` | N.4 |
| **Admin API list** | `{domain}ApiList.test.js` (server) | N.2 |
| **Admin API write** | `{domain}ApiWrite.test.js` (server) | N.3 |
| **Cross-domain** | `repositoryV3ArchitectureContract.test.js` | Toda consolidação |
| **Flag contract** | Entrada em `rhTestFlagContract.js` | Toda fase |

### Invariantes testados (cross-domain)

- Arquivos foundation presentes
- Flags production-locked default `false`
- `PROD` runtime força lock
- `applyVitestIsolationContract` neutraliza env perigosos
- `PRODUCTION_SUPABASE_PROJECT_REF` unificado
- Bridges e write adapters existentes

---

## 9. Matriz de riscos

| Risco | Severidade | Mitigação atual | Domínios afetados |
|-------|------------|-----------------|-------------------|
| Flag ON acidental em produção | **Crítica** | `applyProductionSafeLocks` + defaults false | Todos |
| Env staging vazando para Vitest | **Alta** | `applyVitestIsolationContract` | Todos |
| Falha remota em dual-write corrompe IDB | **Alta** | IDB grava primeiro; remote async | Clinic, Agenda, Financial |
| Divergência IDB vs Supabase não detectada | **Média** | Shadow + Compare + soak | Todos com read |
| Tenant_id no body/query | **Alta** | Guards server + convenção Admin API | Todos |
| Tabela Supabase ausente crash app | **Média** | 503 `*_TABLE_MISSING` | Todos |
| Naming inconsistente entre domínios | **Baixa** | Documentação V3 + modelo alvo | Legado RH/Clinic |
| RH synthetic stubs em produção | **Média** | `RH_ALLOW_SYNTHETIC_STUBS` não locked (transitório) | RH |
| Write sem idempotência duplica registros | **Média** | Idempotency Financial; replicar em novos | Financial apenas |
| Promoção staging sem soak | **Alta** | Checklist N.5 + aprovação formal | Todos |

---

## 10. Próximos domínios recomendados

Ordem sugerida por **prontidão**, **isolamento**, **valor de negócio** e **complexidade**:

| Prioridade | Domínio | Services principais | Complexidade | Justificativa |
|:----------:|---------|---------------------|:------------:|---------------|
| **1** | **CRM / Kanban** | `crmService`, `crmPipelineStageService`, `crmTaskService`, `crmTagService` | Média | Alto valor; entidades relativamente isoladas; docs em `docs/modules/CRM.md` |
| **2** | **Patient Journey** | `patientFlowService`, `journeyEntryService`, `gestaoAtendimentoService` | Média-Alta | Fluxo operacional crítico; depende parcialmente de Agenda (já migrada) |
| **3** | **Prontuário** | `patientRecordService`, `patientChartService`, `patientAnamnesisService`, `patientOdontogramV2Service` | **Alta** | Core clínico; muitas sub-entidades; docs `docs/modules/prontuario.md` |
| **4** | **Contratos** | `contractModuleService`, `contractSignatureAuditService` | Alta | Integração assinatura/PDF; parcialmente coberto por testes de contrato existentes |
| **5** | **Consentimentos** | `clinicalTcleAttachmentService` | Média | Escopo menor; compliance LGPD |
| **6** | **Convênios** | `convenioService`, `convenioDashboardService` | Média | Relacionado a Financeiro (já migrado) |
| **7** | **Estoque** | `inventoryService`, `suppliersService` | Média | Domínio operacional isolado |
| **8** | **Relatórios** | `reportsService`, `crmReportsService`, `dashboardMetricsService` | Baixa-Média | Predominantemente read-only; candidato a read-cutover primeiro |

**Recomendação formal:** iniciar **Phase 6.1 — CRM Foundation** após aprovação desta phase, seguindo checklist N.1.

---

## 11. Artefatos entregues (Phase 5.15)

| Artefato | Path |
|----------|------|
| Padrão Repository V3 | `docs/platform/LOVE_ODONTO_V3_REPOSITORY_PATTERN.md` |
| Matriz de flags | `docs/platform/REPOSITORY_V3_FLAG_MATRIX.md` |
| Matriz de guards | `docs/platform/REPOSITORY_V3_PRODUCTION_GUARDS.md` |
| Checklist migração | `docs/playbooks/REPOSITORY_V3_MIGRATION_CHECKLIST.md` |
| Template relatório | `docs/reports/PHASE_REPORT_TEMPLATE.md` |
| Teste arquitetural | `src/__tests__/repositoryV3ArchitectureContract.test.js` |
| Índice platform atualizado | `docs/platform/README.md` |
| Índice playbooks atualizado | `docs/playbooks/README.md` |
| Este relatório | `docs/reports/PHASE_5_15_PLATFORM_ARCHITECTURE_CONSOLIDATION.md` |

---

## 12. Resultado da regressão

```
Test Files  140 passed (140)
Tests       1354 passed | 1 skipped (1355)
Duration    34.90s
```

**Delta vs Phase 5.14:** +25 testes (10 cross-domain + demais já presentes no workspace).

---

## 13. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ |
| Frontend funcionalmente idêntico (flags OFF) | ✅ |
| Contratos HTTP não alterados | ✅ |
| Payloads não alterados | ✅ |
| Legado não removido | ✅ |
| Novo domínio não migrado | ✅ |
| Commit não realizado | ✅ |

---

**FIM Phase 5.15 — aguardar aprovação formal.**
