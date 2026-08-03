# RH RC-03.1 — Precheck Read Primary (Staging)

**Data:** 2026-07-01  
**Execução:** automática (RC-03.1)  
**Projeto Supabase:** `tckdjyunwmdpqmewrwvt`  
**Tenant soak:** `7aba7127-409c-4ea4-8dbc-807efc5e189c`  
**Produção:** `uoepkwhqztmsjnzirpev` — **não alterada, não referenciada em URLs ativas**

---

## 1. Ambiente

| Item | Valor |
|------|-------|
| Repositório | `appgestaoodonto` (local Windows) |
| Modo | Dev stack (`npm run dev`) |
| App URL | http://localhost:5176/ |
| API URL | http://localhost:3001 |
| Arquivo env | `.env.local` (raiz) |

---

## 2. Host Supabase

| Variável | Host |
|----------|------|
| `SUPABASE_URL` | `tckdjyunwmdpqmewrwvt.supabase.co` ✅ |
| `VITE_SUPABASE_APP_URL` | `tckdjyunwmdpqmewrwvt.supabase.co` ✅ |
| `VITE_SUPABASE_PLATFORM_URL` | `tckdjyunwmdpqmewrwvt.supabase.co` ✅ |
| `VITE_CONSOLE_SUPABASE_URL` | `tckdjyunwmdpqmewrwvt.supabase.co` ✅ |

**Verificação produção:** nenhuma URL ativa aponta para `uoepkwhqztmsjnzirpev`.  
Comentário documental na linha 10 do `.env.local` (referência ao backup `.env.local.production`) — **não é endpoint ativo**; precheck **não abortou**.

---

## 3. Flags RH (`.env.local`)

| Flag | Valor | Status auditoria |
|------|-------|------------------|
| `VITE_RH_SUPABASE_READ_PRIMARY` | **`true`** | ✅ Ativo |
| `VITE_RH_SUPABASE_READ` | `true` | ✅ (obrigatório quando READ_PRIMARY=true — validação flags RC-02) |
| `VITE_RH_SUPABASE_WRITE` | `false` | ✅ |
| `VITE_QA_TOOLS_ENABLED` | `true` | ✅ |
| `VITE_RH_SHADOW_READ` | `true` | ✅ (observabilidade LEGACY_RC01) |
| `VITE_RH_COMPARE_IDB_SUPABASE` | `true` | ✅ |

**Nota RC-03.1:** o checklist original citava `RH_SUPABASE_READ=false`; isso **invalidaria** READ_PRIMARY (`READ_PRIMARY exige READ=true`). Configuração correta para soak: **READ=true + READ_PRIMARY=true**.

---

## 4. Resultado `npm run env:check`

```
> node ./scripts/preflight-local.mjs --mode stack

[preflight] Supabase alinhado (API + Console): tckdjyunwmdpqmewrwvt.supabase.co
```

| Check | Resultado |
|-------|-----------|
| Ambiente alinhado | ✅ |
| Staging | ✅ |
| API | ✅ |
| Console | ✅ |

**Exit code:** `0`

---

## 5. Dev server reiniciado

| Ação | Detalhe |
|------|---------|
| Processo anterior | Encerrado (PID `17948` na porta `5176`) |
| Novo processo | `npm run dev` (PID `13892`) |
| Preflight app | `Supabase alinhado (app + API): tckdjyunwmdpqmewrwvt.supabase.co` |
| Vite | `VITE v7.3.1 ready in 1492 ms` |
| Local | **http://localhost:5176/** ✅ |

Log confirma injeção de **17 variáveis** de `..\.env.local` no stack app+API.

---

## 6. Auditoria RC-03.1

| Critério | Resultado |
|----------|-----------|
| `RH_SUPABASE_READ_PRIMARY=true` | ✅ |
| `RH_SUPABASE_WRITE=false` | ✅ |
| `QA_TOOLS_ENABLED=true` | ✅ |
| Host staging em todas URLs | ✅ |
| Sem URL produção ativa | ✅ |
| Produção bloqueada (guard código) | ✅ `PRODUCTION_SUPABASE_PROJECT_REF=uoepkwhqztmsjnzirpev` força READ_PRIMARY=false se host prod |
| Banco / migrations / RLS | ✅ Não alterados |
| Código funcional | ✅ Não alterado |
| LEGACY_RC01 | ✅ Preservado |

---

## 7. Validação de arquitetura (estática — RC-02)

### Fluxo oficial (read-primary ativo)

```
Repository (listCore / syncCacheFromRemote)
        ↓
    Supabase (autoridade leitura)
        ↓
    Hydrate IndexedDB + cache memória
        ↓
    UI (APIs sync legadas leem cache IDB hidratado)
```

**Confirmado em código (sem modificação):**
- `collaboratorRepository.ts` — `listCoreFromSupabasePrimary`, `syncCacheFromRemote`
- `collaboratorRepositorySync.ts` — `hydrateCollaboratorIdbCache`
- `AuthContext.jsx` + bridge — rehydrate pós-login + evento `online`

### Fluxo proibido como primário

```
IndexedDB → Supabase (como fonte principal de leitura)
```

**Status:** ✅ Não utilizado como leitura primária com READ_PRIMARY=true.  
IDB é consultado pela UI sync **após** hidratação Supabase (login / online / listCore).

**Dados da Equipe (lista):** `tenantCollaboratorService` — autoridade `tenant_users` (Supabase API) + enriquecimento IDB.

---

## 8. Alterações realizadas nesta execução

| Arquivo / recurso | Alteração |
|-------------------|-----------|
| `.env.local` | `VITE_RH_SUPABASE_READ_PRIMARY`: `false` → **`true`** |
| `docs/reports/RH_RC03_PRECHECK.md` | **Criado** (este relatório) |
| Dev server | Reiniciado (porta 5176) |

**Não alterado:** código, banco, migrations, RLS, produção, LEGACY_RC01. **Zero commit.**

---

## 9. Conclusão

# **READY PARA SOAK TEST**

O ambiente local staging está configurado com **READ_PRIMARY ativo**, hosts exclusivamente staging, `env:check` OK e Vite rodando em http://localhost:5176/.

**Próximo passo:** executar checklist manual RC-03 (`docs/reports/RH_RC03_STAGING_SOAK_TEST.md`) no browser com Paulo staging.

---

## 10. Roteiro soak imediato

1. Abrir http://localhost:5176/
2. Login `paulo+staging@implanprime.test`
3. **Dados da Equipe** → 4 colaboradores
4. `/dev/qa-tools` → Shadow QA → confirmar 100%
5. Teste offline/online + logout/login
6. Atualizar `RH_RC03_STAGING_SOAK_TEST.md` para READY se tudo OK
