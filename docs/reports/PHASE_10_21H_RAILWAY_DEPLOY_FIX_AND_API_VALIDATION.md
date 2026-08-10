# PHASE_10.21H — RAILWAY DEPLOY FIX AND API VALIDATION

## Gate

**READY_FOR_PRODUCTION_UNLOCK**

> Produção operacional **não** ativada. Global/tenant **OFF**. Sem PUT de ativação.  
> V1 intacto. Sem migration / schema / RLS / bucket / cutover.

---

## RAILWAY_FAILURE_ROOT_CAUSE (b6226d6 / kind-victory)

| Campo | Valor |
|-------|--------|
| **Deployment** | `kind-victory` / service `appgestaoodonto` (GitHub deploy failure em `b6226d6`) |
| **Commit** | `b6226d6` — feat(contracts): persist operational rollout in feature_flags |
| **Build command** | NIXPACKS / `npm ci --omit=dev` (`server/nixpacks.toml`) |
| **Start command** | `node index.js` (`server/railway.json`, `server/nixpacks.toml`) |
| **First fatal error** | `ERR_MODULE_NOT_FOUND` ao carregar imports `.ts` no boot do Node |
| **File** | `server/lib/contractsOperationalRolloutApi.js` |
| **Import/module** | `../../src/domain/contracts/rollout/contracts-operational-rollout-flags.ts` e `contracts-operational-mode.ts` |
| **Root cause** | Railway Root Directory = `server` executa Node **sem transpile**. Imports TypeScript + path `../../src/` **não existem** no container → processo novo falha; API antiga continua no ar → GET rollout **404**. |

---

## Fix

Criar módulo runtime-safe `server/lib/contractsOperationalRolloutFlags.js` (JS puro) e apontar `contractsOperationalRolloutApi.js` para ele. Sem transpiler novo, sem framework, sem mudança de arquitetura.

### Files changed

| Arquivo | Mudança |
|---------|---------|
| `server/lib/contractsOperationalRolloutFlags.js` | **novo** — constantes + mapeamento SSOT |
| `server/lib/contractsOperationalRolloutApi.js` | imports `.ts` → `./contractsOperationalRolloutFlags.js` |

### Commit

`a7e929b` — `fix(contracts): make rollout api railway-runtime safe`  
Push: `origin/main` (sem force).

---

## Railway deploy (pós-fix)

| Check | Resultado |
|-------|-----------|
| Commit status `a7e929b` | **success** |
| `kind-victory - appgestaoodonto` | **success** → `appgestaoodonto-production.up.railway.app` |
| `/health` | **HTTP 200** `saas-admin-api` |

---

## API live validation

**Endpoint:** `GET https://appgestaoodonto-production.up.railway.app/internal/app/contracts/operational-rollout`

| Check | Resultado |
|-------|-----------|
| Sem auth | **HTTP 401** `Token do app ausente.` (rota registrada; ≠ 404) |
| Com JWT master do tenant piloto | **HTTP 200** |
| `productionGlobalEnabled` | `false` |
| `tenantEnabled` | `false` |
| `operationalUxEnabled` | `false` |
| `source` | `feature_flags` |
| `rolloutPhase` | `READY_FOR_PRODUCTION_ACTIVATION` |
| Rows `feature_flags` (2 chaves) | **0** (ausência = OFF) |

Tenant: `b721c2c9-d924-41ee-8911-dc00c8208326`

PUT de ativação: **não executado**.

---

## Panel / persistência

| Check | Resultado |
|-------|-----------|
| Frontend Vercel (bundle 10.21C) | já publicado em `b6226d6` — UI “SSOT no servidor” |
| Leitura server-side | **PASS** — GET oficial 200 + `source=feature_flags` |
| Cross-browser | **PASS** (SSOT servidor; 0 rows → mesmo OFF em qualquer browser) |
| Logout/login | **PASS** (mesmo GET → mesmo estado OFF) |

Confirmação visual humana recomendada em  
https://www.loveodonto.com.br/gestao/contratos/rollout  
(fonte = servidor; global/tenant OFF).

---

## Local tests / build

| Check | Resultado |
|-------|-----------|
| `node index.js` (Railway entrypoint) | sobe; `/health` 200; rollout **401** sem token |
| `npm run test:supabase:phase1021c` | **PASS** (7) |
| `npm run test:supabase:phase1020` | **PASS** (16) |
| `npm run build` | **PASS** |

---

## Security (pós-correção)

| Controlo | Status |
|----------|--------|
| GET exige auth | **PASS** (401 sem token) |
| PUT / rollback exigem admin/master | **PASS** (código + testes 10.21C) |
| Cross-tenant bloqueado | **PASS** (teste `TENANT_FORBIDDEN`) |
| Global ON exige unlock env + frase | **PASS** (`PRODUCTION_ACTIVATION_LOCKED` / `CONFIRMATION_REQUIRED`) |
| Ausência de flag = OFF | **PASS** (live + mapeamento) |
| Deploy não cria rows | **PASS** (count 0 após deploy) |
| V1 fallback | **PASS** (`operationalUxEnabled=false`) |

---

## Risks / Blockers

| Item | Nota |
|------|------|
| **Risks** | Duplicação de mapeamento JS (`server/lib`) vs TS (`src/domain`) — manter em sync |
| **Blockers** | nenhum para unlock de produção (ativação ainda **manual** e bloqueada) |
| **Production active** | **NO** |

---

## Entrega

| Campo | Valor |
|-------|--------|
| **Root cause** | Import `.ts` + path `src/` em runtime Node/Railway sem transpile |
| **Fix** | Módulo JS runtime-safe sob `server/lib` |
| **Commit** | `a7e929b` |
| **Railway build/deploy** | **PASS** |
| **GET status** | **200** (auth) / **401** (no auth) |
| **Server-side state** | OFF / OFF / OFF |
| **Gate** | **READY_FOR_PRODUCTION_UNLOCK** |
