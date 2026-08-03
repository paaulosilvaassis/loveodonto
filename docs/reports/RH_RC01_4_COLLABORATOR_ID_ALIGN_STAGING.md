# Love Odonto V3 — RC-01.4 Alinhamento `collaborator_id` Text (Staging)

**Documento:** `docs/reports/RH_RC01_4_COLLABORATOR_ID_ALIGN_STAGING.md`  
**Ticket:** RC-01.4 — Alinhar `collaborator_id` text legado em staging  
**Data:** 2026-06-30  
**Ambiente:** Staging `tckdjyunwmdpqmewrwvt` · Tenant `7aba7127-409c-4ea4-8dbc-807efc5e189c`  
**Produção:** `uoepkwhqztmsjnzirpev` — **não tocada** (tenant staging ausente em prod)

---

## Sumário executivo

| Etapa | Resultado |
|-------|-----------|
| Dry-run | **2 UPDATE_PROPOSED** (Juliana, Renata) · Melissa **OK** · Paulo **NOT_FOUND** (já alinhado — ver §3) |
| Apply staging | **2 linhas aplicadas** · 0 erros |
| Validação SQL pós-apply | **4/4** `collaborator_id` = `legacy_id` · **4/4** `collaborator_uuid` = `collaborators.id` |
| Órfãos / duplicatas UUID | **0 / 0** |
| Shadow QA (CLI + export alinhado) | **canPromoteReadPrimary: true** · blockers **0** |
| Shadow QA (browser `/dev/qa-tools`) | **Pendente operacional** — ver §8 |
| **RC-01.4 Supabase** | **READY** |
| **RC read-primary browser** | **NOT READY** até QA Tools no IDB live |

---

## 1. Dry-run

**Comando:**

```powershell
$env:SUPABASE_URL="https://tckdjyunwmdpqmewrwvt.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role_staging>"

node scripts/collaborator-id-backfill.mjs `
  --tenant-id 7aba7127-409c-4ea4-8dbc-807efc5e189c `
  --rh-export ./collaborators-export.json
```

**Relatório:** `scripts/reports/collaborator-id-backfill-dryrun-2026-06-30T23-40-46-220Z.json`

| action | email | `collaborator_id` atual | `collaborator_id` resolvido |
|--------|-------|---------------------------|-----------------------------|
| **UPDATE_PROPOSED** | juliana+staging@… | `col-saas-c9a3cc7e-…` | `col-f93e5dbf-…` |
| **UPDATE_PROPOSED** | renata+staging@… | `col-c92cf731-…` | `col-6b85c4cb-…` |
| **OK** | melissa+staging@… | `col-c52fd5ce-…` | `col-c52fd5ce-…` |
| **NOT_FOUND** | paulo+staging@… | `col-saas-362c17b7-…` | — |

**Resumo:** `UPDATE_PROPOSED=2` · `OK=1` · `NOT_FOUND=1` · **AMBIGUOUS=0** · **CONFLICT=0** · **ERROR=0**

### Nota sobre Paulo (NOT_FOUND vs OK esperado)

Paulo **já estava alinhado** (`tenant_users.collaborator_id` = `collaborators.legacy_id` = `col-saas-362c17b7-…`). O script classifica `col-saas-*` como ID sintético e, sem convite RH “real” associado, retorna **NOT_FOUND** — **sem proposta de mutação**. Nenhuma alteração necessária ou aplicada para Paulo.

---

## 2. Apply staging

**Comando:**

```powershell
node scripts/collaborator-id-backfill.mjs `
  --tenant-id 7aba7127-409c-4ea4-8dbc-807efc5e189c `
  --rh-export ./collaborators-export.json `
  --apply --confirm APPLY
```

**Relatório apply:** dry-run reexecutado em `collaborator-id-backfill-dryrun-2026-06-30T23-41-13-316Z.json`

**Resultado:**

```
✓ juliana+staging@… : col-saas-c9a3cc7e-… → col-f93e5dbf-…
✓ renata+staging@…  : col-c92cf731-… → col-6b85c4cb-…
Aplicadas: 2
Erros: 0
```

**Tabelas mutadas:**

| Tabela | Linhas | Campo alterado |
|--------|--------|----------------|
| `tenant_users` | 2 (Juliana, Renata) | `collaborator_id` text apenas |
| `identities` | 2 (Juliana, Renata) | `collaborator_id` text (propagação consistente) |
| `invitations` | 0 | Já alinhados ao export |
| `identity_events` | 0 | — |

**Não alterado (confirmado):**

- `collaborators.id` / `collaborators.legacy_id`
- `tenant_users.collaborator_uuid` (valores idênticos ao backup pré-apply)
- `appointments` / `professionalId`
- Migrations / RLS / código

---

## 3. Backup e rollback

**Backup:** `scripts/reports/collaborator-id-backfill-backup-2026-06-30T23-41-13-755Z.json`

Contém estado **before** de 4 registros (2× `tenant_users`, 2× `identities`) incluindo `collaborator_uuid` original.

**Rollback (se necessário):**

```powershell
$env:SUPABASE_URL="https://tckdjyunwmdpqmewrwvt.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role_staging>"

node scripts/collaborator-id-backfill.mjs `
  --rollback "./scripts/reports/collaborator-id-backfill-backup-2026-06-30T23-41-13-755Z.json"
```

---

## 4. Validação pós-apply (SQL staging)

### 4.1 Alinhamento `collaborator_id` = `legacy_id` + UUID

| email | `tenant_users.collaborator_id` | `collaborators.legacy_id` | match legacy | `collaborator_uuid` = `collaborators.id` |
|-------|-------------------------------|---------------------------|--------------|------------------------------------------|
| paulo+staging@… | `col-saas-362c17b7-…` | `col-saas-362c17b7-…` | **SIM** | **SIM** |
| juliana+staging@… | `col-f93e5dbf-…` | `col-f93e5dbf-…` | **SIM** | **SIM** |
| renata+staging@… | `col-6b85c4cb-…` | `col-6b85c4cb-…` | **SIM** | **SIM** |
| melissa+staging@… | `col-c52fd5ce-…` | `col-c52fd5ce-…` | **SIM** | **SIM** |

**Score:** **4/4** legacy · **4/4** uuid

### 4.2 Integridade referencial

| Check | Resultado |
|-------|-----------|
| `collaborator_uuid` órfãos | **0** |
| Duplicatas `(tenant_id, collaborator_uuid)` | **0** |

### 4.3 `identities.collaborator_id`

4/4 alinhados com `tenant_users.collaborator_id` e `collaborators.legacy_id`.

### 4.4 Produção intocada

Consulta em `uoepkwhqztmsjnzirpev`: tenant `7aba7127-…` **não existe** (`count = 0`).

---

## 5. RH UUID Mirror (CLI dry-run pós-apply)

**Relatório:** `scripts/reports/rh-mirror-uuid-idb-qa-2026-06-30T23-41-59-245Z.json`

| Métrica | Valor |
|---------|-------|
| `wouldUpdate` | 0 |
| `wouldSkip` | 4 |
| `conflicts` | 0 |
| `notFound` | 0 |

Export de referência já contém `uuid` espelhado para os 4 — mirror Supabase→export **idempotente**.

**QA Tools browser (RH UUID Mirror):** não executado nesta sessão — repetir em `/dev/qa-tools` após refresh/login se IDB live ainda não tiver campo `uuid`.

---

## 6. RH Shadow QA (CLI pós-apply)

**Proxy local:** `collaborators-export.json` remapped (4 registros, legacy_ids alinhados pós-RC-01.4).

**Relatório:** `scripts/reports/rh-shadow-read-qa-2026-06-30T23-45-05-867Z.json`

| Métrica | Esperado | Obtido |
|---------|----------|--------|
| `localCount` | 4 | **4** |
| `remoteCount` | 4 | **4** |
| `blockingDiffCount` | 0 | **0** |
| `transitionalDiffCount` | 0 | **0** |
| `canPromoteReadPrimary` | true | **true** |
| `missing_local` / `missing_remote` | 0 | **0 / 0** |

**Difs remanescentes:** 4× `updated_at` — tier **informational** (backfill timestamp vs export IDB).

---

## 7. Shadow QA browser — pendência operacional

O critério completo do ticket inclui **RH Shadow QA no `/dev/qa-tools`** contra **IndexedDB live**.

Após RC-01.4, o Supabase está alinhado, mas o IDB do navegador pode ainda refletir estado pré-apply (RC-01.2: `localCount=3`, legacy divergente local). Para fechar o critério browser:

1. Login staging → tenant `7aba7127-…`
2. **Opcional recomendado:** reimportar/hidratar IDB (RC-01.5) ou navegar fluxo que repovoe `collaborators[]`
3. `/dev/qa-tools` → **RH UUID Mirror**
4. `/dev/qa-tools` → **RH Shadow QA**

**Expectativa pós-hidratação IDB:** mesmas métricas do CLI (§6).

---

## 8. Conclusão

| Escopo | Veredicto |
|--------|-----------|
| Alinhamento text Supabase (`tenant_users` + `identities`) | **READY** |
| Integridade UUID canônica preservada | **READY** |
| Produção intocada | **CONFIRMADO** |
| Shadow QA CLI (export proxy) | **READY** — `canPromoteReadPrimary=true` |
| Shadow QA browser (IDB live) | **NOT READY** — execução manual pendente |
| **RC-01.4 global** | **READY** (objetivo Supabase) · **NOT READY** (cutover browser sem revalidação IDB) |

---

## Referências

| Artefato | Caminho |
|----------|---------|
| Auditoria identidade RC-01.3 | `docs/reports/RH_RC01_IDENTITY_INTEGRITY_AUDIT.md` |
| Diagnóstico IDB RC-01.2 | `docs/reports/RH_RC01_IDB_SUPABASE_DIVERGENCE_DIAGNOSIS.md` |
| Script backfill | `scripts/collaborator-id-backfill.mjs` |
| Dry-run pré-apply | `scripts/reports/collaborator-id-backfill-dryrun-2026-06-30T23-40-46-220Z.json` |
| Backup rollback | `scripts/reports/collaborator-id-backfill-backup-2026-06-30T23-41-13-755Z.json` |
| Shadow QA pós-apply | `scripts/reports/rh-shadow-read-qa-2026-06-30T23-45-05-867Z.json` |

---

*Nenhum commit realizado. Nenhuma alteração de código funcional, migrations ou RLS.*
