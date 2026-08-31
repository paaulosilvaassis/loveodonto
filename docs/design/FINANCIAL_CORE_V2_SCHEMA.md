# FINANCIAL CORE V2 — TARGET SCHEMA

**Phase:** 11.H (DESIGN ONLY)  
**Status:** NOT APPLIED  
**Draft SQL:** `docs/design/drafts/041_financial_core_v2.sql`  
**Contract:** `src/contracts/financialCoreV2PersistenceContract.js`

`CURRENT_FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES`  
`TARGET_FINANCIAL_SSOT = SUPABASE_FINANCIAL_V2_NOT_YET_AUTHORITATIVE`

Não aplicar este schema em 11.H.

---

## Existing 021 inventory (do not trust blindly)

`SUPABASE_FINANCIAL_SCHEMA_INVENTORY`

### `financial_accounts_receivable`

| | |
| --- | --- |
| PRIMARY_KEY | `id uuid` |
| TENANT_FIELD | `tenant_id uuid NOT NULL → tenants ON DELETE CASCADE` |
| MONEY_FIELDS | `numeric(14,2)` original/discount/interest/fine/net/paid |
| STATUS | default `'open'` (domínio LIVE: pending/upcoming/due_today/overdue/partially_paid/paid/canceled/renegotiated) |
| ORIGIN_FIELDS | `origin_type`, `origin_id`, `budget_id`, `financing_id` — **sem** `installment_number` |
| UNIQUE | `(tenant_id, legacy_id)` where not deleted |
| FOREIGN_KEYS | tenant only |
| RLS | SELECT member; ALL (incl. DELETE) tenant admin |
| WRITERS_EXPECTED | Admin API / flags OFF |
| DOMAIN_GAPS | money float; status enum; identity PATH A/B; cancel metadata; payments ausentes |
| CLASS | **INCOMPATIBLE** |

### `financial_payables`

Fora do core 11.B–11.G. CLASS = **UNUSED**.

### `financial_financings`

| | |
| --- | --- |
| MONEY | `numeric` total/entry only |
| STATUS | `draft` + `approval_status` — diverge de `pending_analysis` / `paid_off` / `partially_paid` |
| UNIQUE | `(tenant_id, legacy_id)` — **não** 1 ativo por tenant+budget |
| DELETE | CASCADE tenant + RLS admin DELETE |
| CLASS | **INCOMPATIBLE** |

Migrations 024–040 **não** alteram colunas `financial_*`. 023 = RLS. 026/027 apenas listam as tabelas em health-check.

Mapper V3 (`financialTypes.ts`) ainda usa status `open`/`partial`/`cancelled`/`pending_approval`/`completed` — **não** reutilizar contra o domínio 11.G.

---

## Target model

Novas tabelas `financial_v2_*`. 021 permanece legado até fase posterior esvaziar/dropar.

### IDs

IndexedDB usa `recv-${uuid}`, `rvpay-${uuid}` — incompatível como PK uuid puro.

- `id uuid` interno
- `source_id text` = ID de domínio (preserva origin links, payments, audit)
- UNIQUE `(tenant_id, source_id)`

`created_by uuid` nullable → `auth.users`. `created_by_legacy text` para autores IDB não mapeáveis. **Não inventar autor.**

Timestamps: `timestamptz`. Datas de competência (`due_date`, `paid_at`) = `date` civil. Sem conversão histórica sem regra.

### Money

`BIGINT` cents. Conversão = `toCents()` da 11.G (`Math.round(n * 100)`).

Persistido no receivable: `original_cents`, `discount_cents`, `interest_cents`, `fine_cents`, `total_cents`.  
**Não persistir** `effective_paid_cents` / `balance_cents` como truth — derivar de `financial_v2_payments`. Status pode ser persistido e **validado** contra facts.

### Receivable

UNIQUE parcial:

```
(tenant_id, origin_type, origin_id, installment_number)
WHERE origin_id IS NOT NULL
  AND origin_type IN ('treatment_plan', 'financing')
```

Cobre PATH A e PATH B (`installment_number = 0` = entrada).  
Manual entry: identidade = `(tenant_id, source_id)` somente.  
`origin_type=contract` existe no enum mas **não** gera obrigação automática.

DELETE = DENY. Cancel = `canceled_at` + status.

### Payment / reversal

Uma tabela de fatos. `kind in (payment, reversal)`.  
UNIQUE `(tenant_id, operation_id)`.  
UNIQUE `(reverses_payment_id) WHERE kind = reversal`.  
FK composta `(tenant_id, reverses_payment_id)` → mesmo tenant (cross-tenant REJECTED).  
Estorno = novo fato; original permanece `status=reversed`. Sem hard delete.

Invariantes de serviço (além do SQL): não estornar reversal; amount_cents igual ao original; sem ciclo.

### Financing

`tenant_id NOT NULL`. `budget_id` TEXT **sem FK** (orçamento vive no IndexedDB).  
UNIQUE `(tenant_id, budget_id) WHERE status NOT IN (canceled, renegotiated)` — replica `findActiveFinancingForBudget`.  
Paid/open = derivados dos receivables.

### Installments

Obrigação = receivable.  
`financial_v2_financing_installments` = projeção operacional (`due_date`, `receivable_id` UNIQUE). **Sem** amount SSOT.

### Charge / boleto

Não é receivable. FK para obrigação. UNIQUE `(tenant_id, operation_id)`. Charge **não** cria título.

### Tenant

NO UNOWNED ROWS no server-side novo. `tenant_id NOT NULL`.  
`ON DELETE RESTRICT` (021 CASCADE é gap).

Patient: TEXT opaco até cutover de pacientes provar UUID. Sem FK impossível.

---

## RLS / RBAC

021: SELECT membro; INSERT/UPDATE/**DELETE** admin. DELETE admin é **gap**. RLS **não** substitui RBAC.

Target: SELECT/INSERT/UPDATE por membership; **sem** policy DELETE; `REVOKE DELETE`. Permissões canônicas no **server writer**:

`financeiro_contas_receber:*` · `financeiro_financiamentos:*` · `financeiro_boletos:*`

JWT: `app_metadata` / membership. Nunca `user_metadata`.
