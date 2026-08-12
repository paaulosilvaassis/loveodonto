# PHASE_10.21W — PRODUCTION MIGRATION DEPENDENCY + BROWSER STAGING READINESS AUDIT

**Modo:** AUDITORIA SOMENTE LEITURA / PREPARAÇÃO  
**Status:** COMPLETE  
**Data:** 2026-08-12  
**Production modified:** **NO**  
**Staging modified:** **NO**  
**Env altered:** **NO**  
**Rollout altered:** **NO**  
**Migrations applied:** **NO**  
**Commit/push/deploy:** **NO**

---

## Resumo executivo

Production (`uoepkwhqztmsjnzirpev`) **não possui** a fundação Contracts V2 (`app_contracts`, envelopes, signers, sessions, packages, ledger, etc.). Staging (`tckdjyunwmdpqmewrwvt`) possui a fundação **028–032 + 034 + 035** e **036** aplicada.

**036 sozinha é BLOCKED em production** — FKs apontam para tabelas ausentes.

O frontend local atual (`.env.local` + `server/.env` + `console/.env`) aponta **produção**. Existe `.env.staging.local.example`, mas **não** há `.env.staging.local` ativo nem fail-closed de boot. Browser smoke staging **ainda não é seguro**.

**Gate:** `READY_FOR_ISOLATED_STAGING_BROWSER_SMOKE`

---

## Identidade dos projetos

| | Ref | Nome operacional |
|--|-----|------------------|
| **Staging** | `tckdjyunwmdpqmewrwvt` | Love odonto |
| **Production** | `uoepkwhqztmsjnzirpev` | amor-odonto-prod |

| | Staging | Production |
|--|---------|------------|
| Contracts V2 foundation | **PRESENT** | **ABSENT** |
| Migration 036 | **APPLIED** | **NOT APPLIED** |
| Package manifest tables | **PRESENT** | **ABSENT** |

---

## OBJETIVO 1 — Inventário de migrations (Contracts V2 + security adjacente)

Fonte: arquivos em `supabase/migrations/` × `list_migrations` MCP (staging + production).  
Versões remotas **não** seguem sempre o número do arquivo (timestamps / nomes curtos / apply fora de banda).

### Matriz principal

| Migration (repo) | Descrição | Repo | Staging applied | Production applied | Dependência | Required before 036? | Safe additive? | Risk |
|------------------|-----------|------|-----------------|--------------------|-------------|----------------------|----------------|------|
| `028_app_contracts_v2_foundation.sql` | Tabelas `app_contract_*` / `app_signature_*` + helpers imutabilidade | YES | **YES** (`028`) | **NO** | `tenants`, `touch_updated_at` | **YES (obrigatória)** | YES (`IF NOT EXISTS`) | **HIGH** se aplicada **sem** 029 (sem RLS) |
| `029_app_contracts_v2_rls.sql` | ENABLE RLS + policies + GRANTs authenticated | YES | **YES** (`029`) | **NO** | 028 + `app_user_can_access_tenant` / admin | **YES (segurança)** | YES (idempotente policies) | MEDIUM |
| `030_app_contract_ledger.sql` | Ledger jurídico append-only | YES | **YES** (`030`) | **NO** | 028/029 | Recomendada (paridade staging) | YES | LOW–MEDIUM |
| `031_app_contract_number_sequences.sql` | Sequências CTR/PKG | YES | **YES** (`031`) | **NO** | 028–030 | Recomendada | YES | LOW |
| `032_app_signature_sessions_and_challenges.sql` | Sessões públicas / OTP hash / rate limits | YES | **YES** (`032`) | **NO** | 028 envelopes/signers | Recomendada p/ assinatura pública | YES | MEDIUM (superfície pública) |
| `033_app_contract_private_storage_local.sql` | Bucket **local** `contracts-v2-private-local` + cols files | YES | **NO** (correto) | **NO** | 028 files | **NÃO** (local-only) | N/A | **BLOCKED** p/ remote |
| `034_app_signature_delivery_attempts.sql` | Tentativas de delivery (mascaradas) | YES | **YES** (`034`) | **NO** | 032/028 | Opcional p/ 036 schema; útil p/ paridade | YES | LOW |
| `035_app_contract_private_storage_staging.sql` | Bucket **staging** + cols files | YES | **YES** (`035`) | **NO** | 034 | **NÃO em production** | Schema cols YES; **bucket NO** | **BLOCKED** p/ prod (header: staging-only) |
| `036_app_package_manifest_foundation.sql` | Manifestos + docs + acceptances + cols envelope | YES | **YES** (`20260812165049` / `app_package_manifest_foundation`) | **NO** | **028** (+ envelopes/signers); função `app_contract_reject_tenant_id_change` | — | YES (aditivo) | MEDIUM **após** fundação |
| `037_platform_billing_rls_security_fix.sql` | SECURITY_01 billing RLS | YES | **NO** (não listada) | **YES (efeito)** via apply pontual Management API; **não** aparece como `037` em `list_migrations` | billing tables | Não para 036 | YES | LOW (já CLOSED) |
| `038_clinic_logos_storage_enumeration_security_fix.sql` | SECURITY_02 clinic-logos LIST | YES | **NO** (não listada) | **YES** (`20260812155536`) | storage clinic-logos | Não para 036 | YES | LOW (já CLOSED) |

### Por que staging tem fundação e production não?

1. Contracts V2 (028+) foi aplicado **de propósito** em staging durante o piloto 10.x.  
2. Production **nunca** recebeu 028–035/036 (hard stops sucessivos).  
3. Rollout operacional / `feature_flags` em production **não cria** tabelas V2.  
4. Em production, tabelas V1 de 006 (`generated_contracts`, etc.) também estão **ausentes** no schema remoto auditado — contratos operacionais seguem caminho app/IndexedDB + flags, sem persistência `app_*` remota.

### Drift extra (security)

| Fix | Staging | Production |
|-----|---------|------------|
| 037 billing RLS | ausente no histórico MCP | efeito aplicado (RLS+FORCE; policies authenticated) |
| 038 clinic-logos enum | ausente no histórico MCP | **APPLIED** |

---

## OBJETIVO 2 — Schema diff (somente leitura)

### Objetos críticos para package manifest

| Object | Staging | Production | Required by 036 | Missing in production | Created by |
|--------|---------|------------|-----------------|----------------------|------------|
| `app_contracts` | YES | **NO** | YES (FK) | YES | 028 |
| `app_contract_versions` | YES | **NO** | YES (FK) | YES | 028 |
| `app_contract_packages` | YES | **NO** | YES (FK nullable `package_id`) | YES | 028 |
| `app_signature_envelopes` | YES | **NO** | YES (FK acceptances + ALTER cols) | YES | 028 |
| `app_signature_signers` | YES | **NO** | YES (FK acceptances) | YES | 028 |
| `app_signature_sessions` | YES | **NO** | NO (não FK 036) | YES | 032 |
| `app_signature_challenges` | YES | **NO** | NO | YES | 032 |
| `app_signature_delivery_attempts` | YES | **NO** | NO | YES | 034 |
| `app_contract_ledger` | YES | **NO** | NO | YES | 030 |
| `app_contract_number_sequences` | YES | **NO** | NO | YES | 031 |
| `app_package_manifests` | YES | **NO** | YES | YES | 036 |
| `app_package_manifest_documents` | YES | **NO** | YES | YES | 036 |
| `app_package_document_acceptances` | YES | **NO** | YES | YES | 036 |
| `app_signature_envelopes.package_manifest_id` | YES | **NO** | YES | YES | 036 |
| `app_signature_envelopes.package_manifest_hash` | YES | **NO** | YES | YES | 036 |
| `app_package_manifest_reject_frozen_mutation()` | YES | **NO** | YES | YES | 036 |
| `app_contract_reject_tenant_id_change()` | YES | **NO** | YES (trigger 036) | YES | 028 |
| `tenants` | YES | YES | YES | NO | platform |
| `touch_updated_at()` | YES | YES | via 028 | NO | pré-028 |
| `app_user_can_access_tenant` | YES (text+uuid) | YES (**uuid**) | via 029 | NO | pré-028 |
| `feature_flags` | YES | YES | NO | NO | platform |
| Storage bucket `contracts-v2-private-staging` | YES | **NO** | NO p/ 036 | N/A | 035 |
| Contagem tabelas `app_contract%` | 17 | 0 | — | todas | 028+ |
| Contagem tabelas `app_signature%` | 7 | 0 | — | todas | 028/032/034 |

### RLS package (staging)

036: RLS **ON** + **REVOKE** anon/authenticated + grant **service_role** only (deny-by-default). Confirmado na 10.21V (`anon_select=false`, `authenticated_select=false`).

---

## OBJETIVO 3 — Dependency graph (production)

```
Pré-requisitos já em PRODUCTION
  tenants
  touch_updated_at()
  app_user_can_access_tenant(uuid) / app_user_is_tenant_admin(uuid)
        │
        ▼
028  app_contracts_v2_foundation          ← OBRIGATÓRIA
        │
        ▼
029  app_contracts_v2_rls                 ← OBRIGATÓRIA (não deixar 028 sozinha)
        │
        ├──────────────► 030 ledger                 (recomendado)
        ├──────────────► 031 number sequences       (recomendado)
        ├──────────────► 032 sessions/challenges    (recomendado p/ assinatura pública)
        └──────────────► 034 delivery attempts      (opcional / paridade)
        │
        ✗ 033 LOCAL-ONLY — NÃO APLICAR
        ✗ 035 STAGING-ONLY bucket — NÃO APLICAR em production
        │
        ▼
   [FUTURO] migration de storage PRIVATE PRODUCTION (ainda NÃO existe no repo)
        │
        ▼
036  app_package_manifest_foundation      ← só depois de 028 (+029)
```

| Categoria | Migrations |
|-----------|------------|
| Obrigatórias antes de 036 | **028, 029** |
| Recomendadas (paridade staging / public signing) | 030, 031, 032, 034 |
| Já aplicadas em production (não reaplicar) | 038; efeito 037 |
| Nunca reaplicar / nunca aplicar em prod | **033**, **035** |
| IF NOT EXISTS / ADD COLUMN IF NOT EXISTS | 028–036 majoritariamente idempotentes |
| Drift staging↔prod | Staging tem V2+036; prod tem security 038 (+037 efeito) sem V2 |

**NÃO assumir que basta 036.** Confirmado: `to_regclass('app_contracts')` = **null** em production.

---

## OBJETIVO 4 — Data safety (candidatas)

| Migration | DDL aditivo? | ALTER destrutivo / DROP / DELETE / UPDATE massivo? | LOCK / default pesado / FK em dados existentes | RLS / storage / triggers | Classificação |
|-----------|--------------|-----------------------------------------------------|-----------------------------------------------|--------------------------|---------------|
| 028 | YES (create table/function/index) | Sem DROP/DELETE de dados de negócio | FKs para `tenants`; sem backfill | Triggers imutabilidade; **sem RLS** | **HIGH** (janela sem RLS) |
| 029 | YES (RLS+policies+grants) | Não | Baixo | **RLS impact alto (desejado)** | **MEDIUM** |
| 030 | YES | Não | Baixo | RLS ledger | LOW–MEDIUM |
| 031 | YES | Não | Baixo | — | LOW |
| 032 | YES | Não | Baixo | Deny-by-default sessions | MEDIUM |
| 033 | — | — | — | Bucket local | **BLOCKED** |
| 034 | YES | Não | Baixo | Deny-by-default | LOW |
| 035 | Schema cols aditivas + **bucket staging** | Não em dados app | — | Storage staging-only | **BLOCKED** p/ prod |
| 036 | YES + nullable cols envelopes | Sem rewrite histórico | FK exige rows V2 (tabelas vazias OK) | RLS deny-by-default + freeze triggers | MEDIUM |

Nenhuma candidata exige DELETE/UPDATE/backfill de pacientes/financeiro/agenda.

---

## OBJETIVO 5 — V1 compatibility (prova)

| Afirmação | Prova | Status |
|-----------|-------|--------|
| NÃO desliga V1 | 028 header: namespace `app_*`; coexistência; flags OFF por default | **PROVADA** |
| NÃO migra contratos existentes automaticamente | Sem INSERT/UPDATE em tabelas legadas; V1 tables sequer presentes em prod | **PROVADA** |
| NÃO altera financeiro | 028–036 não tocam `021`/tabelas financeiras de negócio | **PROVADA** |
| NÃO altera agenda | Não tocam appointments | **PROVADA** |
| NÃO altera prontuário legado | Não reescrevem clinical guides / documents IndexedDB | **PROVADA** |
| NÃO obriga package manifest | Colunas `package_manifest_*` **nullable**; legacy sem manifesto válido (10.21U/V) | **PROVADA** |
| NÃO ativa Contracts V2 | Schema ≠ rollout; SSOT flags em `feature_flags` / Admin API | **PROVADA** |
| NÃO altera rollout automaticamente | Migrations 028–036 sem DML em `feature_flags` | **PROVADA** |

**V1 compatibility gate: PASS** (nenhuma afirmação BLOCKED).

---

## OBJETIVO 6 — Rollback / fallback plan

Princípio: **não** prometer DROP destrutivo com dados.

### BEFORE (qualquer apply futuro)

- Autorização humana explícita por migration  
- Checkpoint / backup Supabase  
- Confirmar ref = `uoepkwhqztmsjnzirpev`  
- Confirmar rollout **inalterado**  
- Aplicar **uma** migration por vez (MCP `apply_migration` ou Management API) — **nunca** `db push` cego  

### APPLY / VERIFY / FAILURE / FALLBACK

| Migration | VERIFY | FAILURE ACTION | ROLLBACK/FALLBACK realista |
|-----------|--------|----------------|----------------------------|
| 028 | `to_regclass` de tabelas core; zero rows; helpers existem | STOP; não seguir | Deixar tabelas vazias; **não** DROP se já houver writes; disable feature usage |
| 029 | `relrowsecurity=true`; policies; anon sem SELECT | Reaplicar 029 / revoke grants | Feature disable; corrigir policies (não DROP tables) |
| 030–032, 034 | regclass + RLS | STOP chain | Tabelas aditivas ociosas OK |
| 036 | manifests/docs/acceptances + cols envelope + trigger freeze | STOP; não ligar package writes | Null cols + tables empty; V1/legacy sign path; feature disable |

**Fallback preferido:** feature disable + V1 path + parar writes package — **não** DROP.

---

## OBJETIVO 7 — Staging browser isolation (conceito; NÃO alterar env)

### Estado atual (audit host-only, sem expor secrets)

| Arquivo | Alvo dominante |
|---------|----------------|
| `.env.local` | **PRODUCTION** (`VITE_*`, `SUPABASE_URL`) + `STAGING_*` separado |
| `server/.env` | **PRODUCTION** |
| `console/.env` | **PRODUCTION** |
| `.env.development` | LOCAL API (`127.0.0.1:3001`) + flag UX local test |
| `.env.local.production` | PRODUCTION (backup) |
| `.env.staging.local.example` | Template **STAGING** completo |
| `.env.staging` / `.env.staging.local` | **AUSENTES** |

### Por que browser staging NÃO é seguro hoje

1. Vite carrega `.env.local` → project **uoep…**  
2. Admin API `server/.env` → **uoep…**  
3. Console → **uoep…**  
4. Não há banner obrigatório “STAGING TEST MODE”  
5. Não há fail-closed de boot se `LOVE_ODONTO_ENV_MODE=staging` e ref = production  
6. Fallback silencioso possível (PLATFORM/APP vazios → console/.env prod)

### Forma segura proposta (futura; NÃO executar agora)

1. Copiar `.env.staging.local.example` → `.env.staging.local` (gitignored) com chaves staging.  
2. Procedimento operacional: **substituir temporariamente** `.env.local` + `server/.env` (+ console) pelos valores staging **ou** script `env:use-staging` que falha se detectar `uoep…`.  
3. Fail-closed (código futuro): se `LOVE_ODONTO_FORCE_STAGING=1` e qualquer URL contiver `uoepkwhqztmsjnzirpev` → **abort boot**.  
4. Banner visual fixo: **STAGING TEST MODE**.  
5. `CONTRACTS_V2_DELIVERY_MODE=disabled` / sem webhooks WhatsApp/e-mail/SMS reais.  
6. API: `VITE_PLATFORM_API_BASE_URL=http://127.0.0.1:3001` com `SUPABASE_URL` staging no server.  
7. Reiniciar Vite + server após swap; validar ref no banner/health.

---

## OBJETIVO 8 — Browser smoke plan (NÃO executar)

Roteiro futuro (após isolation):

1. Login staging  
2. Orçamento fictício (Implante, R$ 1.000 / entrada 200 / 4×200)  
3. Contrato → wizard → revisão → gerar  
4. TCLE + LGPD no package  
5. Freeze / página pública  
6. Visualizar Contrato/TCLE/LGPD (snapshots; sem truncamento)  
7. Aceites individuais; botão assinatura bloqueado→liberado  
8. Assinatura fictícia (sem comunicação externa)  
9. Evidence / PACOTE ASSINADO  
10. Prontuário → Documentos assinados  
11. Desktop + mobile  

Provas visuais: textos, checkboxes, gate, PDF/comprovante, retorno ao prontuário.

---

## OBJETIVO 9 — Production apply plan (NÃO executar)

Somente após autorização humana **e** preferencialmente após browser smoke staging:

```
PRECHECK (ref=uoep…, backup, rollout intacto, 036 deps absent confirm)
→ 028  → VERIFY tables/helpers
→ 029  → VERIFY RLS (anon denied)
→ 030  → VERIFY
→ 031  → VERIFY
→ 032  → VERIFY
→ 034  → VERIFY
→ SKIP 033
→ SKIP 035
→ (opcional) nova migration storage PRIVATE PRODUCTION — se necessária para artifacts
→ 036  → VERIFY manifests + envelope cols + freeze trigger
→ API smoke (service_role)
→ V1 smoke (agenda/financeiro/prontuário/flags)
→ STOP (não mudar rollout)
```

**Mecanismo:** apply **individual** (`apply_migration` MCP / Management API por arquivo).  
**Proibido:** `supabase db push` cego.

---

## OBJETIVO 10 — Reauditoria 036 vs production real

| Check | Resultado |
|-------|-----------|
| Dep `app_contracts` / versions / packages | **AUSENTES** em production |
| Dep envelopes / signers | **AUSENTES** |
| Dep `app_contract_reject_tenant_id_change` | **AUSENTE** (vem de 028) |
| `tenants` / helpers acesso | PRESENT (uuid) |
| Nullable legacy envelope fields | Design OK **se** envelopes existirem |
| Idempotência SQL | `IF NOT EXISTS` / add column if not exists |
| RLS package | Deny-by-default (adequado) |
| Compatibility V1/legacy | OK no desenho |

**`036_PRODUCTION_READY = NO`**

### 036 blockers

1. Fundação Contracts V2 ausente (028+)  
2. Função trigger tenant imutável ausente  
3. Sem 029 imediatamente após 028 = risco de exposição PostgREST  
4. Storage production privado ainda sem migration dedicada (não bloqueia schema 036, bloqueia paridade de artifacts remotos)

Mesmo se YES no futuro: **NÃO aplicar nesta fase.**

---

## OBJETIVO 11 — Git (somente leitura)

```
git log --oneline -10
30bb9d7 docs(contracts): add phase 10.21N final deploy report
67d458d docs(contracts): add pre-production functional test reports
…
```

**Working tree:** ~84 paths dirty/untracked (não commitado).

### Implementação local relevante ainda não commitada

- Package manifest domain (`src/domain/contracts/packages/*`)  
- UI pública / evidence / painel clínico  
- Migrations **036, 037, 038** (arquivos repo)  
- Reports 10.21O–V + SECURITY_01/02  
- Scripts `scripts/staging/`, `scripts/security/`  
- Testes 10.21T/U/V + security  

**NÃO commit / NÃO push** (hard stop respeitado).

**Deploy required before browser smoke?**  
Não obrigatório se smoke for **local** com env staging + código local uncommitted.  
Deploy remoto staging/prod **não** autorizado nesta fase.

---

## Checklist de resposta (pedido)

```
Production project: uoepkwhqztmsjnzirpev
Staging project: tckdjyunwmdpqmewrwvt

Contracts V2 production foundation: ABSENT
Contracts V2 staging foundation: PRESENT

Required migrations before 036: 028, 029 (min); +030,031,032,034 recomendadas
Already applied production: (sem 028–036); 038 YES; 037 efeito YES (fora list_migrations)
Missing production: 028,029,030,031,032,034,036 (+ storage prod futuro); NÃO aplicar 033/035
Schema drift: staging=V2+036; prod=sem V2; security 037/038 assimétricos
Destructive operations: Nenhuma nas candidatas (aditivas)
RLS implications: 029 obrigatória pós-028; 036 deny-by-default service_role
V1 compatibility: PASS
Financial impact: NONE (schema)
Agenda impact: NONE
Prontuario impact: NONE (legado)
Rollout impact: NONE (migrations não tocam feature_flags)

036 production ready: NO
036 blockers: missing Contracts V2 tables/functions; must not apply alone

Safe individual apply possible: YES
Recommended apply mechanism: MCP apply_migration / Management API one-file-at-a-time (never blind db push)

Browser staging currently safe: NO
Why not: .env.local + server/.env + console/.env → production; sem fail-closed; sem banner
Required env changes: activate staging-local env set (from .env.staging.local.example); align Vite+API+Console to tckd…
Fail-closed protection: NOT IMPLEMENTED (proposed)
External communication protection: keep delivery disabled; no real webhooks
Browser smoke ready: NO (plan YES; isolation NO)

Git status: dirty (~84 paths)
Uncommitted implementation: YES (10.21T/U/V + SECURITY + 036/037/038 files)
Deploy required before browser smoke: NO (local staging isolation sufficient)

Production migration sequence:
  PRECHECK → 028 → 029 → 030 → 031 → 032 → 034 → SKIP 033/035 → (optional prod storage) → 036 → verify → V1 smoke → STOP

Risk: MEDIUM (foundation size) / HIGH if 028 without 029
Blockers: 036 not ready alone; browser isolation pending; uncommitted deploy hygiene

SECURITY_01: CLOSED
SECURITY_02: CLOSED
PACKAGE_MANIFEST_SECURITY_CLEARANCE: CLEARED (pré-condição mantida; não autoriza apply 036)

Decision: priorizar isolamento + smoke visual em staging antes de migration controlada em production
Gate: READY_FOR_ISOLATED_STAGING_BROWSER_SMOKE
```

---

## HARD STOP (respeitado)

- Nenhuma migration aplicada  
- 036 não executada  
- Production / staging / env / rollout intactos  
- Sem paciente, commit, push ou deploy  

**Aguardar autorização humana** para:  
(1) implementação do fail-closed + swap env staging, e/ou  
(2) apply controlado da fundação em production.
