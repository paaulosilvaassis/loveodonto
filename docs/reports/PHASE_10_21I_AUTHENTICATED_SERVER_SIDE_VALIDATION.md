# PHASE_10.21I — AUTHENTICATED SERVER-SIDE VALIDATION

## Gate

**READY_FOR_PRODUCTION_UNLOCK**

> Validação somente leitura. **Nenhum PUT**, sem ativação global/tenant, sem rollback real, sem paciente real.  
> JWT mintado via magic link admin (presença validada; token **não** impresso, **não** salvo, **não** registrado neste relatório).

---

## Railway commit

`a7e929b` — `fix(contracts): make rollout api railway-runtime safe`

## Endpoint live

`GET https://appgestaoodonto-production.up.railway.app/internal/app/contracts/operational-rollout`

## Unauthenticated GET

| Check | Resultado |
|-------|-----------|
| HTTP | **401** |
| Body | `{"error":"Token do app ausente."}` |

## Authenticated GET

| Check | Resultado |
|-------|-----------|
| JWT presente | **true** (formato JWT; valor omitido) |
| Actor | membership `master` no tenant piloto (email mascarado) |
| HTTP | **200** |
| `ok` | `true` |
| `source` | `feature_flags` |
| `tenantId` | `b721c2c9-d924-41ee-8911-dc00c8208326` |
| `state.productionGlobalEnabled` | **false** |
| `state.tenantEnabled` | **false** |
| `operationalUxEnabled` | **false** |
| Rows em `feature_flags` (flags operacionais) | **0** (ausência = OFF) |

## Tenant resolved

| Check | Resultado |
|-------|-----------|
| GET sem `tenant_id` (só Bearer) | **200** → tenant = `b721c2c9-…` via `tenant_users` membership |
| GET com `?tenant_id=` correto | **200** → mesmo tenant |
| GET com `?tenant_id=` arbitrário (spoof) | **403** `TENANT_MEMBERSHIP_REQUIRED` |
| Confiança em header/`tenantId` arbitrário do cliente | **não** — resolução por membership; spoof bloqueado |

Nota: `readExplicitTenantId` no server lê `query`/`body` (`tenant_id`), não `X-Tenant-Id`. O GET do painel usa Bearer; o tenant vem da membership autenticada.

## Server-side state

| Flag / campo | Valor |
|--------------|-------|
| global / `productionGlobalEnabled` | **OFF** |
| tenant / `tenantEnabled` | **OFF** |
| `operationalUxEnabled` | **OFF** |
| SSOT | `public.feature_flags` (sem rows operacionais) |
| Produção ativa | **NO** |
| V1 | intacto (UX operacional OFF) |

## Panel state

URL: `https://www.loveodonto.com.br/gestao/contratos/rollout`

| Check | Resultado |
|-------|-----------|
| Bundle live | `ProtectedApp-lj3ArS8b.js` contém UI SSOT |
| Markers | `feature_flags (servidor)`, `SSOT no servidor`, `cache local (servidor indisponível)`, `Recarregar do servidor`, `Modo operacional`, `Tenant enabled`, `Produção global` |
| Admin API bakeada | `https://appgestaoodonto-production.up.railway.app` + path `/internal/app/contracts/operational-rollout` |
| Dados que o painel leria (mesmo GET autenticado) | Fonte **feature_flags (servidor)**; global **OFF**; tenant **OFF**; UX **OFF** |
| Cache local como SSOT | **não** (`source=feature_flags`; cache só fallback) |

DOM interativo no navegador logado **não** foi conduzido por automação de UI nesta sessão; equivalência painel = resposta do GET oficial + chunk publicado.

## Cross-browser

Duas sessões JWT independentes (mint separado) → mesmo estado OFF/OFF/OFF, mesmo `tenantId`, `source=feature_flags`.  
**PASS** no SSOT server-side (estado não depende de localStorage de um browser).

## Logout / login

Terceiro mint (sessão nova após “logout” lógico da anterior) → mesmo estado OFF/OFF/OFF.  
**PASS** no SSOT server-side.

## Production active

**NO**

## V1 fallback

**PASS** — UX operacional OFF; V1 permanece o caminho ativo.

## Security

| Item | Status |
|------|--------|
| Rota exige Bearer app | PASS (401 sem token) |
| GET autenticado 200 | PASS |
| Spoof de tenant | PASS (403) |
| PUT / ativação / rollback | **não executados** |
| Token em log/relatório/arquivo | **omitido** |

## Risks

- Validação de painel/cross-browser/logout foi por **API multi-sessão + bundle publicado**, não por clique humano em janela anônima.
- `state.mode` pode aparecer como `OPERATIONAL_UX` no payload default mesmo com flags OFF; o kill switch efetivo é `operationalUxEnabled` / `tenantEnabled` / `productionGlobalEnabled` (todos **false**).

## Blockers

Nenhum blocker técnico para unlock de produção (frase/unlock humano ainda exigidos antes de qualquer PUT).

## Decision / Gate

**READY_FOR_PRODUCTION_UNLOCK**

---

## Entrega pedida

| Campo | Valor |
|-------|--------|
| **Railway commit** | `a7e929b` |
| **Endpoint live** | `GET …/internal/app/contracts/operational-rollout` |
| **Unauthenticated GET** | **401** `Token do app ausente.` |
| **Authenticated GET** | **200** |
| **HTTP status** | 401 (no auth) / 200 (auth) / 403 (spoof tenant) |
| **Tenant resolved** | `b721c2c9-d924-41ee-8911-dc00c8208326` via membership |
| **Server-side state** | global OFF / tenant OFF / UX OFF |
| **Panel state** | UI SSOT publicada; leitura = servidor OFF/OFF/OFF |
| **Cross-browser** | PASS (multi-sessão API) |
| **Logout/login** | PASS (re-mint API) |
| **Production active** | **NO** |
| **V1 fallback** | PASS |
| **Security** | PASS (auth + anti-spoof; sem mutação) |
| **Risks** | UI DOM não clicada; defaults de `mode` vs flags OFF |
| **Blockers** | nenhum para unlock |
| **Gate** | **READY_FOR_PRODUCTION_UNLOCK** |
