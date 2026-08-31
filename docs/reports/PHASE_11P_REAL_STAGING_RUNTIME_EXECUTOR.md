# PHASE 11.P — REAL STAGING RUNTIME EXECUTOR

**Modo:** APPLICATION RUNTIME SHADOW TRANSPORT (sintético, staging only)  
**Data:** 2026-08-31  
**Baseline:** `f94b02e` (Phase 11.O)  
**PRODUCTION_CHANGED = NO** · **TENANT_CUTOVER = NO**  
**CURRENT_FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES**

---

## 1. Executive Summary

A 11.P fecha o P2 da 11.O: o playbook canônico persistiu no PostgreSQL staging pelo **transport supabase-js da aplicação** (`client.from` + sessão autenticada), sem MCP `execute_sql` como writer. Writers canônicos 11.M. Flag default **OFF**. IndexedDB permanece SSOT. V2 permanece non-authoritative. Sem cutover, backfill, scan histórico ou produção.

```
PHASE_11P_STATUS = PASS
PHASE_11P_GATE = FINANCIAL_V2_REAL_APP_RUNTIME_SHADOW_TRANSPORT_VALIDATED
APP_RUNTIME_OPERATIONS_TOTAL = 13
APP_RUNTIME_MATCH = 13
APP_RUNTIME_MISMATCH = 0
```

---

## 2. Baseline / Git

```
HEAD esperado = f94b02ee71cf4cbfc14a79c6df3803b9201e29b3
Leftovers SMTP/patient-email/Phase 10/11.A = preservados (não staged)
FINANCIAL_V2_RUNTIME_SHADOW default = OFF
```

---

## 3. Environment

```
TARGET_DB_ENVIRONMENT = STAGING
SHADOW_TARGET_PROJECT_REF = tckdjyunwmdpqmewrwvt
PRODUCTION_PROJECT_REF = uoepkwhqztmsjnzirpev
PRODUCTION_PROJECT_REF_BLOCKED = PASS
APP_RUNTIME_PRODUCTION_GUARD = PASS
```

Service role: somente no helper de teste (`phase11pStagingAuth.js`) para seed/cleanup de fixtures sintéticos.  
O transport da app usa anon + sessão `authenticated`.  
Vite `define` injeta só URL + chave pública.

---

## 4. Audit do executor (pré-implementação)

1. **Objeto injetado como executor:** `state.executor` em `financialV2RuntimeShadow.js`. Default `null`. Persistência caía em store in-memory ou SQL injetado.
2. **Quem cria:** apenas `__setFinancialV2RuntimeShadowForTest`. 11.N/11.O usavam `createTenantScopedRuntimeExecutor` / wrapper SQL.
3. **Cliente Supabase real:** sim — `supabaseAppClient` / `supabasePlatformClient` em `src/lib/supabaseClients.js` (`createClient` + anon).
4. **Sessão autenticada:** login SaaS via `signInWithPassword` no platform client; JWT `app_metadata.tenant_id` é a authority remota.
5. **Tenant identity:** trusted auth context (`session.user.app_metadata.tenant_id`). Payload não é authority.
6. **`tenant_id` client-controlled?** Não no transport 11.P. Mismatch payload vs sessão → `CLIENT_PAYLOAD_NOT_TENANT_AUTHORITY`. Persist força `tenant_id` da sessão.
7. **Credenciais staging:** `.env.staging.local` (URL + anon + service role para fixture). Live tests carregam só esse arquivo. `.env.local` tem refs de produção e **não** é lido pelo helper 11.P.
8. **Service role no client runtime?** Não. `SERVICE_ROLE_IN_CLIENT_RUNTIME = NO`.
9. **Por que 11.O usou MCP:** não existia adapter PostgREST; `state.executor` default null; Vitest zera `VITE_SUPABASE_*`; persistência era SQL string + MCP.

---

## 5. Runtime Transport Architecture

```
canonical writer (createReceivable / financing / payment / reversal / charge)
  → IndexedDB authoritative commit
  → enqueueFinancialV2RuntimeShadow (best-effort, não bloqueia o writer)
  → runFinancialV2RuntimeShadow
  → mapper + classifier 11.I + cents 11.G
  → FinancialV2ShadowTransport.persist
  → createFinancialV2SupabaseShadowTransport (supabase-js PostgREST)
  → authenticated staging session + RLS
  → financial_v2_* upsert/select/lifecycle update
  → app-side readBack
  → compareFinancialShadow / compareStagingReadback
  → telemetry
```

```
APP_RUNTIME_SHADOW_TRANSPORT = SUPABASE_JS_POSTGREST
TIMEOUT_MS = 8000
RETRIES = 0
REMOTE_SHADOW_BLOCKS_WRITER_RETURN = NO
RETRY_STORM_RISK = CONTROLLED
```

Writers canônicos permanecem sem conhecimento de Supabase.  
MCP/SQL admin só para inspeção, fixture e verificação independente.

---

## 6. Authentication

```
APP_RUNTIME_AUTH_MODE = REAL_STAGING_AUTHENTICATED_SESSION
SHADOW_OPERATIONAL_AUTH = AUTHENTICATED_TENANT_SCOPED
CLIENT_PAYLOAD_IS_TENANT_AUTHORITY = NO
```

Como a sessão sintética é criada (documentado em `phase11pStagingAuth.js`):

1. Admin API (service role, **somente fixture**) cria `auth.users` com `app_metadata.tenant_id`.
2. Seed de `tenants` + `tenant_users` sintéticos (`phase11p-*`).
3. Dois clients anon isolados (`createClient`, mesma lib da app).
4. `signInWithPassword` em cada client → JWT real com `app_metadata.tenant_id`.
5. O transport lê `client.auth.getSession()`; nunca aceita tenant cru do payload.

Prefixo: `phase11p-*`. Allowlist: um tenant (`f11f11f1-1111-4111-8111-f11f11f1111f`). Sem wildcard. Sem `all`. Sem tenant de produção.

---

## 7. Results by Entity

| entity | source_id | compareFinancialShadow |
| --- | --- | --- |
| PATH A receivable | recv-ea0f6078-8859-4e80-a5c2-fb5a400781a8 | MATCH |
| financing | fin-0468b6b2-b22e-464f-a000-4466ee8a2fc8 | MATCH |
| financing approval | mesmo financing (lifecycle active) | MATCH |
| PATH B #1 | recv-21e9f22d-30d4-4010-89ef-83a296c1f7ee | MATCH |
| PATH B #2 | recv-43e9838f-2257-471d-a230-931abb8cc69b | MATCH |
| payment | rvpay-e96f469a-9290-4354-9b55-5ff910c19d2b | MATCH |
| payment retry | mesmo `operation_id` | idempotent |
| reversal | rvpay-240e5b4d-1e1c-4b55-930d-41277d4bf371 | MATCH |
| charge | rvchg-bb72ffac-28ba-4c0c-8a88-a52fb7d004cb | MATCH |

```
PATH_A_APP_RUNTIME_REMOTE = MATCH
FINANCING_APP_RUNTIME_REMOTE = MATCH
FINANCING_APPROVAL_APP_RUNTIME_REMOTE = MATCH
PATH_B_APP_RUNTIME_REMOTE = MATCH
PAYMENT_APP_RUNTIME_REMOTE = MATCH
REVERSAL_APP_RUNTIME_REMOTE = MATCH
CHARGE_APP_RUNTIME_REMOTE = MATCH
CHARGE_CREATES_RECEIVABLE = NO
```

---

## 8. Read-back

```
APP_RUNTIME_READ_BACK = PASS
```

Read-back primário via `transport.readBack` / `client.from(...).select` autenticado.  
MCP usado só para leftover count independente após cleanup. Não substitui o comparator.

PATH A read-back: `total_cents = 8000`, `tenant_id` do tenant sintético A.

---

## 9. RLS (app transport)

Dois users/tenants sintéticos. Client B contra rows do tenant A:

```
APP_RUNTIME_RLS_SELECT = PASS
APP_RUNTIME_RLS_INSERT = PASS
APP_RUNTIME_RLS_UPDATE = PASS
```

---

## 10. Session Isolation

```
CROSS_TENANT_SESSION_LEAK = 0
POST_LOGOUT_REMOTE_WRITE = DENIED
```

Clients A/B têm tokens e `app_metadata.tenant_id` distintos.  
Após `signOut`, persist do transport A falha com `SESSION_*`. Sem reuse de sessão stale.

---

## 11. Idempotency / Integrity

```
PAYMENT_APP_RUNTIME_IDEMPOTENCY = PASS
DUPLICATE_REMOTE_FACTS = 0
IMMUTABLE_REMOTE_OVERWRITES = 0
ORPHAN_REMOTE_FACTS = 0
MONETARY_PARITY = PASS
```

Conflito imutável (mesmo `source_id`, `amount_cents` incompatível): transport devolve o fato existente; sem overwrite.

---

## 12. Failure Isolation

```
SHADOW_NETWORK_FAILURE_BREAKS_LEGACY = NO
REMOTE_SHADOW_BLOCKS_WRITER_RETURN = NO
RETRY_STORM_RISK = CONTROLLED
KILL_SWITCH = PASS
```

Enqueue best-effort (`queueMicrotask` + chain). Timeout 8s. Retries = 0.  
Flag ON só na janela controlada do teste. Default committed = OFF.

---

## 13. Security / Secrets

```
SERVICE_ROLE_IN_CLIENT_RUNTIME = NO
PRIVILEGED_SECRET_CLIENT_EXPOSURE = 0
CLIENT_PAYLOAD_IS_TENANT_AUTHORITY = NO
```

Anon/public key é esperada. Service role não entra em `src/services` transport, `supabaseClients.js` nem Vite `define`.

---

## 14. Telemetry

Campos: `tenant_id`, `entity_type`, `source_id`, `operation`, `result`, `reason_code`, `duration_ms`, `timestamp`.

```
TOKEN_TELEMETRY_LEAKS = 0
PII_TELEMETRY_LEAKS = 0
```

---

## 15. Authority / SSOT

```
CURRENT_FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES
FINANCIAL_SERVER_READ_ENABLED = NO
FINANCIAL_SERVER_WRITE_ENABLED = NO
FINANCIAL_SERVER_WRITE_AUTHORITY = NO
DUAL_WRITE_ENABLED = NO
SHADOW_NON_AUTHORITATIVE = YES
HISTORICAL_SHADOW_SCAN = NO
BACKFILL_APPLIED = NO
TENANT_CUTOVER_APPLIED = NO
AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE
FINANCIAL_V2_RUNTIME_SHADOW_DEFAULT = OFF
```

Read-back autenticado é validação interna do comparator. Não é read authority de produto.

---

## 16. Cleanup

```
PHASE_11P_STAGING_FIXTURES_LEFT = 0
```

Removidos: `financial_v2_*` dos tenants 11.P, `tenant_users`, `tenants`, `auth.users` sintéticos.  
Verificação independente MCP (não é o gate primário): receivables/payments/financings/charges/tenants/tenant_users/auth.users = 0.  
Policies não foram enfraquecidas.

---

## 17. Tests

```
TESTS_ADDED = phase11pFinancialV2RuntimeTransport.test.js (T1–T75)
           + helpers/phase11pStagingAuth.js
TESTS_PASS = 47/47 (11.P); 555/555 em 20 files (11.B–11.P + finance/cutover/permissions/tenant)
TESTS_FAIL = 0
TYPECHECK_NEW_11P_FAILURES = NONE
```

Live gate: `T16-T52` (supabase-js autenticado, 7.2s). Sem mock/MCP como persistência primária.

---

## 18. Findings

```
P0 = NONE
P1 = NONE
P2 = O singleton supabaseAppClient do bundle Vite não é auto-wired no enqueue de produção
     (flag default OFF; transport injetado na janela de teste). O adapter canônico
     aceita o client da app; a prova live usou createClient isolado com a mesma lib
     e sessão real, porque o Vitest zera VITE_SUPABASE_*.
```

---

## 19. Remaining Risks

- Wiring do `supabaseAppClient` + session bridge em runtime de browser real ainda não foi exercitado com a flag ON (intencional; default OFF).
- Read authority, dual-write e cutover continuam fora de escopo.
- RLS `app_user_can_access_tenant` em staging é JWT **OU** membership (já existente; 11.P não alterou). Isolation A/B foi comprovada via app client.

---

## 20. Go / No-Go

```
GO_FOR_READ_AUTHORITY_DESIGN = YES
GO_FOR_TENANT_CUTOVER = NO
GO_FOR_PRODUCTION_CUTOVER = NO
BLOCKERS_FOR_READ_AUTHORITY_DESIGN = definir contrato de read path, cache, fallback IndexedDB e kill switch de leitura. Transport autenticado já está validado.
```

---

## 21. Final Gate

```
PHASE_11P_GATE = FINANCIAL_V2_REAL_APP_RUNTIME_SHADOW_TRANSPORT_VALIDATED
PHASE_11P_STATUS = PASS
```

PASS requerimentos 1–40 da spec: transport real, sessão sintética autenticada, sem MCP como writer primário, sem service role no client, tenant da sessão, MATCH em PATH A / financing / approval / PATH B / payment / reversal / charge, read-back app-side, RLS, isolamento de sessão, logout fail-closed, idempotência, zero overwrite/duplicata/órfão, paridade monetária, falhas isoladas, sem bloquear writer, retry bounded, sem leak de token/PII, kill switch, flag OFF, fixtures 0, IndexedDB SSOT, V2 non-authoritative, sem scan/backfill/cutover, produção intacta, contracts decoupled, regressão 11.B–11.O.

---

## 22. Safety Confirmation

```
PRODUCTION_CHANGED = NO
NO PUSH
NO DEPLOY
NO TENANT CUTOVER
NO HISTORICAL MUTATION
NO REAL CLINIC / PATIENT / PII
```
