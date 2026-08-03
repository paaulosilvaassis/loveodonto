# PHASE_9_4A — Operational Recovery (encerramento formal)

**Data do relatório:** 2026-08-03  
**Branch:** `architecture-consolidation`  
**Checkpoint:** `5b29249` — `checkpoint: estado estável Console, Auth e primeiro acesso.`  
**Escopo:** Encerrar incidente operacional Console/Auth/primeiro acesso; reconciliar documentação; **não** iniciar Wave 3B / backfill / dual-write / cutover.  
**Commit deste relatório:** não (documentação apenas nesta fase de encerramento).  
**Push/deploy presumidos:** não.

---

## Estado final declarado

Incidente operacional **encerrado** no checkpoint `5b29249`, com stack local reportada como funcional pelo operador (Console `:5177`, App `:5176`, Admin API `:3001`).

Este documento separa:

1. **Evidência de código / commit / testes** (verificável no repositório).  
2. **Estado comprovado pelo operador** (validação humana de fluxos UI/Auth; não reexecutada integralmente neste relatório).  
3. **Riscos residuais** (ainda observáveis no filesystem local).

---

## Causas raízes encontradas

### 1) Desalinhamento App × API × Console (Supabase)

**Evidência histórica (sessão operacional 2026-08-02):** App/API apontavam para staging `tckdjyunwmdpqmewrwvt` enquanto a Platform Console usava produção `uoepkwhqztmsjnzirpev` (`love-odonto-prod`). JWT de um projeto não valida no outro → falhas de login/Console/API cruzados.

**Correção operacional:** alinhamento do fluxo de Auth/Platform para `uoepkwhqztmsjnzirpev` (Console + Admin API + `VITE_SUPABASE_PLATFORM_URL`), conforme mensagem do checkpoint e sessão [RESTORE_PLATFORM_CONSOLE / ENV_ALIGNMENT](agent transcript).

**Evidência de código atual (`src/lib/supabaseClients.js`):** Auth SaaS usa `supabasePlatformClient` (`VITE_SUPABASE_PLATFORM_URL`). Cliente de dados do app usa `VITE_SUPABASE_APP_URL` (fallback para platform).

### 2) Timeout Auth edge (HTTP 522) confundido com exclusão de admin

**Evidência histórica:** após exclusão da clínica Implanprime, a tela `:5177/login` mostrou timeout 522 no `/auth/v1/token`. Auditoria somente-leitura confirmou que `admin@loveodonto.com` **permanecia** em `auth.users` e `platform_admin_users` (`role_slug=super_admin`, `is_active=true`, UUIDs alinhados). O bloqueio era **edge Auth**, não ausência de perfil.

### 3) Proxy `/__supabase` (Console only)

**Evidência de código:**

- `console/src/lib/supabaseConsole.js` — em DEV, `getSupabaseConsoleRequestBaseUrl()` → `origin + /__supabase`.  
- `console/vite.config.js` — proxy `/__supabase` com rewrite removendo o prefixo.  
- App (`src/lib/supabaseClients.js` + `vite.config.js`) **não** usa `/__supabase` (URL absoluta pública), para evitar 404 sem rewrite.

### 4) `raceWithTimeout is not defined` pós primeiro acesso

**Evidência:** após definir senha e redirecionar para `/gestao/dashboard`, a UI exibiu `Erro ao validar acesso da clínica` / `raceWithTimeout is not defined`.

**Causa raiz:** `TenantContext.jsx` chamava `raceWithTimeout` sem import estável do helper em `src/utils/async.js` (já usado por `AuthContext` / `saasSessionResolver`).

**Correção:** `import { raceWithTimeout } from '../utils/async.js';` em `src/tenant/TenantContext.jsx`.  
**Testes:** `src/__tests__/async.test.js` (comportamento + import de `TenantContext`); `src/__tests__/authTenantFlow.test.js`.

### 5) Recriação de tenant de teste / primeiro acesso

**Estado comprovado pelo operador (não revalidado por escrita remota neste relatório):**

- clínica Implanprime excluída e recriada;  
- responsável provisionado;  
- reenvio de acesso executado;  
- primeiro acesso + senha definidos;  
- tenant-context e dashboard abertos.

**Observação obrigatória:** dados e usuários de teste foram **recriados**; não tratar o tenant atual como contínuo ao estado pré-exclusão.

---

## Correções aplicadas (código no checkpoint)

| Área | Arquivos / artefatos | Natureza |
|------|----------------------|----------|
| `raceWithTimeout` | `src/tenant/TenantContext.jsx`, `src/utils/async.js`, `src/utils/promiseTimeout.js` (re-export), testes `async` / `authTenantFlow` | Correção funcional no checkpoint |
| Console Auth / proxy | `console/src/lib/supabaseConsole.js`, `console/vite.config.js`, `console/src/auth/PlatformAuthContext.jsx` | Infra de login Console em DEV |
| Platform admin gate | `server/lib/platform/consoleAccess.js` (`platform_admin_users`) | Fail-closed se perfil inativo/ausente |
| Primeiro acesso | `src/utils/firstAccessSession.js`, `src/auth/FirstAccessRedirectGuard.jsx`, `detectSessionInUrl: false` no platform client | Evita corrida no link de convite |
| Env alinhamento | `.env.local` / `server/.env` / `console/.env` (gitignored) | Operacional; **não** versionado no commit |

Mensagem do commit `5b29249` (evidência Git):

> Consolida o fluxo Platform Console + App/API no mesmo Supabase, resend-access com Bearer, e o import de raceWithTimeout no TenantContext após o dashboard.

---

## Ambientes envolvidos

| Camada | Porta (local) | Projeto Supabase (refs) |
|--------|---------------|-------------------------|
| Platform Console | `5177` | `uoepkwhqztmsjnzirpev` (`VITE_CONSOLE_SUPABASE_URL`) |
| Admin API | `3001` | `uoepkwhqztmsjnzirpev` (`server/.env` → `SUPABASE_URL`) |
| App Auth (platform client) | `5176` | `uoepkwhqztmsjnzirpev` (`VITE_SUPABASE_PLATFORM_URL`) |
| App data client | `5176` | **Atenção:** `VITE_SUPABASE_APP_URL` no `.env.local` local ainda referencia staging `tckdjyunwmdpqmewrwvt` (risco residual) |
| Staging (migrations Phase 9.x / linkedRef histórico) | n/a neste incidente | `tckdjyunwmdpqmewrwvt` — **não misturar** com cutover Pacientes |

**Projeto usado no fluxo operacional validado pelo operador:** `uoepkwhqztmsjnzirpev`.

---

## Validações realizadas (operador + código)

| Validação | Tipo de evidência | Resultado |
|-----------|-------------------|-----------|
| Login Platform Console | Operador + sessão restore | OK |
| Perfil `platform_admin_users` | Auditoria read-only prévia | Admin ativo, UUID alinhado |
| Recriação Implanprime / convite / senha | Operador | OK |
| Dashboard App após `raceWithTimeout` | Operador | OK |
| Import `raceWithTimeout` no TenantContext | Código em HEAD | Presente |
| Checkpoint Git | `git log -1` = `5b29249` | OK |
| Push/deploy | Não presumir | Não afirmado neste relatório como requisito |

---

## Riscos residuais

1. **`VITE_SUPABASE_APP_URL` ainda em staging (`tckd…`)** enquanto Auth platform / API / Console estão em produção (`uoep…`). O preflight `app + API` compara PLATFORM↔API (não APP_URL). Auth SaaS usa platform (prod); o `supabaseAppClient` pode ainda mirar staging.  
2. **Produção (`uoepkwhqztmsjnzirpev`) usada em fluxo de teste** — tenant/usuários de teste recriados; cuidado extremo com writes/migrations remotas.  
3. **Wave 3A Pacientes** ainda depende de snapshot IndexedDB real; não liberar Wave 3B sem auditoria de dados.  
4. **Arquivos pendentes locais** (logs, exports) fora do checkpoint — não misturar com evidência clínica.  
5. Push/deploy do checkpoint: **não presumir** sem verificação explícita nesta fase.  
6. **`npm run build` (`tsc -b`)** falha por dívida TS pré-existente; `vite build` e Console build passam.

---

## Relação com Phase 9.4A Wave 3A

- Wave 3A (auditoria IndexedDB Pacientes) permanece **bloqueada por ausência de snapshot real** até export humano/local.  
- Relatório prévio: `docs/reports/PHASE_9_4A_WAVE3A_PATIENT_DATA_READINESS_AUDIT.md`.  
- Esta recovery **não** altera flags de Pacientes, repositories, migrations 025/027, nem SSOT IndexedDB.  
- `linkedRef` histórico das waves 9.4A schema: `tckdjyunwmdpqmewrwvt` (staging local disposable) — **separado** do projeto operacional de Console/Auth acima.

---

## Estado final

| Item | Valor |
|------|--------|
| Incidente operacional | **ENCERRADO** (documentado) |
| Checkpoint | `5b29249` |
| Branch | `architecture-consolidation` |
| Backfill / dual-write / cutover Pacientes | **não iniciados** |
| Flags Pacientes | permanecem off (verificar no gate) |
| Dados de teste | recriados (Implanprime / usuários) |
| Próximo passo autorizado | Gate de estabilidade → retomar Wave 3A (snapshot) |

---

## Proibições reafirmadas

Não executar: backfill, dual-write, leitura Supabase de Pacientes via flag, cutover, `db push`, deploy automático, commit automático nesta fase de documentação, exclusão de dados, alteração de tenants/usuários.

---

## Gate de estabilidade (2026-08-03)

### PHASE_9_4A_OPERATIONAL_RECOVERY_GATE_PASS

| Item | Resultado |
|------|-----------|
| branch | `architecture-consolidation` |
| commit atual | `5b29249` |
| testes Auth/Storage/Platform | `saasAuthStorage` 12/12, `apiCoreWave3iMigration` (consoleAccess) 26/26 |
| testes primeiro acesso | `firstAccessSession` 9/9 |
| testes tenant-context / raceWithTimeout | `async` 3/3, `authTenantFlow` 10/10, `apiCoreAuthTenant` 24/24 |
| proxy `/__supabase` | contrato estático **6/6 PASS** (sem suite dedicada; Console Vite + client) |
| Phase 9.4A wave1/security/wave2/wave3a | 8+10+9+14 = **41/41 PASS** |
| build App `npm run build` (`tsc -b && vite`) | **FAIL** — erros TS pré-existentes em `domain-events` / CRM repositories (**não** regressão do incidente; não corrigidos) |
| build App `vite build` | **PASS** |
| build Console `npm run console:build` | **PASS** |
| arquivos pendentes (não commitados) | logs locais, `docs/reports/PHASE_9_4A_OPERATIONAL_RECOVERY.md`, README index, `.gitignore` snapshots |
| pronto para retomar Wave 3A | **sim** (auditoria read-only; sem backfill) |

**Classificação da falha de `tsc -b`:** dívida TypeScript pré-existente, fora do escopo do incidente Console/Auth/`raceWithTimeout`. Limite de correções automáticas (2) **não** aplicado — não é regressão direta.
