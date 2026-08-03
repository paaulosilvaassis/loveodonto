# Love Odonto V3 — Homologação Funcional RH (Staging)

**Documento:** `docs/reports/RH_FUNCTIONAL_HOMOLOGATION_STAGE.md`  
**Ticket:** Sprint 1D — 1.14  
**Versão:** 1.0.0  
**Data:** 2026-06-30  
**Tipo:** Homologação funcional — **nenhum código, flag, banco ou schema alterado**  
**Ambiente:** Staging Supabase `tckdjyunwmdpqmewrwvt` · Tenant `7aba7127-409c-4ea4-8dbc-807efc5e189c`  
**Produção:** `uoepkwhqztmsjnzirpev` — **não tocada**

---

## Sumário executivo

| Dimensão | Resultado |
|----------|-----------|
| Arquitetura Repository + IDB primário | **Consolidada** (Sprint 1C) |
| Testes automatizados RH | **220/220 PASS** (25 arquivos) |
| Shadow Read QA (blockers) | **0 blockers** (`canPromoteReadPrimary: true` classificador) |
| Shadow Read QA (transitional) | **4 pendentes** (UUID local não espelhado no export/IDB live) |
| Homologação manual UI (browser staging) | **Não executada nesta sessão** |
| Cutover `RH_SUPABASE_READ_PRIMARY` | **Não realizado** (escopo do ticket) |

### Decisão Go / No-Go — `RH_SUPABASE_READ_PRIMARY=true` em staging

## **NO-GO**

**Justificativa técnica:**

1. **Cutover explícito fora de escopo** — este ticket homologa a arquitetura atual (IDB primário). Ativar leitura primária Supabase é mudança de flag/comportamento não executada nem validada em fluxo real.
2. **Shadow operacional incompleto** — em `2026-06-30T19:08:44Z`, `transitionalDiffCount=4` e `invalid_uuid` local=4 porque o mirror UUID (Ticket 1.13) **não foi aplicado** no IDB live / export usado pelo CLI (`--apply-to-export` / browser snippet pendentes de execução operacional).
3. **Checklist UI manual pendente** — abas da ficha (telefones, endereço, horários, fotos upload, exclusão/restauração visual) não foram exercitadas em sessão browser staging nesta homologação.
4. **Escritas permanecem IDB** — `RH_SUPABASE_WRITE=false`; promoção de leitura primária sem dual-write validado aumenta risco de divergência silenciosa pós-cutover.

**Condições para GO futuro (Ticket 1.15+):**

- Executar mirror UUID no IDB staging (browser snippet ou `--apply-to-export` + re-export).
- Shadow QA com `transitionalDiffCount=0`, `blockingDiffCount=0`.
- Smoke manual UI em `CollaboratorsPage` (mínimo 4 colaboradores staging).
- Plano de rollback de flag documentado.

---

## Estado arquitetural validado (somente leitura)

```
Services RH → collaboratorServiceReadAdapter
           → collaboratorServiceRepositoryBridge
           → collaboratorRepository
           → collaboratorIndexedDbRepository (fonte primária)
           + shadow fire-and-forget → Supabase (RH_SHADOW_READ=true)
```

**Flags staging documentadas (inalteradas):**

| Flag | Valor homologação |
|------|-------------------|
| `VITE_RH_SUPABASE_READ` | `true` |
| `VITE_RH_SHADOW_READ` | `true` |
| `VITE_RH_COMPARE_IDB_SUPABASE` | `true` |
| `VITE_RH_SUPABASE_READ_PRIMARY` | **`false`** |
| `VITE_RH_SUPABASE_WRITE` | **`false`** |

---

## Evidências automatizadas

### Suite Vitest RH — 2026-06-30

```
Test Files  25 passed (25)
Tests       220 passed (220)
Duration    ~5.8s
```

**Arquivos executados (amostra representativa):**

| Arquivo | Testes | Foco |
|---------|--------|------|
| `collaboratorServiceFullReadAdoption.test.js` | 10 | Zero `loadDb()` direto nos services RH |
| `collaboratorServiceReadAdoption.test.js` | 11 | `listCollaborators` / `getCollaborator` via repository |
| `collaboratorServiceRepositoryBridge.test.js` | 13 | Shadow read não altera retorno IDB |
| `collaboratorShadowDiffClassification.test.js` | 14 | Classificação blocking/transitional/informational |
| `collaboratorAgendaEnabled.test.js` | 9 | Regra `agenda_enabled` alinhada (Ticket 1.12) |
| `collaboratorUuidMirror.test.js` | 12 | Mirror UUID (Ticket 1.13) |
| `collaborators.test.js` | 8 | CRUD, foto, financeiro, profissionais |
| `collaboratorAccess*.test.js` | vários | Acesso, convites, recovery, RBAC |
| `tenantCollaboratorList.test.js` | 4 | Integração tenant |
| `rhShadowReadQa.test.js` | 7 | QA shadow + query live staging |

### Shadow Read QA CLI — 2026-06-30T19:08:44Z

**Comando:** `node scripts/rh-shadow-read-qa.mjs` (read-only Supabase)

**Report:** `scripts/reports/rh-shadow-read-qa-2026-06-30T19-08-44-589Z.json`

| Métrica | Valor |
|---------|-------|
| `localCount` | 4 |
| `remoteCount` | 4 |
| `blockingDiffCount` | **0** |
| `transitionalDiffCount` | **4** (UUID local legacy fallback) |
| `informationalDiffCount` | **4** (`updated_at` backfill) |
| `canPromoteReadPrimary` | **true** (sem blockers) |
| `promotionBlockers` | `[]` |
| `writesExecuted` | **false** |

### UUID Mirror dry-run — 2026-06-30T19:08:45Z

**Comando:** `node scripts/rh-mirror-uuid-idb-qa.mjs` (dry-run)

**Report:** `scripts/reports/rh-mirror-uuid-idb-qa-2026-06-30T19-08-45-186Z.json`

| Métrica | Valor |
|---------|-------|
| `wouldUpdate` | 4 |
| `conflicts` | 0 |
| `applyToExport` | false |
| `supabaseWritesExecuted` | false |

---

## Legenda do checklist

| Símbolo | Significado |
|---------|-------------|
| **PASS-A** | Validado por teste automatizado |
| **PASS-S** | Validado por Shadow/QA CLI read-only |
| **PASS-C** | Evidência estática (código/rota existe; sem execução UI) |
| **PEND-M** | Pendente homologação manual browser staging |
| **N/A** | Fora do escopo deste ticket / não aplicável |

---

## Checklist funcional completo

### A. Listagem e navegação

| # | Item | Resultado | Evidência | Observações |
|---|------|-----------|-----------|-------------|
| A1 | Listagem de colaboradores | **PASS-A** | `collaboratorServiceReadAdoption.test.js`, `collaborators.test.js` | `listCollaborators` → repository `listLegacySync` |
| A2 | Busca | **PASS-C** | `CollaboratorsPage.jsx` filtro client-side | PEND-M: validar UX busca por nome/e-mail |
| A3 | Filtros (status, cargo, tenant) | **PASS-A** | `listLegacySync` filters; `tenantCollaboratorList.test.js` | SaaS tenant isolation coberto |
| A4 | Ordenação | **PASS-C** | UI `CollaboratorsPage` sort local | PEND-M: ordenação visual |
| A5 | Abrir ficha (`getCollaborator`) | **PASS-A** | `collaboratorServiceFullReadAdoption.test.js` | Perfil + satélites via repository |
| A6 | Editar ficha (sem mudar arquitetura) | **PASS-A** | `collaborators.test.js` `updateCollaborator` | Escrita continua `withDb` em service (fora escopo cutover) |

### B. Abas da ficha RH

| # | Item | Resultado | Evidência | Observações |
|---|------|-----------|-----------|-------------|
| B1 | Dados pessoais | **PASS-A** | `collaborators.test.js` create/update | PEND-M: tab `pessoais` UI |
| B2 | Telefones | **PASS-C** | `collaboratorIndexedDbRepository.getLegacySatellitesSync` → `phones` | PEND-M: CRUD telefones UI |
| B3 | Documentos | **PASS-A/C** | `updateCollaboratorDocuments` em service; tab `documentos` | Teste unitário parcial |
| B4 | Endereço | **PASS-C** | Satélite `addresses` via repository | PEND-M: UI endereço |
| B5 | Especialidades | **PASS-A** | `collaborators.test.js` + IDB row | Campo `especialidades[]` |
| B6 | Agenda (profissional) | **PASS-A** | `collaboratorAgendaEnabled.test.js` | Regra `isAgendaProfessional` |
| B7 | Horários de trabalho | **PASS-C** | `updateCollaboratorWorkHours`; tab `horarios` | PEND-M: UI horários |
| B8 | Permissões | **PASS-A** | `collaboratorCustomPermissions.test.js`, `collaboratorAccessManagement.test.js` | |
| B9 | Usuários vinculados | **PASS-A** | `collaboratorTenantLink.test.js`, `tenantCollaboratorList.test.js` | |
| B10 | Convites | **PASS-A** | `collaboratorInviteEmail.test.js`, `collaboratorSystemAccess.test.js` | |
| B11 | Fotos / Upload | **PASS-A** | `collaborators.test.js` `uploadCollaboratorPhoto` | Validação tipo/tamanho |
| B12 | Exclusão lógica (status inativo) | **PASS-C** | `CollaboratorsPage` toggle status; `updateCollaborator` | PEND-M: fluxo UI inativar |
| B13 | Restauração (reativar) | **PASS-C** | Mesmo toggle status | PEND-M: UI reativar |

### C. Profissionais e agenda

| # | Item | Resultado | Evidência | Observações |
|---|------|-----------|-----------|-------------|
| C1 | Profissionais da agenda | **PASS-A** | `listProfessionalOptionsLegacySync` + `isAgendaProfessional` | |
| C2 | `getProfessionalOptions()` | **PASS-A** | `collaborators.test.js`; `collaboratorServiceFullReadAdoption.test.js` | |
| C3 | Integração Agenda | **PASS-C** | `AgendaPage.jsx`, `AppointmentStep2DetailsModal.jsx` consomem colaboradores | PEND-M: criar agendamento staging |
| C4 | Juliana `agenda_enabled` shadow | **PASS-S** | Ticket 1.12 — blocker removido; `blockingDiffCount=0` | |

### D. Integrações cross-module

| # | Item | Resultado | Evidência | Observações |
|---|------|-----------|-----------|-------------|
| D1 | Integração Comercial | **PASS-C** | `ComercialFollowUpPage`, `ScheduleFromPatientModal` → `getProfessionalOptions` | PEND-M: follow-up staging |
| D2 | Integração Financeiro | **PASS-A/C** | `updateCollaboratorFinance`; `FinanceReceivablesPage` importa collaborators | Teste financeiro unitário |
| D3 | Integração Contratos | **PASS-C** | `composeProfessionalClinicalContract.js` | PEND-M: contrato com profissional |
| D4 | Integração Dashboard | **PASS-C** | `patientFlowDashboardService`, `gestaoAtendimentoDashboard` → `listCollaborators` | PEND-M: métricas dashboard |
| D5 | Integração Tenant | **PASS-A** | `tenantCollaboratorService.js` reads via repository; `tenantCollaboratorList.test.js` | |
| D6 | RBAC / permissões | **PASS-A** | `collaboratorAccessRole.test.js`, `collaboratorCustomPermissions.test.js` | Roles + custom permissions |

### E. Repository, shadow e QA

| # | Item | Resultado | Evidência | Observações |
|---|------|-----------|-----------|-------------|
| E1 | Leitura primária IndexedDB | **PASS-A** | `collaboratorServiceFullReadAdoption.test.js` | Zero `loadDb()` nos services RH |
| E2 | Shadow Read habilitado | **PASS-A** | `collaboratorServiceRepositoryBridge.test.js` | Fire-and-forget; não bloqueia UI |
| E3 | Shadow não altera retorno | **PASS-A** | Bridge tests | |
| E4 | Shadow QA sem blockers | **PASS-S** | Report `19-08-44-589Z` | `blockingDiffCount=0` |
| E5 | Shadow transitional UUID | **PEND-M** | `transitionalDiffCount=4` | Resolver com mirror 1.13 operacional |
| E6 | Classificação 1.11 | **PASS-A** | `collaboratorShadowDiffClassification.test.js` | |
| E7 | Mirror UUID (1.13) pronto | **PASS-A** | `collaboratorUuidMirror.test.js`; dry-run `wouldUpdate=4` | Aplicação live pendente |
| E8 | Produção bloqueada | **PASS-A** | `assertStagingSupabaseUrl` em scripts QA | |

### F. Admin / configurações

| # | Item | Resultado | Evidência | Observações |
|---|------|-----------|-----------|-------------|
| F1 | `AdminUsuariosPage` listagem | **PASS-C** | Import `listCollaborators`, `getCollaborator` | PEND-M: UI admin |
| F2 | `ConfiguracoesUsuariosPage` | **PASS-C** | Página existe; integração access | PEND-M |
| F3 | Recovery de acesso | **PASS-A** | `collaboratorAccessRecovery.test.js` | |
| F4 | Provisionamento acesso | **PASS-A** | `collaboratorSystemAccess.test.js` | |

---

## Riscos encontrados

| ID | Risco | Severidade | Mitigação |
|----|-------|------------|-----------|
| R1 | UUID local não espelhado → shadow transitional | Média | Executar mirror 1.13 no IDB staging antes do cutover |
| R2 | `updated_at` informational divergente (backfill) | Baixa | Esperado; não bloqueia promoção |
| R3 | Cutover read primary sem dual-write | Alta | Manter `RH_SUPABASE_READ_PRIMARY=false` até sprint dedicado |
| R4 | Homologação UI manual incompleta | Média | Smoke browser staging antes de GO |
| R5 | Módulos legados ainda referenciam `loadDb` fora do repository (outros domínios) | Baixa | Fora escopo RH; monitorar integrações |

---

## Pendências

| ID | Pendência | Responsável | Bloqueia GO? |
|----|-----------|-------------|------------|
| P1 | Aplicar mirror UUID no IDB staging (browser snippet) | Ops/Dev staging | **Sim** |
| P2 | Reexecutar shadow QA pós-mirror (`transitionalDiffCount=0`) | QA | **Sim** |
| P3 | Smoke manual `CollaboratorsPage` — 4 colaboradores, todas abas críticas | QA manual | **Sim** |
| P4 | Validar Agenda + Comercial com profissionais staging | QA manual | Recomendado |
| P5 | Ticket cutover flag `RH_SUPABASE_READ_PRIMARY` (Sprint 1D+ ) | Engenharia | **Sim** |

---

## Regressões

| Área | Status | Nota |
|------|--------|------|
| Suite RH 220 testes | **Sem regressão** | Todos PASS em 2026-06-30 |
| `agenda_enabled` shadow | **Corrigido** | Ticket 1.12 — não é mais blocker |
| Leitura via repository | **Sem regressão** | Ticket 1.9 adoption tests PASS |
| Comportamento UI | **Não avaliado** | Nenhuma sessão browser nesta homologação |

---

## Módulos dependentes do RH (legacy_id / collaborators)

| Módulo | Consumo | Impacto cutover futuro |
|--------|---------|------------------------|
| **Agenda** | `professionalId`, `getProfessionalOptions` | Alto — validar IDs pós-primary |
| **Comercial** | Profissionais em follow-up / agendamento | Médio |
| **Financeiro** | Comissões / `updateCollaboratorFinance` | Médio |
| **Contratos** | Profissional no contrato clínico | Médio |
| **Dashboard** | Métricas por colaborador | Baixo |
| **Tenant / Admin API** | `tenant_users.collaborator_id` text | Alto — não alterar text legado |
| **Prontuário / CRM** | Referências indiretas | Médio — fora checklist deste ticket |

---

## Recomendação final

### Homologação da arquitetura atual (IDB primário + Repository + Shadow)

**APTA** com ressalvas — base automatizada sólida (220 testes, shadow sem blockers, bridge estável).

### Promoção `RH_SUPABASE_READ_PRIMARY=true` em staging

## **NO-GO**

Motivos objetivos:

1. Mirror UUID não aplicado no ambiente operacional (`transitionalDiffCount=4`).
2. Homologação manual UI não executada nesta sessão.
3. Cutover de flag explicitamente fora de escopo e não testado em fluxo real.
4. Escritas permanecem 100% IndexedDB — cutover de leitura introduz risco sem dual-write observado.

### Próximo passo recomendado

**Ticket 1.15 — Staging Cutover Readiness:**

1. Executar `scripts/snippets/rh-mirror-uuid-idb-browser-snippet.js` logado no tenant staging.
2. Confirmar shadow QA: `transitionalDiffCount=0`, `blockingDiffCount=0`.
3. Smoke UI manual (checklist P3).
4. Somente então avaliar `RH_SUPABASE_READ_PRIMARY=true` com plano de rollback.

---

## Controle de integridade desta homologação

| Critério | Status |
|----------|--------|
| Zero alteração funcional | ✅ |
| Zero alteração arquitetura / flags / banco | ✅ |
| Zero commit | ✅ |
| Zero escrita Supabase | ✅ |
| Produção não tocada | ✅ |
| Documento entregue | ✅ |

---

*Gerado no âmbito do Ticket 1.14 — Sprint 1D. Evidências reproduzíveis via `npx vitest run src/__tests__/collaborator*.test.js src/__tests__/rhShadowReadQa.test.js src/__tests__/tenantCollaboratorList.test.js` e `node scripts/rh-shadow-read-qa.mjs`.*
