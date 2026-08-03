# Love Odonto V3 — RC-01.2 Diagnóstico IDB × Supabase

**Documento:** `docs/reports/RH_RC01_IDB_SUPABASE_DIVERGENCE_DIAGNOSIS.md`  
**Ticket:** RC-01.2 — Diagnóstico da divergência IndexedDB × Supabase  
**Data:** 2026-06-30  
**Tipo:** **Somente diagnóstico** — nenhum dado, código, banco ou Supabase alterado  
**Ambiente:** Staging Supabase `tckdjyunwmdpqmewrwvt` · Tenant `7aba7127-409c-4ea4-8dbc-807efc5e189c`  
**Produção:** `uoepkwhqztmsjnzirpev` — **não tocada**

---

## Sumário executivo

| Métrica (QA Tools Shadow QA — evidência operacional) | Valor |
|------------------------------------------------------|-------|
| `localCount` | **3** |
| `remoteCount` | **4** |
| `blockingDiffCount` | **8** |
| `transitionalDiffCount` | **3** |
| `canPromoteReadPrimary` | **false** |

**Veredicto RC-01.2:** **NOT READY**

A divergência **3 × 4** não é bug de leitura do QA Tools. É efeito combinado de:

1. **Roster Supabase RH completo (4)** após backfill do export, incluindo Melissa.
2. **IndexedDB local incompleto (3)** — populado por bootstrap + sync de `tenant_users`, **sem** hidratação RH a partir de `public.collaborators`.
3. **Bifurcação intencional de `legacy_id`** no seed staging entre `tenant_users.collaborator_id` (Juliana/Renata) e `collaborators.legacy_id` (export RH) — o shadow compare correlaciona **somente por `legacy_id`**.

---

## Evidência operacional reportada

Execução em `/dev/qa-tools` → **RH Shadow QA** (pós-correção RC-01.1D do client autenticado):

```
localCount = 3
remoteCount = 4
blockingDiffCount = 8
transitionalDiffCount = 3
canPromoteReadPrimary = false
```

Mensagens observadas:

- Registro ausente no IndexedDB local
- Registro ausente no Supabase remoto
- Contagem divergente: local=3 remote=4

> **Limitação metodológica:** o IndexedDB live do navegador **não pode ser lido server-side**. A tabela IDB abaixo é **reconstrução de alta confiança** a partir das métricas do Shadow QA, do seed staging documentado e do fluxo de persistência local (`tenantCollaboratorService` + `bootstrapSaasTenantLocalDb`). Para confirmação literal linha a linha, usar export via QA Tools ou `scripts/snippets/rh-export-browser-snippet.js`.

---

## 1. Supabase staging — 4 colaboradores

Consulta read-only em `public.collaborators` (`tenant_id = 7aba7127-409c-4ea4-8dbc-807efc5e189c`, `deleted_at IS NULL` via RLS):

| uuid | legacy_id | email | apelido | status | agenda_enabled | tenant_id |
|------|-----------|-------|---------|--------|----------------|-----------|
| `9284488d-c0b1-4200-b728-82f757aaf1e0` | `col-saas-362c17b7-0abd-4d3f-8669-69c8f409b341` | paulo+staging@implanprime.test | Paulo | ativo | false | `7aba7127-409c-4ea4-8dbc-807efc5e189c` |
| `6eeabd6b-0a8b-4d88-8715-400e092d3212` | `col-f93e5dbf-bcc0-4c6d-8f94-f90f7f46bb70` | juliana+staging@implanprime.test | Dra. Juliana | ativo | true | `7aba7127-409c-4ea4-8dbc-807efc5e189c` |
| `e3f0f230-4dfa-44f3-9f4d-41c6babcef03` | `col-6b85c4cb-345a-4cff-9636-f07ac1aea9f2` | renata+staging@implanprime.test | Renatinha | ativo | false | `7aba7127-409c-4ea4-8dbc-807efc5e189c` |
| `140c5833-7fe8-429a-ace2-ba79d774d85a` | `col-c52fd5ce-4bc9-4c7d-a4c0-298525d401a3` | melissa+staging@implanprime.test | Melissa | ativo | false | `7aba7127-409c-4ea4-8dbc-807efc5e189c` |

Origem: backfill RH (`collaborators-export.json` remapped) em 2026-06-29 — **legacy_ids alinhados ao export**, não aos `collaborator_id` divergentes de `tenant_users`.

### Referência cruzada — `tenant_users` vs `collaborators.legacy_id`

| email | tenant_users.collaborator_id | collaborators.legacy_id | Alinhamento |
|-------|------------------------------|-------------------------|-------------|
| paulo+staging@… | `col-saas-362c17b7-…` | `col-saas-362c17b7-…` | **OK** |
| juliana+staging@… | `col-saas-c9a3cc7e-…` | `col-f93e5dbf-…` | **DIVERGENTE** |
| renata+staging@… | `col-c92cf731-…` | `col-6b85c4cb-…` | **DIVERGENTE** |
| melissa+staging@… | `col-c52fd5ce-…` | `col-c52fd5ce-…` | **OK** (mas `tenant_users.status = inactive`, `has_system_access = false`) |

`collaborator_uuid` em `tenant_users` **já preenchido** para os 4 após backfill de IDs — divergência restante é **somente no campo text `collaborator_id`**, não no UUID.

---

## 2. IndexedDB local — 3 colaboradores (reconstrução)

Com base no fluxo de persistência local pós-login SaaS:

| id (legacy) | uuid (provável) | email | apelido | status | tenant_id | Fonte provável |
|-------------|-----------------|-------|---------|--------|-----------|----------------|
| `col-saas-362c17b7-…` | ausente ou = legacy (transitional) | paulo+staging@… | Paulo | ativo | `7aba7127-…` | `tenant_users` → `persistTenantCollaboratorsCache` |
| `col-saas-c9a3cc7e-…` | ausente ou = legacy (transitional) | juliana+staging@… | Dra. Juliana* | ativo | `7aba7127-…` | `tenant_users.collaborator_id` **divergente** |
| `col-c92cf731-…` | ausente ou = legacy (transitional) | renata+staging@… | Renatinha* | ativo | `7aba7127-…` | `tenant_users.collaborator_id` **divergente** |

\* Nomes/cargos no IDB podem ser stubs da API (`tenantCollaboratorService`) — menos completos que a ficha RH do export.

**Ausente no IDB (presente no Supabase):**

| legacy_id Supabase | email | apelido | Motivo provável |
|--------------------|-------|---------|-----------------|
| `col-c52fd5ce-…` | melissa+staging@… | Melissa | Existe em `public.collaborators` (backfill RH), mas **não entrou no cache local** via sync de `tenant_users` (usuária **inactive** / sem acesso sistêmico no seed). Bootstrap zera `collaborators[]` e **não repõe** do Supabase RH. |

### Contraste com export de referência

O arquivo `collaborators-export.json` (raiz do repo) contém **4** registros com legacy_ids do **export RH** (`col-f93e5dbf`, `col-6b85c4cb`, etc.) — estado **esperado pós-backfill**, não o estado típico do IDB browser pós-bootstrap + sync SaaS.

CLI read-only com esse export remapped: `localCount=4`, `remoteCount=4` — confirma que a divergência **3×4 é específica do IDB browser**, não do modelo de dados remoto.

---

## 3. Comparações

### 3.1 Por `legacy_id`

| legacy_id (chave shadow) | Supabase | IDB local (provável) | Resultado shadow |
|--------------------------|----------|----------------------|------------------|
| `col-saas-362c17b7-…` (Paulo) | ✓ | ✓ | Match parcial → diffs de campo (uuid transitional, `updated_at`) |
| `col-f93e5dbf-…` (Juliana RH) | ✓ | ✗ | **missing_local** |
| `col-saas-c9a3cc7e-…` (Juliana TU) | ✗ | ✓ | **missing_remote** |
| `col-6b85c4cb-…` (Renata RH) | ✓ | ✗ | **missing_local** |
| `col-c92cf731-…` (Renata TU) | ✗ | ✓ | **missing_remote** |
| `col-c52fd5ce-…` (Melissa) | ✓ | ✗ | **missing_local** |

### 3.2 Por e-mail

Correlação por e-mail **não é usada** pelo shadow compare (somente `legacy_id`). Por e-mail, Paulo/Renata/Juliana existem dos dois lados com IDs diferentes para Juliana/Renata — o compare trata como **dois pares distintos** (ausente local + ausente remoto).

Melissa: e-mail só no Supabase RH → **missing_local**.

### 3.3 Por `tenant_id`

Todos os registros Supabase e os locais reconstruídos usam `7aba7127-409c-4ea4-8dbc-807efc5e189c`. **Sem evidência de mismatch de tenant** como causa primária da contagem 3×4.

### 3.4 Decomposição das métricas Shadow QA

Modelo consistente com `blockingDiffCount=8` e `transitionalDiffCount=3`:

| Contribuição | blocking | transitional |
|--------------|----------|--------------|
| `missing_local` ×3 (Juliana RH, Renata RH, Melissa) | +3 | — |
| `missing_remote` ×2 (Juliana TU, Renata TU) | +2 | — |
| `count_mismatch` (3 vs 4) | +1 | — |
| `invalid_uuid` local ×3 (uuid não espelhado — RC-01.1 mirror pendente) | — | +3 |
| Diffs de campo no par Paulo (ex.: `updated_at`) | 0–2* | 0–1* |

\* Residual explicável se build anterior ao Ticket 1.12 (`agenda_enabled`) ou diffs adicionais no único par matched.

**Total modelado:** blocking **6–8**, transitional **3** — alinhado ao reportado.

---

## 4. QA Tools — leitura IndexedDB

| Aspecto | Valor | Código |
|---------|-------|--------|
| Database name | `appgestaoodonto` | `src/db/idbStorage.js` |
| Object store | `data` (keyPath `k`) | `src/db/idbStorage.js` |
| Chave da coleção | `collaborators` | `IDB_COLLABORATORS_COLLECTION` |
| Formato do registro | `{ k: 'collaborators', v: JSON.stringify([...]) }` | `idbStorage.js` + `loadDb()` |
| Leitura Shadow QA | `collaboratorIndexedDbRepository.list(tenantId)` | `rhQaToolsService.js` → `runRhShadowQa` |
| Leitura remota | `supabasePlatformClient` autenticado, `.from('collaborators').select('*').eq('tenant_id', …)` | `fetchRemoteCollaboratorsForShadow` |

**Conclusão:** QA Tools lê a coleção correta. A contagem 3 reflete o conteúdo real filtrado por tenant, não store errado.

---

## 5. `listLegacySync()` — retorno esperado

`collaboratorIndexedDbRepository.listLegacySync(filters, saasModeEnabled)`:

- Lê `loadDb().collaborators`
- Com SaaS + `tenantId`: filtra `tenant_id` / `tenantId` (**estrito** — linha sem tenant é **descartada**, diferente de `list()`)
- Filtros opcionais: `status`, `cargo`, `especialidade`
- **Não** filtra `deleted_at`, `active`, `is_active` por padrão

Para o tenant staging, **sem filtros extras**, `listLegacySync` deve retornar **3** — mesmo cardinality que `list()` usado pelo Shadow QA, salvo linhas órfãs sem `tenant_id` (incluídas em `list()`, excluídas em `listLegacySync`).

---

## 6. Filtros aplicados na leitura Shadow

| Filtro | `list()` QA Shadow | `listLegacySync()` | Fetch Supabase QA |
|--------|-------------------|--------------------|-------------------|
| `tenant_id` | Sim (`rowMatchesTenant`) | Sim (estrito) | Sim (`.eq('tenant_id')`) |
| `status` | Só se `filters.status` | Só se `filters.status` | Não (RLS + row ativo) |
| `deleted_at` / inativo | Só se `includeDeleted: false` em filters | Não | RLS exclui deletados |
| `agenda_enabled` | Só se filter explícito | Não | Não |

Shadow QA **não** aplica filtro de status — a diferença 3×4 **não** vem de colaborador inativo filtrado no compare (Melissa está **ativa** em `public.collaborators`).

---

## 7. Bootstrap / hidratação — causa estrutural

### 7.1 Bootstrap SaaS zera RH local

Em `bootstrapSaasTenantLocalDb` → `applyPlatformTenantToFreshState`:

```javascript
state.collaborators = [];
```

Disparado no login/switch de tenant (`AuthContext`). **Não** repopula colaboradores a partir do Supabase RH.

### 7.2 Repovoamento local atual

| Mecanismo | Escopo | Escreve IDB? | Alinha com `collaborators.legacy_id`? |
|-----------|--------|--------------|----------------------------------------|
| `listTenantCollaborators` → `persistTenantCollaboratorsCache` | Stubs a partir de `tenant_users` | Sim | **Parcial** — usa `tenant_users.collaborator_id` |
| RH backfill (`rh-backfill-to-supabase.mjs`) | Ficha RH completa | **Supabase only** | Sim (export legacy) |
| `mirrorCollaboratorUuidsToIndexedDb` | Campo `uuid` apenas | Sim | N/A |
| `syncCacheFromRemote` | Ficha RH completa do Supabase | Sim | Sim |

### 7.3 Hidratação existente (não acionada no staging atual)

`collaboratorRepository.syncCacheFromRemote(tenantId)` **já implementado** — faz `list` remoto + `upsertMirror` no IDB.

**Bloqueio:** exige `VITE_RH_SUPABASE_READ_PRIMARY=true` (`assertPrimarySupabaseRead`). Com flags staging atuais (`READ_PRIMARY=false`), **não roda** no fluxo normal nem no QA Tools.

**Não existe** rotina automática pós-bootstrap que chame `syncCacheFromRemote` ou importe o export RH para o IDB.

---

## 8. Colaborador ausente — identificação

| Papel | Colaborador | Conclusão |
|-------|-------------|-----------|
| **Ausente no IDB, presente no Supabase** | **Melissa** (`col-c52fd5ce-…`) | Causa primária da contagem **4 remoto / 3 local** |
| **Fantasma local (TU), ausente no Supabase RH** | Juliana TU id `col-saas-c9a3cc7e-…` | Causa `missing_remote` |
| **Fantasma local (TU), ausente no Supabase RH** | Renata TU id `col-c92cf731-…` | Causa `missing_remote` |
| **Presente no Supabase RH, ausente no IDB** | Juliana RH id `col-f93e5dbf-…` | Par duplo de `missing_local` |
| **Presente no Supabase RH, ausente no IDB** | Renata RH id `col-6b85c4cb-…` | Par duplo de `missing_local` |

---

## 9. Causa provável (root cause)

**Cadeia causal (ordenada):**

1. Seed staging **simula produção** com `collaborator_id` divergente em Juliana/Renata (`server/lib/stagingSeedImplanprime.js` — `DIVERGENT_TENANT_USER_COLLABORATOR_IDS`).
2. Backfill RH grava em Supabase os **legacy_ids do export** (`EXPORT_LEGACY_IDS`) — correto para RH remoto, mas **desalinhado** do text id em `tenant_users`.
3. Login SaaS executa bootstrap → **`collaborators = []`**.
4. Sync subsequente (`tenantCollaboratorService`) repõe **3 usuários ativos** com ids de `tenant_users` — **Melissa (inactive) não entra**.
5. Shadow compare correlaciona por `legacy_id` → **5 chaves discordantes** + count mismatch + uuid transitional (mirror RC-01.1 não executado no browser).
6. **Não há hidratação RH IDB ← Supabase** com flags atuais.

---

## 10. Risco

| Risco | Severidade | Descrição |
|-------|------------|-----------|
| Shadow QA bloqueia promoção read-primary | **Alto** | `canPromoteReadPrimary=false` correto — dados local/remoto não equivalentes |
| UI RH incompleta | **Alto** | Melissa invisível localmente; Juliana/Renata podem aparecer com stub vs ficha RH |
| Links colaborador ↔ prontuário/agenda | **Médio** | Dois legacy_ids para mesma pessoa quebram correlação shadow e futuros writes |
| Falso positivo pós-mirror UUID | **Médio** | Mirror resolve transitional (3), **não** resolve missing_local/missing_remote (5+) |
| Operação em produção | **Baixo neste ticket** | Escopo staging; padrão divergente espelha cenário prod documentado |

---

## 11. Opções de correção (para tickets futuros — **não executar aqui**)

| Opção | Descrição | Prós | Contras |
|-------|-----------|------|---------|
| **A. Hidratação controlada IDB ← Supabase** | QA/dev: executar `syncCacheFromRemote` com flag temporária ou ação dedicada nos QA Tools | Alinha ficha RH completa; usa legacy_id canônico do Supabase | Requer flag/guard; sobrescreve stubs locais |
| **B. Import controlado do export** | Restaurar `collaborators-export.json` remapped no IDB (ferramenta one-shot) | Reproduzível; já usado no backfill | Manual; não corrige divergência TU vs RH sozinho |
| **C. Alinhar `tenant_users.collaborator_id`** | Migration/script alinhando text id ao `collaborators.legacy_id` | Remove pares missing_local/missing_remote | Mutación Supabase; fora escopo RC diagnóstico |
| **D. RC-01.1 UUID Mirror + A** | Mirror uuid **depois** de roster alinhado | Fecha transitional diffs | Mirror sozinho **insuficiente** (evidência RC-01) |
| **E. Incluir inactive no cache local** | Alterar sync para persistir Melissa | Só corrige +1 count | Não resolve bifurcação Juliana/Renata |

---

## 12. Recomendação segura — próximo ticket

**Sequência recomendada (staging only, com guards):**

1. **RC-01.3 — Hidratação RH IDB (read-only Supabase → write IDB)**  
   - Expor nos QA Tools ação **“RH Cache Hydrate (dry-run / apply)”** que chama `syncCacheFromRemote` ou equivalente explícito, **somente** com `assertQaToolsAllowed` + tenant staging.  
   - Log `[RH_IDB_HYDRATE]` com contagem before/after.

2. **Validar pós-hidratação**  
   - Reexecutar Shadow QA → esperado: `localCount=4`, `missing_local` reduzido (Melissa presente).  
   - Juliana/Renata ainda podem divergir se hydrate usar Supabase legacy **sem** remover stubs TU — monitorar.

3. **RC-01.1 UUID Mirror (browser)**  
   - Após roster alinhado, executar mirror → `transitionalDiffCount → 0`.

4. **Ticket separado — alinhamento `tenant_users.collaborator_id`**  
   - Decisão de produto: unificar com `collaborators.legacy_id` ou ensinar shadow a correlacionar também por `collaborator_uuid`/email (mudança de compare — escopo Sprint 2).

5. **Só então** reavaliar `VITE_RH_SUPABASE_READ_PRIMARY=true` em staging.

**Não recomendado agora:** ativar read-primary, mirror isolado sem hydrate, ou alteração manual ad hoc no IDB sem relatório.

---

## 13. Checklist investigativo (RC-01.2)

| # | Pergunta | Resultado |
|---|----------|-----------|
| 1 | Listar 4 colaboradores Supabase | ✓ Tabela §1 |
| 2 | Listar 3 colaboradores IDB | ✓ Reconstrução §2 (browser não lido diretamente) |
| 3 | Identificar ausente / mismatches | ✓ §3, §8 |
| 4 | QA Tools lê coleção correta? | ✓ §4 |
| 5 | `listLegacySync()` retorna 3 ou 4? | **3** (mesmo cardinality que `list()` no cenário provável) |
| 6 | Filtros tenant/status/deleted? | ✓ §6 — não explicam 3×4 sozinhos |
| 7 | IDB desatualizado por falta de bootstrap/hydration? | ✓ **Sim** — §7 |
| 8 | Função de hidratação já existe? | ✓ `syncCacheFromRemote` — bloqueada por `READ_PRIMARY=false` |

---

## 14. Conclusão

| Critério | Status |
|----------|--------|
| Diagnóstico 3×4 explicado | **Sim** |
| Causa raiz identificada | **Sim** — bootstrap + sync TU parcial + bifurcação legacy_id + ausência de hydrate RH |
| QA Tools confiável | **Sim** — leitura correta; métricas refletem estado real |
| Pronto para `RH_SUPABASE_READ_PRIMARY` | **Não** |
| **RC-01.2 READY** | **NOT READY** |

---

## Referências

| Artefato | Caminho |
|----------|---------|
| QA Tools service | `src/services/rhQaToolsService.js` |
| IDB repository | `src/repositories/collaborator/collaboratorIndexedDbRepository.ts` |
| Shadow compare | `src/repositories/collaborator/collaboratorShadowValidation.ts` |
| Classificação diffs | `src/repositories/collaborator/collaboratorShadowDiffClassification.ts` |
| Bootstrap SaaS | `src/services/saasTenantBootstrapService.js` |
| Sync TU → IDB | `src/services/tenantCollaboratorService.js` |
| Hydrate (existente) | `src/repositories/collaborator/collaboratorRepository.ts` → `syncCacheFromRemote` |
| Seed staging (divergência intencional) | `server/lib/stagingSeedImplanprime.js` |
| Export RH referência | `collaborators-export.json` |
| RC-01 operacional | `docs/reports/RH_RC01_OPERATIONAL_VALIDATION.md` |

---

*Documento gerado em modo diagnóstico RC-01.2. Nenhuma mutação aplicada.*
