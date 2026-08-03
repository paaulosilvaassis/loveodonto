# RH RC-03 — Soak Test Read Primary em Staging

**Data:** 2026-06-29 (atualizado 2026-07-07 — RC-03.7 / **RC-03.8 reteste**)  
**Projeto Supabase:** `tckdjyunwmdpqmewrwvt` (staging)  
**Tenant:** `7aba7127-409c-4ea4-8dbc-807efc5e189c`  
**Usuário soak:** `paulo+staging@implanprime.test` (role `master`)  
**Produção:** `uoepkwhqztmsjnzirpev` — **não tocada**

---

## 1. Resumo executivo

| Dimensão | Resultado |
|----------|-----------|
| Pré-validação técnica (automated + SQL) | **PASS** |
| Checklist manual browser (15 passos) | **BLOQUEADO** (522 persiste pós-restart — RC-03.8) |
| Flag `READ_PRIMARY` ativa no runtime local | **NÃO** (pendente pós-recovery) |
| **Veredicto RC-03** | **`BLOCKED_EXTERNAL`** |
| Recomendação produção | **Manter bloqueada** até soak manual completo |

> **Atualização RC-03.8 (2026-07-07 ~18:00 UTC):** Reteste após **restart do projeto staging** pelo Dashboard. **522 persiste** em Auth POST e REST. Evidência browser/DevTools adicionada em §1.2.1.

> **Atualização RC-03.7 (2026-07-07):** O veredicto **não é NOT READY por falha do app**. O soak está **suspenso** por incidente externo no data plane Supabase staging (HTTP 522). Ver §1.1 e `docs/reports/RC-03.7_SUPABASE_STAGING_INCIDENT_BLOCKER.md`.

O RC-02 entregou a arquitetura correta. Itens pendentes **antes** do incidente (E-01 flag READ_PRIMARY, checklist manual) **permanecem válidos para retomada**, mas **não desbloqueiam** o soak enquanto Auth staging retornar 522.

---

## 1.1 Bloqueio operacional externo — Supabase staging HTTP 522

**Data do bloqueio:** 2026-07-07  
**RC relacionados:** RC-03.6 (auditoria CORS), RC-03.7 (registro oficial)

| Item | Detalhe |
|------|---------|
| **Causa** | Data plane Supabase staging indisponível — `POST /auth/v1/token` e REST com key válida retornam **HTTP 522** (Cloudflare timeout) |
| **Sintoma no app** | Login falha; DevTools mostra "No Access-Control-Allow-Origin" (**efeito colateral** do 522, não misconfig CORS) |
| **Love Odonto** | Código correto — `signInWithPassword()` confirmado; falha reproduzida **fora do browser** |
| **Produção** | Operacional — **não usar** como workaround |
| **Veredicto** | **`BLOCKED_EXTERNAL`** |

### Evidências (RC-03.6)

- Project status MCP: `ACTIVE_HEALTHY` (control plane only)
- `OPTIONS /auth/v1/token` → **200** + CORS `*`
- `POST` sem apikey → **401** + CORS `*`
- `POST` com anon key válida → **522**, sem CORS
- REST com key válida → **522**; com key inválida → **401** + CORS `*`
- Edge Functions staging: **0**; RLS não afeta `/auth/v1/token`

### Retomada

Soak retoma quando critérios RC-03.7 §11 forem atendidos (Auth/REST respondem JSON em <5s, login browser OK). Então executar checklist §3 e resolver E-01 se ainda aplicável.

---

## 1.2 Reteste pós-restart staging (RC-03.8)

**Data:** 2026-07-07 ~18:00 UTC  
**Ação operacional:** Restart do projeto `tckdjyunwmdpqmewrwvt` via Supabase Dashboard (manual)  
**Alterações:** nenhuma em código, banco, migrations ou commit

### Checklist RC-03.8

| # | Passo | Status | Evidência |
|---|-------|--------|-----------|
| 1 | `npm run env:check` | ✅ **PASS** | `[preflight] Supabase alinhado (API + Console): tckdjyunwmdpqmewrwvt.supabase.co` |
| 2 | `npm run dev` | ✅ **OK** | App já ativo em `http://localhost:5176/`; Admin API `:3001` |
| 3 | Login staging (`paulo+staging@implanprime.test`) | ❌ **FALHA** | Browser: ver §1.2.1; probe CLI: `signInWithPassword` → HTML 522 |
| 4 | Network `POST /auth/v1/token?grant_type=password` | ❌ **522** | Browser: `net::ERR_FAILED 522`; probe CLI: ~19,4s, sem CORS |
| 5 | Abrir `/dev/qa-tools` | ⬜ **NÃO EXECUTADO** | Bloqueado — login impossível |
| 6 | RH Shadow QA (UI) | ⬜ **NÃO EXECUTADO** | Bloqueado — requer sessão autenticada |

### Probes HTTP (fora do browser — RC-03.8)

| Teste | Status | Tempo | CORS | Notas |
|-------|--------|-------|------|-------|
| `OPTIONS /auth/v1/token?grant_type=password` | **200** | ~180ms | `*` | Preflight OK |
| `POST` credenciais inválidas + anon key | **522** | ~19,8s | ausente | HTML Cloudflare |
| `POST` credenciais staging + anon key | **522** | ~19,4s | ausente | HTML Cloudflare |
| `signInWithPassword()` (supabase-js) | **Falha** | ~19,6s | — | `Unexpected token '<'` (body HTML) |

### Shadow QA (CLI read-only — proxy do passo 6)

Comando: `node scripts/rh-shadow-read-qa.mjs`

| Métrica esperada | Resultado RC-03.8 |
|------------------|-------------------|
| `localCount=4` | **N/A** — script abortou |
| `remoteCount=4` | **N/A** |
| `matchPercent=100%` | **N/A** |
| `blockingDiffCount=0` | **N/A** |
| `transitionalDiffCount=0` | **N/A** |
| `canPromoteReadPrimary=true` | **N/A** |

**Erro:** `GET /rest/v1/collaborators` → **HTTP 522** (Connection timed out). Mesmo padrão RC-03.6/RC-03.7.

### 1.2.1 Evidência browser / DevTools (RC-03.8)

**Sessão:** `http://localhost:5176/login` — Microsoft Edge, 2026-07-07  
**Credenciais:** `paulo+staging@implanprime.test` / `StagingTest2026!`

| Evidência | Observação |
|-----------|------------|
| `[STABILITY] SUPABASE_CONFIG_OK` | Console — `{ ok: true, issues: [] }` — env local (URL + anon key staging) **correto** |
| Requisição Auth | Login dispara corretamente `POST https://tckdjyunwmdpqmewrwvt.supabase.co/auth/v1/token?grant_type=password` |
| Stack trace | `LoginPage.jsx` → `signInSaaSWithPassword` → `saasAuthService.js` (`attemptSignIn` / `signInWithPassword`) |
| Resposta Network | **`net::ERR_FAILED 522`** — Connection timed out (Cloudflare) |
| Console CORS | `Access to fetch … has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header` — **efeito colateral** do 522 (página HTML de erro sem headers CORS) |
| UI | *"Não foi possível conectar ao Supabase para autenticar…"* — mensagem genérica quando fetch falha; **não** indica misconfig de env |

**Conclusão browser:** o app está **correto** — config OK, endpoint e grant type corretos. O **Supabase staging data plane segue indisponível** (522). O erro CORS no DevTools **não** é causa raiz.

### Veredicto RC-03.8

| Status | **`BLOCKED_EXTERNAL`** |
|--------|------------------------|
| Restart resolveu? | **Não** — data plane staging continua indisponível |
| Evidência browser | Confirma probes CLI (§1.2) — mesmo 522 no `POST /auth/v1/token` |
| Próxima ação | Escalar ticket Supabase Support (modelo RC-03.7 §10); aguardar recovery real |

### Recomendações RC-03.8

| # | Recomendação |
|---|--------------|
| 1 | **Não alterar código** — Love Odonto já validado (RC-03.3 a RC-03.6) |
| 2 | **Não apontar staging para produção** — workaround proibido (guards RC-02) |
| 3 | **Escalar Supabase Support** — project ref `tckdjyunwmdpqmewrwvt`, HTTP 522 pós-restart |
| 4 | **Retomar RC-03 somente quando** `POST /auth/v1/token` responder **JSON** (400/401 ou 200) em **<5s**, com CORS presente |

---

## 2. Bloqueador operacional (ação imediata)

No `.env.local` atual (linha 43):

```
VITE_RH_SUPABASE_READ_PRIMARY=false   ← deve ser true para RC-03
```

**Correção necessária (sem commit):**

```env
VITE_RH_SUPABASE_READ_PRIMARY=true
```

Reiniciar `npm run dev` após alterar. Confirmar host staging em todas as URLs Supabase (`tckdjyunwmdpqmewrwvt`).

Referência: `.env.staging.local.example` (RC-02) já documenta `true`.

---

## 3. Checklist manual (browser)

Executar na ordem. Marcar ✅/❌ e anotar observações.

| # | Passo | Status | Observações |
|---|-------|--------|-------------|
| 1 | Login Paulo staging (`paulo+staging@implanprime.test`) | ⬜ PENDENTE | |
| 2 | Dashboard abre sem erro | ⬜ PENDENTE | |
| 3 | Menu **Dados da Equipe** abre (`/admin/colaboradores`) | ⬜ PENDENTE | |
| 4 | Lista exibe **4 colaboradores** ativos | ⬜ PENDENTE | Esperado: Paulo, Juliana, Renata, Melissa |
| 5 | Abrir ficha **Paulo** | ⬜ PENDENTE | |
| 6 | Abrir ficha **Juliana** | ⬜ PENDENTE | |
| 7 | Abrir ficha **Renata** | ⬜ PENDENTE | |
| 8 | Abrir ficha **Melissa** | ⬜ PENDENTE | |
| 9 | Aba **Permissões** da Melissa | ⬜ PENDENTE | |
| 10 | **Agenda** da Juliana (profissional clínico) | ⬜ PENDENTE | |
| 11 | Hard reload `Ctrl+Shift+R` — dados persistem | ⬜ PENDENTE | |
| 12 | **Offline** (DevTools → Network → Offline) — app continua utilizável | ⬜ PENDENTE | |
| 13 | **Online** novamente — rehydrate automático (lista coerente) | ⬜ PENDENTE | |
| 14 | Logout | ⬜ PENDENTE | |
| 15 | Login novamente — 4 colaboradores, sem regressão | ⬜ PENDENTE | |

### Procedimento de evidência (DevTools)

**Network (online):**
- Requests apenas para `*.supabase.co` com host `tckdjyunwmdpqmewrwvt`
- Endpoints esperados: `tenant_users`, `collaborators` (read), auth refresh
- **Não** deve aparecer `uoepkwhqztmsjnzirpev`

**Console:**
- Sem erros vermelhos
- Com `READ_PRIMARY=true`, mensagens DEV opcionais:
  - `[collaboratorRepository] listLegacySync: API síncrona legada usa IndexedDB até adoção async.`
  - `[RH] cache rehydrate` / `[RH] online cache sync` (debug only)

**Application → IndexedDB:**
- Após login online, `collaborators[]` deve conter 4 registros do tenant

**QA Tools (`/dev/qa-tools`):**
- Rodar **Shadow QA** após passos 1–11
- Esperado RC-01 baseline: `matchPercent: 100`, `canPromoteReadPrimary: true`, `blockingDiffCount: 0`

---

## 4. Checklist técnico

| # | Critério | Status | Evidência |
|---|----------|--------|-----------|
| T1 | Leituras RH online passam pelo Supabase (autoridade) | ⚠️ PARCIAL | Arquitetura RC-02: `syncCacheFromRemote` / `listCore` leem Supabase; UI sync usa IDB **como cache hidratado**. **Dados da Equipe** usa `tenant_users` API (Supabase) + enriquecimento IDB (`tenantCollaboratorService.js`). Flag READ_PRIMARY ainda **off** no `.env.local`. |
| T2 | IndexedDB é cache, não autoridade | ✅ PASS | `listLegacySync` documentado como cache; hydrate via `collaboratorRepositorySync.ts`; `tenantCollaboratorService` declara API como autoridade. |
| T3 | Fallback offline | ✅ PASS (unit) | Testes: source `indexeddb-offline`, sem call Supabase quando offline. Browser: **pendente** (passo 12). |
| T4 | Nenhuma escrita Supabase indevida | ✅ PASS | `VITE_RH_SUPABASE_WRITE=false`; `createCore`/`updateCore` bloqueados; QA Tools zero write Supabase. |
| T5 | Nenhum erro console | ⬜ PENDENTE | Requer execução browser |
| T6 | Nenhum 401/403/404 indevido | ⬜ PENDENTE | Requer execução browser |
| T7 | Nenhum acesso produção | ✅ PASS | `.env.local`: todos hosts `tckdjyunwmdpqmewrwvt`; guard `PRODUCTION_SUPABASE_PROJECT_REF` em flags; teste unitário host prod bloqueia READ_PRIMARY. |
| T8 | QA Tools funcional | ⚠️ PARCIAL | Rota `/dev/qa-tools` ativa (`VITE_QA_TOOLS_ENABLED=true`); execução UI **pendente**. |
| T9 | Shadow QA 100% | ⚠️ PARCIAL | RC-01 validou 100% com IDB hidratado; reexecução browser **pendente** com READ_PRIMARY on. |

---

## 5. Evidências coletadas (automated / SQL)

### 5.1 Ambiente local

| Variável | Valor observado |
|----------|-----------------|
| `VITE_SUPABASE_APP_URL` | `https://tckdjyunwmdpqmewrwvt.supabase.co` ✅ |
| `VITE_SUPABASE_PLATFORM_URL` | `https://tckdjyunwmdpqmewrwvt.supabase.co` ✅ |
| `VITE_RH_SUPABASE_READ` | `true` |
| `VITE_RH_SUPABASE_READ_PRIMARY` | **`false`** ❌ |
| `VITE_RH_SUPABASE_WRITE` | `false` ✅ |
| `VITE_RH_SHADOW_READ` | `true` |
| `VITE_QA_TOOLS_ENABLED` | `true` |

Vitest `[STABILITY] SUPABASE_CONFIG_OK`: hosts app/platform/console = staging ✅

### 5.2 Supabase staging — roster (read-only SQL)

**4 colaboradores** ativos no tenant:

| Apelido | Nome | E-mail | Cargo | legacy_id (prefixo) |
|---------|------|--------|-------|---------------------|
| Paulo | Paulo Henrique Silva de Assis | paulo+staging@implanprime.test | Gestor Geral | col-saas-* |
| Dra. Juliana | Juliana | juliana+staging@implanprime.test | Implantodontista | col-f93e5dbf-* |
| Renatinha | Renata Pereira | renata+staging@implanprime.test | Auxiliar Administrativo | col-6b85c4cb-* |
| Melissa | Melissa Eduarda Guimarães | melissa+staging@implanprime.test | Recepcionista | col-c52fd5ce-* |

### 5.3 Integridade identidade (tenant_users × collaborators)

| E-mail | Role | uuid_ok | collaborator_id = legacy_id |
|--------|------|---------|-------------------------------|
| paulo+staging@… | master | ✅ | ✅ |
| juliana+staging@… | administrativo | ✅ | ✅ |
| renata+staging@… | administrativo | ✅ | ✅ |
| melissa+staging@… | gerente | ✅ | ✅ |

**4/4** `collaborator_uuid` alinhado com `collaborators.id`.

### 5.4 Testes automatizados

```
npm run test — 6 suites RH RC-03: 83/83 PASS
```

| Suite | Testes |
|-------|--------|
| collaboratorRepositoryWiring | 13 PASS |
| collaboratorRepositorySync | 3 PASS |
| collaboratorRepositoryFlags | 23 PASS |
| rhShadowReadQa | 7 PASS (incl. live staging count) |
| collaboratorShadowValidation | 23 PASS |
| collaboratorShadowDiffClassification | 14 PASS |

---

## 6. Arquitetura observada no soak (referência)

```
ONLINE — autoridade
├── tenant_users (API Supabase)     → lista Dados da Equipe
├── collaborators (Repository)      → hydrate IDB + cache (READ_PRIMARY)
└── UI sync                         → lê IDB hidratado (listLegacySync)

OFFLINE
└── UI → IndexedDB (cache) → UI

RECONEXÃO
└── evento online → syncCacheFromRemote → Supabase → IDB
```

**Nota RC-03:** A UI ainda consome APIs síncronas legadas (`collaboratorServiceReadAdapter.js` → `listLegacySync`). Com READ_PRIMARY, a **autoridade** é Supabase via hidratação async (login + online + `listCore`). Isso é intencional até RC-04 (adoção async completa na UI).

---

## 7. Erros encontrados

| ID | Severidade | Descrição | Correção |
|----|------------|-----------|----------|
| E-04 | **Bloqueador externo** | Supabase staging data plane HTTP **522** — Auth/REST timeout (RC-03.6/RC-03.7); **reteste RC-03.8 pós-restart: 522 persiste** | Ticket Supabase Support; aguardar recovery |
| E-01 | Pendente pós-recovery | `VITE_RH_SUPABASE_READ_PRIMARY=false` no `.env.local` — soak não exercita read-primary | Alterar para `true` e reiniciar dev server **após** E-04 resolvido |
| E-02 | Pendente pós-recovery | Checklist manual não executado (bloqueado por E-04) | Paulo executa passos §3 após login OK |
| E-03 | Pendente pós-recovery | Shadow QA 100% depende de IDB hidratado + execução QA Tools | Após E-04 + E-01, login online → Shadow QA |

**Nenhum bug de código identificado** nas validações automated/SQL desta sessão.

---

## 8. Correções necessárias

| Prioridade | Ação | Owner |
|------------|------|-------|
| **P0** | Aguardar recovery Supabase staging (E-04) — ver RC-03.7 | Supabase Support / Operador |
| P0 | `VITE_RH_SUPABASE_READ_PRIMARY=true` em `.env.local` + restart **após recovery** | Operador staging |
| P0 | Executar checklist manual §3 (15 passos) **após recovery** | QA / Paulo |
| P1 | Registrar Shadow QA pós-soak (screenshot ou JSON export) | QA |
| P2 | RC-04 (futuro): migrar `collaboratorServiceReadAdapter` para `listCore`/`getCore` async | Engenharia |

**Não aplicável neste RC:** alterações em banco, migrations, RLS, produção, remoção LEGACY_RC01.

---

## 9. Conclusão

### STAGING soak RC-03: **`BLOCKED_EXTERNAL`**

**Motivo primário (RC-03.7 / RC-03.8):** incidente Supabase staging — data plane HTTP **522** impede login e qualquer soak browser. **Restart pelo Dashboard (RC-03.8) não resolveu.**

**Itens pendentes do app (retomar após recovery):**
1. Flag read-primary **desligada** no ambiente local (`E-01`).
2. Checklist manual browser **incompleto** (`E-02`).
3. Shadow QA 100% **não reconfirmado** com READ_PRIMARY ativo (`E-03`).

> **Não usar NOT READY** para classificar falha de login atual — é **bloqueio externo**, não regressão Love Odonto.

### Quando estará READY?

**Fase 1 — Recovery Supabase (externo):**
- ✅ Auth `POST /auth/v1/token` retorna JSON em <5s (não 522)
- ✅ REST responde (não 522)
- ✅ Login browser staging OK

**Fase 2 — Soak RC-03 (pós-recovery):**
- ✅ `READ_PRIMARY=true` + dev server reiniciado
- ✅ 15/15 passos manuais OK
- ✅ Shadow QA: `matchPercent=100`, `blockingDiffCount=0`
- ✅ Zero erros 401/403/404/console

Então atualizar este relatório para **READY** e iniciar período de observação (7–14 dias) antes de qualquer discussão prod.

---

## 10. Recomendação para produção

| Recomendação | Detalhe |
|--------------|---------|
| **Não promover READ_PRIMARY para produção agora** | Soak RC-03 incompleto |
| Manter guards RC-02 | `applyProductionSafeLocks` + host prod |
| Manter `WRITE=false` em prod | Até RC write-path dedicado |
| Próximo gate prod | RC-03 READY + soak 7–14 dias + sign-off QA |

O RH V3 em staging está **tecnicamente preparado** (RC-02), mas a **validação operacional real** (RC-03) ainda depende da ativação da flag e do soak manual no browser.

---

## 11. Anexo — roteiro rápido pós-correção E-01

1. Editar `.env.local`: `VITE_RH_SUPABASE_READ_PRIMARY=true`
2. `npm run dev` (restart)
3. Login Paulo → Dados da Equipe → validar 4 nomes
4. `/dev/qa-tools` → **Shadow QA** → confirmar 100%
5. Offline test → Online test → Logout → Login
6. Atualizar colunas Status deste documento
7. Se tudo OK → mudar veredicto §9 para **READY**

**Zero commit** conforme instrução RC-03.
