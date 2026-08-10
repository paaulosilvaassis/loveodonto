# PHASE_10.21G — POST-DEPLOY SERVER-SIDE VALIDATION

## Gate

**BLOCKED**

> Commit `b6226d6` no `origin/main`.  
> **Vercel OK.** **Railway FAIL** — Admin API de produção ainda sem as rotas 10.21C.  
> Produção operacional **não** ativada. Global/tenant **OFF**. Sem PUT de ativação. Sem rollback real.

---

## 1–2. Deploys do commit `b6226d6`

| Plataforma | Estado | Evidência |
|------------|--------|-----------|
| **Vercel – loveodonto** | **success** | GitHub commit status + `loveodonto.com.br` serve bundle novo (`index-3TYJmkbp.js`, etag pós-17:56Z) |
| **Vercel – paaulosilvaassis-loveodonto** (+ variantes/console) | **success** | Deployment completed |
| **Railway – kind-victory / appgestaoodonto** | **failure** | GitHub: `kind-victory - appgestaoodonto` → Deployment failed (`5837138552`) |

Log Railway:  
https://railway.com/project/fec1bf91-53d8-4bc7-924e-2b91fbac3d1a/service/b341f55d-9a3b-452a-a1bb-901ee4ee9a88?id=44cbfb34-409f-4998-b7f7-03b0fc9f9565&environmentId=1fea99e1-f982-41e9-95ee-cf26aea643c7

---

## 3. API base URL real (produção)

Descoberto no bundle Vite publicado:

**`https://appgestaoodonto-production.up.railway.app`**

(= `VITE_PLATFORM_API_BASE_URL` / `VITE_APP_ADMIN_API_BASE_URL` bakeado no frontend)

`/health` → **200** `{"ok":true,"service":"saas-admin-api",...}` — processo antigo ainda no ar.

---

## 4–6. GET `/internal/app/contracts/operational-rollout`

| Check | Resultado |
|-------|-----------|
| GET sem auth | **404** `Rota não encontrada: GET /internal/app/contracts/operational-rollout` |
| GET com Bearer inválido | **404** (rota inexistente no build em execução) |
| Resposta autenticada tenant piloto | **NÃO POSSÍVEL** — endpoint ausente no Railway live |
| globalEnabled | **false** (SSOT `feature_flags`: sem row) |
| tenantEnabled | **false** (SSOT: sem row para `b721c2c9-…`) |
| operationalUxEnabled | **false** |

Tenant alvo: `b721c2c9-d924-41ee-8911-dc00c8208326`

---

## 7. Painel `/gestao/contratos/rollout`

| Check | Resultado |
|-------|-----------|
| Bundle frontend contém UI SSOT (“SSOT no servidor”, path `operational-rollout`) | **PASS** (Vercel) |
| Painel consegue ler estado do servidor | **FAIL** — API retorna 404; UI cai no fallback “cache local (servidor indisponível)” |

---

## 8. Persistência (reload / logout / outro browser)

| Check | Resultado |
|-------|-----------|
| Reload / logout / anônimo via SSOT servidor | **BLOCKED** — GET oficial indisponível |
| SSOT Supabase permanece OFF após deploy | **PASS** (re-leitura `feature_flags`) |

---

## 9–10. Ativação / rollback

- PUT de ativação: **não executado**  
- Rollback real: **não executado**

---

## Entrega pedida

| Campo | Valor |
|-------|--------|
| **Vercel deploy** | PASS (`b6226d6` success) |
| **Railway deploy** | **FAIL** (`b6226d6` failure; API antiga ainda serve) |
| **API base URL** | `https://appgestaoodonto-production.up.railway.app` |
| **GET endpoint** | **FAIL** — 404 rota não encontrada |
| **Server-side state** | OFF/OFF/OFF (via Supabase SSOT; não via GET) |
| **Panel server-side** | PARTIAL — UI nova no Vercel; leitura servidor falha |
| **Cross-browser** | BLOCKED (depende do GET) |
| **Logout/login** | BLOCKED (depende do GET) |
| **Production active** | **NO** |
| **Blockers** | Railway deploy failed; endpoints 10.21C não estão na API live |
| **Decision** | **BLOCKED** |

---

## Next action

1. Abrir o log do Railway (link acima) e corrigir a falha de build/start do `b6226d6` (suspeita forte: import `.ts` no server via `contractsOperationalRolloutApi.js` sem transpile no Nixpacks).  
2. Redeploy Railway até `/health` + GET rollout ≠ 404 (esperado: 401 sem token / 200 com JWT).  
3. Reexecutar 10.21G (GET autenticado + painel + reload/logout).  
4. Só então: `READY_FOR_PRODUCTION_UNLOCK`.
