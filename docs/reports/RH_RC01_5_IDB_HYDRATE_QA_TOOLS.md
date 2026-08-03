# Love Odonto V3 — RC-01.5 Hidratação IDB via QA Tools

**Documento:** `docs/reports/RH_RC01_5_IDB_HYDRATE_QA_TOOLS.md`  
**Ticket:** RC-01.5 — Hidratação IDB via QA Tools  
**Data:** 2026-06-30  
**Ambiente:** Staging `tckdjyunwmdpqmewrwvt` · Tenant `7aba7127-409c-4ea4-8dbc-807efc5e189c`  
**Produção:** bloqueada via `qaToolsGuard` + `assertStagingSupabaseHost`

---

## Sumário

Implementada ação **"RH Hydrate IDB from Supabase"** em `/dev/qa-tools`. Lê `public.collaborators` com client SaaS autenticado e escreve **somente** em `IndexedDB.collaborators[]`.

| Garantia | Status |
|----------|--------|
| Escrita Supabase | **Não** (`supabaseWritesExecuted: false`) |
| `RH_SUPABASE_READ_PRIMARY` | **Não alterado** (permanece `false`) |
| `appointments` / `professionalId` | **Não tocados** |
| Satellites RH locais (`collaboratorPhones`, etc.) | **Não tocados** |
| Produção | **Bloqueada** |

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/repositories/collaborator/collaboratorQaIdbHydrate.ts` | Plano + apply (insert/update/skip/conflict) |
| `src/services/rhQaToolsService.js` | `runRhHydrateIdbQa()` |
| `src/pages/dev/QaToolsPage.jsx` | Botão, painel de resultado, sequência recomendada |
| `src/__tests__/collaboratorQaIdbHydrate.test.js` | Teste insert + correção legacy id |

---

## Comportamento da hidratação

1. **Fetch remoto:** `collaborators.select('*')` via `supabasePlatformClient` (sessão SaaS).
2. **Match local** (por tenant): `legacy_id` → `uuid` → `email`.
3. **Insert:** colaborador ausente (ex.: Melissa).
4. **Update:** merge campos RH + `id` = `legacy_id` + `uuid` espelhado.
5. **Stale cleanup:** remove registro local com legacy id antigo quando email match corrige id (ex.: Juliana `col-saas-*` → `col-f93e5dbf-*`).
6. **Skip:** registro já idêntico.
7. **Conflict:** ambiguidade e-mail ou legacy id duplicado.

Relatório `[RH_IDB_HYDRATE]`:

```json
{
  "tag": "[RH_IDB_HYDRATE]",
  "inserted": [],
  "updated": [],
  "skipped": [],
  "conflicts": [],
  "errors": [],
  "localCountBefore": 3,
  "localCountAfter": 4,
  "remoteCount": 4,
  "supabaseWritesExecuted": false
}
```

---

## Procedimento operacional (browser)

Pré-requisitos: login staging, tenant `7aba7127-…`, `.env.local` apontando staging.

1. Abrir `/dev/qa-tools`
2. **RH Hydrate IDB from Supabase**
3. **RH UUID Mirror** (idempotente pós-hydrate)
4. **RH Shadow QA**

### Critério esperado pós-sequência

| Métrica | Esperado |
|---------|----------|
| `localCount` | 4 |
| `remoteCount` | 4 |
| `blockingDiffCount` | 0 |
| `transitionalDiffCount` | 0 |
| `canPromoteReadPrimary` | true |

> Difs `updated_at` informational são aceitáveis (tier informational, não blocker).

---

## Validação automatizada

```powershell
npx vitest run src/__tests__/collaboratorQaIdbHydrate.test.js
```

**Resultado:** 1/1 PASS — insert Melissa + correção legacy Juliana + `localCountAfter=4`.

---

## Validação browser

**Pendente execução manual** nesta sessão (IndexedDB live do navegador). Após deploy local com HMR:

1. Executar sequência § Procedimento operacional.
2. Exportar JSON do último Shadow QA.
3. Anexar métricas ao fechamento RC-01.5.

---

## Conclusão

| Item | Status |
|------|--------|
| Implementação QA Tools | **Concluída** |
| Testes unitários | **PASS** |
| Zero write Supabase | **Garantido no código** |
| Produção bloqueada | **Sim** |
| Shadow QA browser | **Validar manualmente** |
| Commit | **Nenhum** |

---

*RC-01.5 — escrita IDB local apenas; Supabase staging read-only.*
