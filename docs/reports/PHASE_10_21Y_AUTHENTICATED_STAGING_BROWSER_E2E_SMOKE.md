# PHASE_10.21Y — AUTHENTICATED STAGING BROWSER E2E SMOKE

**Status:** COMPLETE — autenticado staging **PASS**; E2E draft→signed package **PASS (10.21AC)**  
**Gate:** `STAGING_BROWSER_E2E_PASS`  
**Production writes:** **ZERO** (por construção — stack isolada)  
**Production migrations / rollout / commit / push / deploy:** **NÃO**

---

## PHASE_10.21Z — Root cause do primeiro CTA (staging)

### First failing CTA
**Criar novo orçamento** (`PatientBudgetsContractsTab` → `StartPatientBudgetModal` → `createNewBudget`)

### Instrumentação (sem tokens)
| Campo | Valor |
|-------|--------|
| Botão | Confirmar e abrir planejamento / Criar novo orçamento |
| Arquivo | `src/services/clinicalBudgetHubService.js` |
| Handler | `createNewBudget` → `startNewBudgetForPatient` |
| patientId | presente (URL/cadastro) |
| appointmentId | **ausente** antes do fix |
| HTTP | N/A (fluxo IndexedDB local; auth staging `tckd…` 200) |
| Navigation antes | `/gestao-comercial/jornada-do-paciente` (forçada) |
| Navigation depois | `/atendimento-clinico/{appointmentId}` |

### Classificação
**I — appointmentId perdido/ausente** (+ UX D: erro silenciado por navigate forçado)

`InactiveClinicalSessionError`: exigia `appointments.status === em_atendimento`. Sem sessão, o CTA redirecionava para a Jornada e o smoke “timeoutava”.

### Fix (mínimo)
- `ensureActiveClinicalAppointmentId(user, patientId)`: reutiliza / promove / cria encaixe `EM_ATENDIMENTO`
- Remove navigate forçado em falha (`PatientBudgetsContractsTab`, `BudgetsHubPage`)
- Trace staging: `window.__STAGING_CTA_TRACE__` (sem secrets)
- Seed auxiliar staging: `ensureStagingFictionalPriceBase` (somente `STAGING_TEST_MODE`)

### Retest
`FIRST_CTA_RETEST = PASS`  
→ navega para `atendimento-clinico/appt-…` com events `create_new_budget_start` → `ensure_active_created` → `create_new_budget_ok`

### Second blocker (não é timeout do 1º CTA)
**Gerar contrato** visível mas **disabled** (`canGenerate=false` — checklist de readiness / pré-requisitos clínicos).  
Fluxo parcial 10.21Z alcançou: paciente → criar orçamento → procedimento → gerar orçamento → aprovar → aba Contrato.

### Artefatos 10.21Z
- `docs/reports/_phase1021z_first_cta_diag.json`
- `docs/reports/_phase1021z_first_cta_retest.json`
- `docs/reports/_phase1021z_flow_continue.json`
- `src/__tests__/phase1021zBudgetCtaInactiveSessionFix.test.js`

---

## 1. Stack staging isolada

| Serviço | URL | Project |
|---------|-----|---------|
| Admin API staging | `http://127.0.0.1:3011` | `tckdjyunwmdpqmewrwvt` |
| Vite staging browser | `http://127.0.0.1:5188` | `tckdjyunwmdpqmewrwvt` |

- `STAGING_TEST_MODE` ativo  
- `CONTRACTS_V2_DELIVERY_MODE=disabled`  
- Ports **3001/5176/5177** (stack local production) **não foram mortas** — smoke usou portas alternativas para evitar impacto  
- Bundle Vite: contém `tckd…`, **não** contém host production `uoep….supabase.co`  
- API health: `ok:true` com staging

Launcher: `scripts/staging/launchStagingIsolated.mjs`

---

## 2. Login

| Item | Resultado |
|------|-----------|
| Credencial doc `paulo+staging@…` | **INVALID** (`Invalid login credentials`) |
| Provisionamento staging fictício | **SIM** — `smo***@implanprime.test` (auth + `tenant_users` master/active) |
| Login browser | **PASS** → `/gestao/dashboard` |
| Senha/token no relatório | **NÃO impressos** |

Credenciais locais gitignored: `scripts/staging/.staging_smoke_creds.local`

---

## 3–14. Resultado do smoke visual autenticado

Artefato: `docs/reports/_phase1021y_browser_smoke_result.json`  
Shots: `docs/reports/_phase1021y_shots/`

| Passo | Resultado |
|-------|-----------|
| Banner `STAGING — DADOS FICTÍCIOS — NÃO É PRODUÇÃO` | **PASS** |
| Browser project `tckdjyunwmdpqmewrwvt` | **PASS** |
| Production ref na UI/bundle | **NÃO detectado** |
| Login | **PASS** |
| Paciente `TESTE PACKAGE MANIFEST BROWSER 1021Y` | **PASS** (smoke deep posterior) |
| Orçamento / Contrato / TCLE / LGPD | **NÃO EXECUTADO** até assinatura/evidence |
| Package / Freeze | **NÃO EXECUTADO** |
| Página pública / Sign gate visual | **NÃO EXECUTADO** |
| Mobile (sem scroll horizontal na página atual) | **PASS** (smoke parcial) |
| Assinatura / Evidence / Prontuário | **NÃO EXECUTADO** |
| Comunicação externa | **disabled** |

Scripts:

- `scripts/staging/runAuthenticatedStagingBrowserSmoke1021Y.mjs`  
- `scripts/staging/runAuthenticatedStagingBrowserSmoke1021Y_deep.mjs` (**completou**: login+paciente PASS; CTAs orçamento/contrato timeout)

---

## 15. Produção

| Check | Resultado |
|-------|-----------|
| Supabase smoke target | somente `tckdjyunwmdpqmewrwvt` |
| API smoke | `127.0.0.1:3011` (staging env) |
| Writes production | **0** (nenhum client production usado no smoke) |
| Rollout / feature_flags production | **não alterados** (nenhuma chamada) |
| Migrations | **nenhuma** |

> Prova de “production untouched” = isolamento de env + ausência de operações contra `uoep…` nesta fase.  
> Leitura SQL em production foi **evitada** (hard boundary da autorização).

---

## 16. Bugs

| Sev | Item |
|-----|------|
| High | Fluxo clínico completo (paciente→orçamento→contrato→TCLE/LGPD→freeze→assinatura) **não automatizável** nesta sessão sem driver UI mais profundo / seleção de campos IndexedDB |
| Medium | Credencial staging documentada (`paulo+staging@…`) inválida — auth user ausente/senha divergente |
| Low | `console/.env` production ainda gera **aviso** no boot da API staging (mismatch console vs backend); backend permanece staging |

Critical: **0**

---

## Resumo pedido

```
Environment: STAGING isolated (API :3011 + Vite :5188)
Login: PASS (usuário fictício staging provisionado)
Browser project: tckdjyunwmdpqmewrwvt
API project: tckdjyunwmdpqmewrwvt
Production detected: NO (no smoke stack)
Patient: PASS
Budget: PASS (primeiro CTA — PHASE_10.21Z)
Contract: BLOCKED (Gerar contrato disabled — readiness)
TCLE: NOT RUN
LGPD: NOT RUN
Package: NOT RUN
Freeze: NOT RUN
Public page: NOT RUN
Document views: NOT RUN
Sign gate: NOT RUN
Mobile: PASS (parcial)
Signature: NOT RUN
Evidence: NOT RUN
Prontuario: NOT RUN
External communication: disabled
Production writes: 0
Production rollout: unchanged
Bugs: 10.21Z fixed InactiveClinicalSession on Criar novo orçamento; remaining Gerar contrato readiness
Critical: 0
High: 1 (E2E visual completo ainda incompleto)
Medium: 1 (credencial doc staging inválida)
Low: 1
Decision: Isolamento + login + paciente + primeiro CTA orçamento OK; contrato→assinatura ainda bloqueado por readiness
Gate: BLOCKED
```

### PHASE_10.21AA — Contract readiness

- **First readiness blocker:** endereço/foro da clínica (também CRO técnico, endereço paciente, pagamento, TCLE)
- **SSOT:** `getContractReadinessChecklist` → `canGenerate`
- **Circular TCLE↔Gerar contrato:** **NÃO**
- **CONTRACT_GENERATE_RETEST:** **PASS**
- **Next blocker:** modal `GenerateContractModal` → **Gerar rascunho** / draft finalize
- Relatório: `docs/reports/PHASE_10_21AA_CONTRACT_READINESS_BLOCKER_RESOLUTION.md`

### PHASE_10.21Z summary block

```
First failing CTA: Criar novo orçamento
Root cause: I — appointmentId ausente (InactiveClinicalSessionError + navigate forçado)
File/function: clinicalBudgetHubService.js → ensureActiveClinicalAppointmentId / createNewBudget
Endpoint: N/A (IndexedDB local; auth/tenant-context staging OK)
HTTP status: N/A (sem request de create-budget)
State lost: appointmentId (EM_ATENDIMENTO)
Fix: ensure sessão clínica ativa + feedback sem redirect forçado
First CTA retest: PASS
Second blocker: Gerar contrato disabled (readiness/canGenerate)
Full E2E: FAIL
Production writes: ZERO
Rollout changes: ZERO
Tests: PASS (10.21Z + 10.21X + 10.21V + 10.21U + 10.21R)
Build: PASS
Remaining blockers: pré-requisitos Gerar contrato (CRO/endereço/TCLE/checklist) → TCLE → LGPD → package → freeze → pública → assinatura
Gate: BLOCKED
```

### PHASE_10.21AB smoke update (2026-08-12)

```
Draft generation: PASS (fix hex + clinical skipHashtagValidation)
Draft blocker: CSS #000/#fff as false hashtags
Finalize: PASS (retest após fix)
LGPD / Package 3 / Freeze / Envelope link: PASS em smoke parcial + bridge staging OPTION_C
Public → sign → evidence → prontuário → mobile: FAIL (corrida IndexedDB/generatedContracts)
Production writes/migrations/rollout/external: ZERO
Tests: PASS (AB + AA/Z/U/V/X lote)
Build: PASS
Gate: BLOCKED
Relatório: docs/reports/PHASE_10_21AB_DRAFT_TO_SIGNED_PACKAGE_E2E_COMPLETION.md
```

### PHASE_10.21AC smoke update (2026-08-12)

```
Persistence root cause: IDB LWW + init clobber + HMR dual-module db cache
Persistence fix: globalThis singleton + flush coalesce + withDb reentrante
CONTRACT_PERSISTENCE_STABLE: PASS
DRAFT_PERSISTENCE_BROWSER: PASS
READINESS_SEND_GATE: PASS_WITHOUT_BYPASS
Public → views → sign gate → acceptances → signature → evidence → prontuário → mobile: PASS
Production writes/migrations/rollout/external: ZERO
Tests: PASS (AC + AB/AA/Z/X/V/U/R lote)
Build: PASS
Gate: STAGING_BROWSER_E2E_PASS
Relatório: docs/reports/PHASE_10_21AC_STABLE_PERSISTENCE_AND_BROWSER_E2E_COMPLETION.md
Artifact: docs/reports/_phase1021ac_full_e2e.json
```

---

## Como Paulo continua (manual, opcional)

1. Manter stack staging isolada (`5188` / `3011`)
2. Abrir `http://127.0.0.1:5188` — banner STAGING
3. Login smoke staging (gitignored)
4. Opcional: revalidar visualmente um paciente fictício

---

## HARD STOP (respeitado)

- Sem migration production  
- Sem commit/push/deploy  
- Sem paciente real  
- Sem rollout change  
- Sem WhatsApp/e-mail/SMS reais  

**Aguardar Paulo.**
