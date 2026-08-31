# FINANCIAL CORE — CUTOVER PLAN (NOT EXECUTED)

**Phase:** 11.H (DESIGN ONLY)  
**Cutover:** NO  
**Dual-write:** NO  
**Backfill:** NO

`CUTOVER_STRATEGY = SHADOW_COMPARE_THEN_TENANT_CUTOVER`  
`ROLLBACK_STRATEGY = FLAG_OFF_PRESERVE_IDB_AND_SERVER_ROWS`

---

## Options compared

| | Option | Verdict |
| --- | --- | --- |
| A | Big bang | Rejected — irreversível, sem observabilidade por tenant |
| B | Dual-write para schema 021 | Rejected — 021 INCOMPATIBLE (NUMERIC, status `open`, sem payments) |
| C | Server-first write + legacy read | Prematuro — split-brain antes de v2 + reconciliação |
| D | Shadow-write + compare | **Adopted as phase 1** |
| E | Tenant-by-tenant cutover | **Adopted as phase 2** after D is green |

Recomendação única: **D então E**. Reversibilidade e observabilidade primeiro.

Não dual-write contra 021. Flags V3 existentes (`FINANCIAL_SHADOW`, `FINANCIAL_COMPARE`, `FINANCIAL_READ`, `FINANCIAL_WRITE`, `FINANCIAL_DUAL_WRITE`, `*_PRIMARY`) continuam **OFF** e **locked em produção**. Conceituais futuros: `FINANCIAL_SERVER_READ` / `FINANCIAL_SERVER_WRITE` / `FINANCIAL_SHADOW_WRITE` / `FINANCIAL_TENANT_CUTOVER` — **não implementados em 11.H**.

---

## Sequence (future, not 11.H)

1. **11.I (local):** aplicar draft v2 só em ambiente local/dev; mapper 11.G; quarantine store; **sem** production.
2. Shadow-write: IDB permanece SSOT; cada write LIVE também tenta v2. Falha remota **não** bloqueia IDB.
3. Compare: `inspectFinancialReconciliation` + diff IDB vs v2 por tenant.
4. Backfill **somente** `RECONCILED` + `OWNED_DIRECT` (ou `OWNED_DERIVED` com prova).
5. Quarantine: `UNOWNED` / `CONFLICTED` / `DUPLICATE` / `MISMATCH` / `UNSUPPORTED`. **Não apagar.**
6. Um tenant: `FINANCIAL_SERVER_READ` allowlist.
7. Mesmo tenant: `FINANCIAL_SERVER_WRITE` depois de read-after-write PASS.
8. Kill switch por tenant. Sem rewrite de histórico.

---

## Eligibility

Antes de qualquer row ir para v2:

```
inspectFinancialReconciliation  (ou equivalente)
+ classificação de ownership
+ detector de duplicata de identidade
```

| Class | Cutover automático |
| --- | --- |
| RECONCILED + OWNED_DIRECT | yes |
| OWNED_DERIVED | only with proof |
| MISMATCH / UNOWNED / DUPLICATE / UNSUPPORTED | quarantine |

Float → cents = **exatamente** `toCents()` 11.G. Proibido conversor SQL distinto (`round(amount*100)` sem a mesma regra de `Math.round`).

Duplicatas históricas: REPORT/QUARANTINE. Sem dedupe destrutivo.

---

## ID mapping

Preservar `source_id` = ID IndexedDB. UUID interno extra é opcional.  
Tenant IDB deve ser UUID de `public.tenants.id`. String opaca → `CONFLICTED`, não coerce.

---

## Rollback

Não apagar rows financeiras.

| Falha | Ação |
| --- | --- |
| Shadow write falha | IDB ganha; log; retry idempotente por `operation_id` / obligation identity |
| Cutover parcial | flag tenant OFF; leitura volta ao IDB |
| Replay duplo | UNIQUE `(tenant_id, operation_id)` e obligation identity |
| Distinguir materializado | `source_id` + `created_at` server; IDB continua completo |

Rollback **não** depende de DELETE. Server rows ficam órfãs inofensivas até reconciliação posterior.

---

## Go / No-Go (production cutover)

GO somente se:

- schema v2 contract PASS em staging
- RLS v2 PASS (DELETE deny)
- tenant_id NOT NULL enforced
- money conversion = 11.G
- eligibility PASS
- rollback drill PASS
- shadow compare sem divergência silenciosa
- no destructive deletes
- contracts ainda sem side-effect financeiro

**GO_FOR_PRODUCTION_CUTOVER = NO** nesta fase.  
**GO_FOR_PHASE_11I = YES** apenas para schema local + mapper + quarantine tooling — ainda sem cutover.
