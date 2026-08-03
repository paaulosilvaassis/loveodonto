# Phase 9.2C — Local Runtime RLS Validation and Evidence Consolidation

**Status oficial (reconciliado):** `PHASE_9_2_COMPLETE` / `RLS_RUNTIME_PASS`  
**Reexecução:** 2026-08-02 (Mac, Docker Engine 29.6.2, Supabase CLI 2.110.0)  
**Commit:** não realizado nesta fase  

---

## 0. Reconciliação 2026-08-02 (Wave 1B)

Relatório anterior marcava `PHASE_9_2_BLOCKED` por schema local vazio na máquina da época.  
Nesta reexecução (ambiente descartável `supabase-local`):

| Gate | Resultado |
|------|-----------|
| Dry-run (`APPLY_LOCAL_DB_RESET=true`) | `LOCAL_DRY_RUN_PASS` |
| Schema | `SCHEMA_APPLIED_VERIFIED` · `publicTableCount=32` · `schemaMigrationsCount=27` |
| RLS runtime | **`RLS_RUNTIME_PASS` · 45/45** |
| `linkedRef` | `tckdjyunwmdpqmewrwvt` preservado |
| `remoteActionsExecuted` | `false` |
| Container DB | `supabase_db_love-odonto-local-disposable` |

### Comandos

```bash
RUN_SUPABASE_LOCAL_INTEGRATION=true \
LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY \
APPLY_LOCAL_DB_RESET=true \
SUPABASE_LOCAL_CMD_TIMEOUT_MS=900000 \
npm run supabase:local:dry-run -- --json
# → LOCAL_DRY_RUN_PASS

RUN_SUPABASE_LOCAL_INTEGRATION=true \
LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY \
SUPABASE_LOCAL_DB_CONTAINER=supabase_db_love-odonto-local-disposable \
npm run supabase:local:rls-runtime -- --json
# → RLS_RUNTIME_PASS | 45 | 0 | 45
```

Nenhuma ação remota (`link` / `db push` / `--linked`). Nenhum commit.

---

## 1. Objetivo

Fechar o warning `RLS_RUNTIME_NOT_SIMULATED` com validação **runtime** da RLS multi-tenant das migrations **020–024**, exclusivamente no ambiente isolado `supabase-local`.

## 2. Escopo validado

| Migration | Escopo |
|-----------|--------|
| 020 | `appointments` |
| 021 | `financial_*` (3) |
| 022 | `crm_leads`, `crm_pipeline_stages` |
| 023 | policies SELECT + modify admin |
| 024 | storage collaborator-photos (path + policies) |

**Contrato honesto (ainda vigente):** SELECT = JWT claim (`app_user_can_access_tenant`); mutate = admin membership. Documentado no cenário `known_contract_select_is_jwt_claim_scoped` (pass). Ver auditoria Wave 1B Risk A — classificação `JWT_STALE_MEMBERSHIP_BYPASS` (correção **não** aplicada nesta fase).

## 3. Resultado dos testes (reexecução)

| Gate | Resultado |
|------|-----------|
| Static 9.2C | PASS (7/7) |
| Dry-run | `LOCAL_DRY_RUN_PASS` |
| Schema | 32 public tables · 27 schema_migrations |
| RLS runtime | **PASS 45/45** |
| Isolamento cross-tenant | exercitado e aprovado |
| `remoteActionsExecuted` | `false` |

## 4. Status final

**`PHASE_9_2_COMPLETE`** (runtime local reconciliado).

Critérios:

- [x] Tooling dry-run / isolamento / guards  
- [x] Artefato RLS runtime + regressão estática  
- [x] Zero ação remota nesta validação  
- [x] Migrations aplicadas no DB local atual  
- [x] `RLS_RUNTIME_PASS` com isolamento cross-tenant  

## 5. Próximas fases (já avançadas em paralelo)

- Phase 9.3A functional E2E — ver relatório dedicado (reconciliado 2026-08-02).  
- Phase 9.4A Wave 1 patients — ver relatório dedicado.  
- Correções de segurança CRITICAL — **não** iniciadas nesta fase.
