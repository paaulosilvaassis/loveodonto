# PHASE_10.21X — ISOLATED STAGING BROWSER ENVIRONMENT + VISUAL E2E SMOKE

**Status:** INFRA PASS / VISUAL E2E **BLOCKED** (aguardando login staging humano)  
**Gate:** `BLOCKED`  
**Production modified:** **NO**  
**Staging schema/migrations modified:** **NO**  
**Rollout modified:** **NO**  
**Commit/push/deploy:** **NO**

---

## PARTE A — Auditoria do env (antes de mudar)

| Arquivo | Estado | Alvo |
|---------|--------|------|
| `.env` | ausente | — |
| `.env.local` | presente | **PRODUCTION** (`VITE_*`, `SUPABASE_URL`) + `STAGING_*` separado |
| `.env.development` | presente | LOCAL API (`127.0.0.1:3001`) |
| `.env.staging` | ausente | — |
| `.env.staging.local` | **criado nesta fase** (gitignored) | **STAGING** `tckd…` |
| `.env.staging.local.example` | atualizado | template sem secrets |
| `server/.env` | presente | **PRODUCTION** |
| `console/.env` | presente | **PRODUCTION** |

### Fallbacks silenciosos identificados (e mitigados no modo staging)

1. `vite.config.js` misturava `console/.env` → production se APP/PLATFORM vazios.  
2. `server/index.js` carregava `.env.local` production por último.  
3. Vite `loadEnv(mode=staging)` ainda lia `.env.local` production; **override explícito** de `.env.staging.local` foi necessário.

---

## PARTES B–E — O que foi implementado

| Peça | Resultado |
|------|-----------|
| Fail-closed STAGING_TEST_MODE | **PASS** — aborta se `uoep…` / hosts production |
| Banner | **PASS** — `STAGING — DADOS FICTÍCIOS — NÃO É PRODUÇÃO` + Project `tckd…` |
| External communication | **PASS** — exige `CONTRACTS_V2_DELIVERY_MODE=disabled` |
| API | **PASS (desenho)** — `VITE_PLATFORM_API_BASE_URL=http://127.0.0.1:3001` + `npm run staging:api` |
| Scripts | `staging:prepare-env`, `staging:api`, `staging:browser` |

### Arquivos principais

- `src/domain/contracts/staging/staging-browser-test-mode.ts`
- `src/components/StagingTestModeBanner.jsx`
- `src/main.jsx` (hard stop UI)
- `src/App.jsx` (banner)
- `vite.config.js` (override `.env.staging.local`, sem fallback console em staging)
- `server/index.js` (load staging + fail-closed)
- `scripts/staging/*`

### Prova de boot isolado (sem login)

Vite `--mode staging` em `127.0.0.1:5188`:

- HTTP **200**
- `MODE=staging`
- `VITE_STAGING_TEST_MODE=true`
- `VITE_SUPABASE_*` → **somente** `tckdjyunwmdpqmewrwvt`
- **sem** `uoepkwhqztmsjnzirpev` nas URLs resolvidas
- banner/guard modules servidos

Fail-closed unitário: production URL + staging mode → **blocked**.

---

## PARTES F–H — Smoke visual interativo

**NÃO CONCLUÍDO nesta sessão.**

### Bloqueios operacionais

1. Terminal ativo `npm run console:dev` aponta stack padrão para **production** — conflito de portas/uso.  
2. Sem credenciais de login staging na sessão (não inventar / não usar conta real).  
3. Tabela `clinics` staging remota vazia; fluxo clínico do app é majoritariamente **IndexedDB** — paciente fictício precisa ser criado **via UI** após login.  
4. Sem automação browser autenticada disponível aqui.

### Como Paulo executa o smoke (próximo passo humano)

```bash
# 1) Parar console:dev / vite que usam production
# 2) Garantir .env.staging.local (já gerado localmente; gitignored)
npm run staging:api        # :3001 com SUPABASE staging
npm run staging:browser    # :5176 --mode staging
# 3) Login staging
# 4) Seguir roteiro G/H do pedido (paciente TESTE PACKAGE MANIFEST BROWSER 1021X …)
```

Paciente planejado (ainda não criado na UI):

`TESTE PACKAGE MANIFEST BROWSER 1021X` — Implante — R$ 1.000 / entrada 200 / 4×200 — sem PII real.

---

## PARTE I — Segurança

| Check | Resultado |
|-------|-----------|
| Browser project (modo staging) | `tckdjyunwmdpqmewrwvt` |
| API staging-safe design | local `:3001` + env staging |
| Production writes nesta fase | **ZERO** |
| Production feature_flags / rollout | **ZERO** |
| Migrations applied | **NONE** |
| Tenant isolation (código/domain) | herdado 10.21V **PASS** |

---

## PARTE J — Testes / build

| Suite | Resultado |
|-------|-----------|
| `phase1021xIsolatedStagingBrowserSmoke` | **PASS** (8) |
| 10.21T / U / V / R + SECURITY_01c / 02b | **PASS** (82 total no batch) |
| `npm run build` | **PASS** |

---

## PARTE K — Working tree classification (~95 paths)

| Bucket | Count | Conteúdo |
|--------|------:|----------|
| **A. 10.21T/U/V/W/X** | ~36+ | package manifest, staging browser, reports 10.21*, scripts/staging, vite/main |
| **B. SECURITY_01/02** | ~17 | 037/038, reports SECURITY_*, scripts/security |
| **C. UX/TCLE/logo/colaborador** | ~23 | clinic logo, collaborator null, prerequisites, TCLE attach |
| **D. Temporários** | ~2+ | `.DS_Store`, artifacts `_phase*` / `_security*` |
| **E. Whitespace/antigos** | ~3 | 10.14 pilot whitespace |
| **F. Desconhecidos / mistos** | ~14 | `App.jsx`, `server/index.js`, `036` sql, public V2 page, etc. (vários são de A/C na prática) |

**Não** foi feito `git add .` / commit / push.  
Nada apagado.

Artefato: `docs/reports/_phase1021x_git_dirty_classification.txt`

---

## Bugs encontrados

| Sev | Item |
|-----|------|
| High | Vite `mode=staging` ainda herdava production de `.env.local` sem override explícito — **corrigido** |
| Medium | Smoke visual interativo depende de login humano + parar stack production local |
| Low | Valores `\r` em `.env.development` (CRLF) — strip adicionado no vite merge |

Critical: **0**

---

## Resumo pedido

```
Environment: STAGING_TEST_MODE (isolado)
Browser Supabase project: tckdjyunwmdpqmewrwvt (quando staging:browser)
API environment: local :3001 staging-safe (staging:api) — não Railway production
Production project detected anywhere: SIM nos envs default (.env.local/server/console); NÃO no modo staging isolado
Fail-closed guard: PASS
Staging banner: PASS (implementado + servido)
External communication: DISABLED (enforced)
Patient: NOT CREATED IN UI (blocked)
Package / Contract / TCLE / LGPD / Freeze / Manifest: NOT EXECUTED IN BROWSER
Public signing / Individual view / Sign gate / Acceptances / Signature / Evidence / Prontuario: NOT EXECUTED IN BROWSER
Desktop / Mobile: NOT EXECUTED
Tenant isolation: PASS (herdado + guards)
Production writes: ZERO
Production rollout: ZERO
Tests: PASS
Build: PASS
Bugs found: 3 (0 critical / 1 high fixed / 1 medium / 1 low)
Critical: 0
High: 0 (residual)
Medium: 1
Low: 1
Git dirty classification: A/B/C/D/E/F documentado
Decision: Infraestrutura de isolamento PRONTA; E2E visual autenticado AINDA NÃO executado
Gate: BLOCKED
```

### Motivo do BLOCKED

Smoke visual completo (login → orçamento → contrato → TCLE/LGPD → freeze → pública → aceites → assinatura → evidence → prontuário) **não** foi executado sem credencial staging e sem derrubar a stack local que aponta para production.

---

## HARD STOP (respeitado)

- Sem migration production / 028–036 production  
- Sem paciente real  
- Sem alteração de rollout  
- Sem commit / push / deploy production  

**Aguardar Paulo** para: (1) parar stack production local, (2) `staging:api` + `staging:browser`, (3) login staging e concluir roteiro visual → reabrir fase para `STAGING_BROWSER_E2E_PASS`.
