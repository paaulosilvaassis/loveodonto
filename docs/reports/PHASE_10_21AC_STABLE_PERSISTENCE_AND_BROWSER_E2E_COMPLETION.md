# PHASE_10.21AC — STABLE PERSISTENCE + STAGING BROWSER E2E COMPLETION

**Status:** COMPLETE  
**Gate:** `STAGING_BROWSER_E2E_PASS`  
**Date:** 2026-08-12  
**Production writes / migrations / rollout / external communication:** **ZERO**  
**Commit / push / deploy:** **NÃO** (HARD STOP)

---

## Persistence root cause

Três falhas compostas (confirmadas por timeline + probe browser):

1. **IndexedDB last-write-wins invertido** — `saveDb` disparava `saveFullDb` async sem fila; write antigo podia completar depois do novo e apagar `generatedContracts`.
2. **`initDb` clobber** — hydrate async podia sobrescrever cache vivo escrito durante o await.
3. **HMR dual-module** (causa dominante no browser staging) — Vite remonta `src/db/index.js` enquanto services antigos ainda leem outra instância do módulo → `loadDb()` do service via cache vazio enquanto `withDb` do import fresco via outro cache. Probe: `patients` visível em um import e `getPatient` false no outro.

## Persistence fix

Em `src/db/index.js`:

- Runtime **singleton em `globalThis.__LOVE_ODONTO_DB_RUNTIME_V1__`** (todas as instâncias HMR compartilham o mesmo cache).
- Flush IDB **serializado + coalescido** (`scheduleIdbFlush` / `flushDbPersistence`).
- `initDb` idempotente: não sobrescreve cache vivo; re-hidrata se promise HMR ficou órfã.
- `withDb` **reentrante** (nested `registerEvent` não grava snapshot intermediário).
- Fail-fast em `createContractDraft` se draft sumir após `createGeneratedContractDraft`.

## Readiness warning root cause

Bloqueio extra em `sendContractForDigitalSignature` por `readiness.warnings` (ex.: `valueMismatch`) — **não** faz parte de `readiness.ok`. Soft-bypass staging era workaround.

## Readiness bypass removed

Removido o gate de warnings + soft-bypass staging. Envio bloqueia só em `!readiness.ok` (missing críticos). Warnings permanecem informativos.

## Concurrency tests

`src/__tests__/phase1021acContractPersistenceConcurrency.test.js` — A–H + corrida init/save + nested withDb + assert sem bypass.

**CONTRACT_PERSISTENCE_STABLE = PASS** (11/11)

## Browser E2E

Script: `scripts/staging/runFullE2e1021AC.mjs`  
Artifact: `docs/reports/_phase1021ac_full_e2e.json`

| Check | Result |
|-------|--------|
| DRAFT_GENERATION | PASS |
| CONTRACT_FINALIZE | PASS |
| DRAFT_PERSISTENCE_BROWSER | PASS |
| READINESS_SEND_GATE | PASS_WITHOUT_BYPASS |
| LGPD / Package 3 / Freeze / Envelope | PASS |
| PUBLIC_PACKAGE_UI | PASS |
| CONTRACT / TCLE / LGPD VIEW | PASS |
| SIGN_GATE | PASS |
| ACCEPTANCES + IDEMPOTENCY | PASS |
| PACKAGE_SIGNATURE | PASS |
| EXACT_TCLE_PROOF / EXACT_LGPD_PROOF | PASS |
| EVIDENCE / SIGNED_PACKAGE_REPORT | PASS |
| SIGNED_DOCUMENTS_IN_RECORD (prontuário) | PASS |
| MOBILE_SIGNATURE_UX | PASS |

Extras de prontuário/mobile:

- `patientFilesService` passa a persistir `metadata` (incl. `signedPackage`).
- CSS mobile: `overflow-x` contido em `.ctr-public-sign` + package docs.

## Production / HARD STOP

| Item | Valor |
|------|-------|
| Production writes | ZERO |
| Production migrations | ZERO |
| Rollout changes | ZERO |
| External communication | ZERO |
| Commit / push / deploy | NÃO |

## Tests / Build

- AC concurrency: PASS  
- Lote 10.21 AB/AA/Z/X/V/U/R (+ hashtags / phase105): PASS  
- `npm run build`: PASS  

## Bugs remaining

| Sev | Item |
|-----|------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | CTA “Enviar para assinatura” após reload às vezes não aparece na UI clínica (E2E usa service fallback no mesmo contrato; não bloqueia assinatura pública) |

## Decision

Persistência estabilizada; E2E staging browser completo fechado.

## Gate

`STAGING_BROWSER_E2E_PASS`

**Aguardar Paulo** — sem commit/push/deploy.
