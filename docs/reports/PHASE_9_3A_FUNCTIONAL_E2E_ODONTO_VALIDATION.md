# Phase 9.3A — Functional E2E Odontológico (local disposable)

**Status oficial (reconciliado):** `FUNCTIONAL_E2E_PASS` · **29/29**  
**Reexecução:** 2026-08-02 (Mac, Docker Engine 29.6.2, Supabase CLI 2.110.0)  
**Commit:** não realizado nesta fase  

---

## 1. Objetivo

Provar fluxo odontológico multi-tenant (duas clínicas) em SQL local: tenants, collaborators, CRM, agenda, contratos gerados, financeiro de cabeçalho — sem tocar remoto.

## 2. Reconciliação 2026-08-02

| Item | Resultado |
|------|-----------|
| Pré-requisito | `LOCAL_DRY_RUN_PASS` + `RLS_RUNTIME_PASS` (9.2C) |
| Functional E2E | **`FUNCTIONAL_E2E_PASS` · 29 passed / 0 failed / 29 total** |
| `linkedRef` | `tckdjyunwmdpqmewrwvt` |
| `remoteActionsExecuted` | `false` |
| Static gate | `npm run test:supabase:phase93a` → 5/5 |

### Inconsistência resolvida

Primeira execução nesta sessão falhou com:

```text
FUNCTIONAL_E2E_FAILED | 28 | 1 | 29
out_of_scope_patients_table_absent | f
```

**Classificação:** `PHASE_93A_FIXTURE_STALE_AFTER_PATIENTS_025`

A migration `025_app_patients_core.sql` cria `public.patients` (+ phones/documents/records). O fixture ainda exigia ausência da tabela.

**Correção autorizada (somente expectativa):**

- Fixture: cenário `patients_wave1_foundation_present` (tabelas Wave 1 **presentes**)
- Domain map: patients `inScopeSqlE2e=true` (foundation inspect)
- Teste estático 9.3A alinhado

**Não** removemos patients. IndexedDB permanece SSOT da aplicação.

### Comando (após correção de expectativa)

```bash
RUN_SUPABASE_LOCAL_INTEGRATION=true \
LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY \
SUPABASE_LOCAL_DB_CONTAINER=supabase_db_love-odonto-local-disposable \
npm run supabase:local:functional-e2e -- --json
# → FUNCTIONAL_E2E_PASS | 29 | 0 | 29
```

## 3. Escopo SQL E2E

In-scope: tenants, tenant_users, collaborators, clinic_profiles, appointments, crm_*, financial headers, generated_contracts, **patients Wave 1 foundation (inspect)**.

Out-of-scope (ainda IDB): budgets table `public.budgets`, journey, odontogram clínico, payments detalhados.

## 4. Garantias

- Zero `supabase link` / `db push` / `--linked`
- Zero commit
- Ambiente: `supabase-local` descartável
