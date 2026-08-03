# Phase 9.4A — Security Hardening Gate

**Status oficial:** `PHASE_9_4A_SECURITY_HARDENING_COMPLETE`  
**Reexecução:** 2026-08-02 (Mac, Docker Engine 29.6.2, Supabase CLI 2.110.0)  
**Commit:** não realizado  
**linkedRef:** `tckdjyunwmdpqmewrwvt` (preservado)  
**remoteActionsExecuted:** `false`

---

## 1. Escopo

Correção exclusiva dos quatro riscos CRITICAL auditados na Wave 1B:

| Risco | Classificação | Tratamento |
|-------|---------------|------------|
| A | `JWT_STALE_MEMBERSHIP_BYPASS` | Membership ativa obrigatória no SELECT |
| B | `MIGRATION_ATOMICITY_GAP` / `PARTIAL_MIGRATION_RLS_EXPOSURE` | Migration aditiva fail-closed + FORCE RLS + assert |
| C | `TENANT_FILTER_MISSING` / `UNMIGRATED_REMOTE_TABLE_REFERENCE` | Quarantine `budgetsService` / `budgetItemsService` |
| D | `JWT_TENANT_CLAIM_DRIFT` / `APP_METADATA_HELPER_MISMATCH` | `app_current_tenant_id` canônico (app_metadata-first) |

Fora de escopo: Wave 2 Pacientes, dual-write, flags, backfill, wiring `patientService`, Phase 9.4B Orçamentos, remoto, commit.

---

## 2. Migration

**Arquivo:** `supabase/migrations/026_app_security_hardening_membership_jwt_rls.sql`

### Helpers

- `public.app_try_parse_uuid(text)` — parse fail-soft
- `public.app_current_tenant_id()` — prioridade: `app_metadata.tenant_id` → legado top-level / `app_tenant_id`; **nunca** `user_metadata`
- `public.app_user_has_active_tenant_membership(uuid)` — SECURITY DEFINER; exige `is_active`, `has_system_access`, `status='active'`
- `public.app_user_can_read_tenant(text|uuid)` — claim compatível + membership
- `public.app_user_can_access_tenant(text)` — wrapper fail-closed → `app_user_can_read_tenant` (todas as policies SELECT/ALL existentes herdam)
- `public.app_user_is_tenant_admin` / `app_user_admin_tenant_id` — alinhados ao mesmo fail-closed
- `public.app_validate_critical_tenant_tables_rls()` / `app_assert_critical_tenant_tables_rls()` — falha com `CRITICAL_TABLE_RLS_EXPOSED`

### Fail-closed 020–023

ENABLE + FORCE RLS nas tabelas críticas existentes; assert de policies ≥ 1. Migrations históricas 020–022 **não** reescritas.

---

## 3. budgetsService

- Shim em `src/services/budgetsService.js` / `budgetItemsService.js` com `*_QUARANTINED=true` (throws)
- Cópia deprecated em `src/services/quarantine/*`
- Consumidor residual: `ClinicalAppointmentPage.jsx` (listagem; catch → lista vazia)
- Nenhuma migration app cria `public.budgets`
- Substituto: IndexedDB / `crmBudgetService` até Phase 9.4B

---

## 4. Evidência runtime (2026-08-02)

| Gate | Resultado |
|------|-----------|
| Static `phase94a-security` | **10/10** |
| Static `phase94a-wave1` | **8/8** |
| Static `phase92l` | **4/4** |
| Static `phase93a` | **5/5** |
| Static `phase92c` | **7/7** |
| Dry-run | `LOCAL_DRY_RUN_PASS` · `SCHEMA_APPLIED_VERIFIED` |
| publicTables | **32** |
| schemaMigrations | **28** (026 aplicada) |
| RLS geral | `RLS_RUNTIME_PASS` · **58/58** |
| RLS Pacientes | `PATIENTS_WAVE1_RLS_PASS` · **31/31** |
| E2E | `FUNCTIONAL_E2E_PASS` · **29/29** |

### Cenários de segurança (amostra)

- `stale_jwt_without_membership_cannot_read` ✓
- `inactive_membership_cannot_read` ✓
- `no_system_access_cannot_read` ✓
- `inactive_status_cannot_read` ✓
- `app_metadata_only_can_read_own` ✓
- `user_metadata_cannot_authorize_other_tenant` ✓
- `divergent_claims_prefer_app_metadata` ✓
- `critical_020_022_force_rls_and_policies` ✓
- `stale_jwt_without_membership_cannot_read_patients` ✓

### Comandos

```bash
npm run test:supabase:phase94a-security
npm run test:supabase:phase94a-wave1
npm run test:supabase:phase92l
npm run test:supabase:phase93a

RUN_SUPABASE_LOCAL_INTEGRATION=true \
LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY \
APPLY_LOCAL_DB_RESET=true \
SUPABASE_LOCAL_CMD_TIMEOUT_MS=900000 \
npm run supabase:local:dry-run -- --json

RUN_SUPABASE_LOCAL_INTEGRATION=true \
LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY \
SUPABASE_LOCAL_DB_CONTAINER=supabase_db_love-odonto-local-disposable \
npm run supabase:local:rls-runtime -- --json

npm run supabase:local:patients-wave1-rls -- --json
npm run supabase:local:functional-e2e -- --json
```

Nenhuma ação remota (`link` / `db push` / `--linked`). Nenhum commit.

---

## 5. Estado pós-hardening

| Item | Estado |
|------|--------|
| Pacientes Wave 1 | íntegra (foundation + RLS 31/31) |
| Pronto para Wave 2? | **SIM, sob autorização humana** (segurança CRITICAL tratada localmente) |
| Pronto para produção? | **NÃO** — hardening ainda não aplicado no remoto; IndexedDB SSOT |
| Flags / wiring / dual-write | **não** |
