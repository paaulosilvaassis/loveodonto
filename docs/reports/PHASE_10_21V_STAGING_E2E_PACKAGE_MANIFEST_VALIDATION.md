# PHASE_10.21V — STAGING E2E PACKAGE MANIFEST VALIDATION

**Status:** VALIDATED (staging schema + domain E2E harness + SQL immutability)  
**Decision:** `READY_FOR_PACKAGE_MANIFEST_PRODUCTION_PREPARATION`  
**Gate:** `READY_FOR_PACKAGE_MANIFEST_PRODUCTION_PREPARATION`  
**Production modified:** **NO**  
**Rollout modified:** **NO**  
**036 production applied:** **NO** (hard stop)

---

## Autorização

Paulo autorizou E2E **exclusivamente em STAGING** com dados 100% fictícios.  
Produção **não** autorizada.

---

## PASSO 0 — Precheck

| Check | Resultado |
|-------|-----------|
| ENVIRONMENT | **STAGING** |
| Supabase project | `tckdjyunwmdpqmewrwvt` |
| Production ref used for remote | **NO** (`uoepkwhqztmsjnzirpev` recusado) |
| Credentials used | **somente** `STAGING_SUPABASE_*` |
| Migration 036 staging | **PRESENT / APPLIED** |
| Tabelas package + envelopes | **PRESENT** |
| Default `.env.local` Vite/SUPABASE_* | apontam para produção → **ignorados** pelo harness remoto |
| Webhook / WhatsApp / e-mail / SMS reais | **NÃO usados** |
| HARD STOP production | **respeitado** |

Artefato: `docs/reports/_phase1021v_staging_e2e_result.json`

---

## Escopo de prova (importante)

| Camada | Executado | Notas |
|--------|-----------|-------|
| Domain E2E harness (freeze→accept→sign→evidence→tenant→legacy→hash) | **YES** | vitest `phase1021vStagingE2ePackageManifestValidation.test.js` |
| Staging schema / columns 036 | **YES** | script `runStagingPackageManifestE2E1021V.mjs` |
| Staging SQL insert fictício + imutabilidade trigger | **YES** | manifesto FROZEN + CONTRACT/TCLE/LGPD |
| Browser UI contra staging (Vite) | **NO** | `.env.local` default → produção; **HARD STOP** evitou apontar UI para prod no teste |
| Comunicação externa | **NO** | proibida |

A prova criptográfica / acceptance / evidence / sign gate / legacy / tenant isolation foi feita no harness de domínio alinhado à implementação 10.21U. A prova de schema + triggers ocorreu em staging remoto.

---

## Dados fictícios

| Campo | Valor |
|-------|-------|
| Paciente | `TESTE PACKAGE MANIFEST 1021V` |
| E-mail | `teste.package.manifest.1021v@example.invalid` |
| Telefone | `+5500000000000` |
| CPF | `000.000.000-00` (fictício) |
| Financeiro | R$ 1.000,00 · entrada R$ 200,00 · 4× R$ 200,00 |
| Procedimento | Implante (fictício, para TCLE) |
| Real PII | **NO** |

Staging tenant usado no SQL: Implanprime Odontologia (Staging)  
`7aba7127-409c-4ea4-8dbc-807efc5e189c`

---

## Package / Manifesto

### Domain harness

| Item | Valor |
|------|-------|
| Manifest created | **YES** |
| Canonicalization | `pkg_manifest_v1` |
| Manifest hash | `5df19b12811feed4bae002fe73450e2000c9bb67eeb33d9374ba3d2d2b2ea7d6` |
| Contract hash | `d3acb74b84b2aa74d60210d92a767f124fdb0ec008ce51b7759995d461437a40` |
| TCLE hash | `6aac7834d54d1d8bc1073648be3f753518d88b2db762e43c09aec72aa2c77735` |
| LGPD hash | `fb13c7db359dbf063f5a3c26c9bbe3aff0b4e6969f63983abac9237846c0a560` |

Documentos (type / version / required / contentHash):

1. `SERVICE_CONTRACT` / `1` / required / contract hash acima  
2. `IMPLANT_CONSENT` (`tcle:tcle_implante`) / `tcle_implante_v1` / required / TCLE hash acima  
3. `LGPD_TERM` / `lgpd_clinic_policy_v1` / required / LGPD hash acima  

LGPD: hash do **conteúdo real versionado** — **não** hash estático legado `term_lgpd_notice_v1`.

### Staging SQL (persistido para auditoria)

| Item | Valor |
|------|-------|
| `manifestId` | `a1021102-cccc-4ccc-8ccc-ccccccccccc1` |
| status | `FROZEN` |
| docs | 3 (CONTRACT + TCLE + LGPD) |
| marker | `phase-10-21v-package-manifest-e2e` |

Artefato: `docs/reports/_phase1021v_staging_sql_immutability.json`  
Artefato domain: `docs/reports/_phase1021v_domain_e2e_result.json`

---

## Critérios críticos

| Critério | Resultado |
|----------|----------|
| Freeze | **PASS** |
| FROZEN_MANIFEST_MUTATION | **DENIED** (domain + staging SQL trigger) |
| Document mutation when frozen | **DENIED** (staging SQL) |
| Alteração documental exige novo manifesto | **PASS** |
| Public page docs (snapshots) | **PASS** (domain `buildPublicPackageDocumentsFromManifest`) |
| Individual visualization = snapshot | **PASS** |
| SIGN_GATE | **PASS** (bloqueia até CONTRACT+TCLE+LGPD) |
| Acceptances | **PASS** |
| ACCEPTANCE_IDEMPOTENCY | **PASS** |
| Signature fictícia + envelope bind | **PASS** |
| Evidence + PACOTE ASSINADO | **PASS** |
| Exact TCLE proof | **SIM** |
| Exact LGPD proof | **SIM** |
| SIGNED_PACKAGE_IMMUTABILITY | **PASS** |
| Prontuário (Documentos assinados) | **PASS** (domain wiring) |
| Tenant isolation | **PASS** (domain cross-tenant + RLS deny anon/authenticated select) |
| LEGACY_SIGNATURE_COMPATIBILITY | **PASS** |
| Hash integrity matrix | **PASS** (contrato/TCLE/LGPD/add/remove/version) |
| Tests 10.21T/U/V + TCLE regressão | **PASS** (46 tests) |
| `npm run build` | **PASS** |

RLS staging: `anon_select=false`, `authenticated_select=false` em `app_package_manifests` (deny-by-default; service_role only).

---

## Cleanup

Dados fictícios staging **PRESERVADOS PARA AUDITORIA** (`marker=phase-10-21v-package-manifest-e2e`).  
Schema/migration **não** removidos. Produção **não** tocada.

---

## Bugs encontrados

| Severidade | Qtd | Notas |
|------------|-----|-------|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 1 | Harness staging PostgREST usava `tenants.name` (coluna inexistente) → corrigido para `trade_name`/`legal_name` |
| Low | 1 | Default app env aponta produção; E2E browser staging exige env dedicada (não alterada nesta fase) |

---

## HARD STOP (respeitado)

- **NÃO** aplicar 036 em production  
- **NÃO** production migration  
- **NÃO** paciente real  
- **NÃO** alterar rollout  
- **NÃO** ativar outro tenant  
- **NÃO** piloto real  
- **NÃO** push/deploy adicional sem autorização

---

## Resumo executivo (checklist pedido)

```
Environment: STAGING
Supabase project: tckdjyunwmdpqmewrwvt
Patient: TESTE PACKAGE MANIFEST 1021V
Real PII: NO
External communication: NO
036 staging: APPLIED / PRESENT
036 production: NOT APPLIED
Package documents: CONTRACT + TCLE + LGPD
Manifest created: YES
Canonicalization: pkg_manifest_v1
Contract hash: d3acb74b84b2aa74d60210d92a767f124fdb0ec008ce51b7759995d461437a40
TCLE hash: 6aac7834d54d1d8bc1073648be3f753518d88b2db762e43c09aec72aa2c77735
LGPD hash: fb13c7db359dbf063f5a3c26c9bbe3aff0b4e6969f63983abac9237846c0a560
Manifest hash: 5df19b12811feed4bae002fe73450e2000c9bb67eeb33d9374ba3d2d2b2ea7d6
Freeze: PASS
Immutability: PASS (FROZEN_MANIFEST_MUTATION=DENIED)
Public page: PASS (domain)
Individual visualization: PASS
Sign gate: PASS
Acceptances: PASS
Idempotency: PASS
Signature: PASS (fictícia / harness)
Evidence: PASS
Exact TCLE proof: SIM
Exact LGPD proof: SIM
Evidence report: PASS (PACOTE ASSINADO)
Prontuario: PASS (domain)
Tenant isolation: PASS
Legacy: PASS
Hash integrity: PASS
Tests: PASS
Build: PASS
Cleanup: PRESERVED_FOR_AUDIT
Production modified: NO
Rollout modified: NO
Bugs found: 2 (0 critical / 0 high / 1 medium / 1 low)
Critical: 0
High: 0
Medium: 1
Low: 1
Decision: READY_FOR_PACKAGE_MANIFEST_PRODUCTION_PREPARATION
Gate: READY_FOR_PACKAGE_MANIFEST_PRODUCTION_PREPARATION
```

---

## Próximo passo (aguarda Paulo)

Preparação de produção do package manifest **somente** após autorização explícita.  
Ainda **não** aplicar 036 em production sem confirmação humana.
