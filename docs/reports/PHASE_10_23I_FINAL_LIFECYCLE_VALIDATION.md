# PHASE 10.23I — Final legal lifecycle validation

**Date:** 2026-08-31  
**Mode:** validation-first; one production fix  
**Baseline HEAD before I:** `5566ae1` (`feat(contracts): finalize lifecycle ui and rbac`)  
**Risk:** LEGAL_HIGH_IMPACT  
**Pilots:** CTR-2026-00003 / 00004 / 00005 — read-only, not mutated

No PII. No raw tokens. No secrets.

---

## 0 — Worktree safety

HEAD at start = `5566ae1`. `origin/main` synchronized.

**PREEXISTING_UNRELATED_CHANGES =**

- `docs/reports/_phase1021v_domain_e2e_result.json`
- `src/__tests__/phase1021bnDirectSmtpUi.test.js`
- `src/components/contracts/SendContractSignatureModal.jsx`
- `src/services/patientEmail.js`
- `tsconfig.tsbuildinfo`
- untracked: `.DS_Store`, `docs/reports/_phase1021*` shots, `PHASE_10_21AL_CONTROLLED_PRODUCTION_PILOT.md`, `PHASE_10_23A_LIFECYCLE_AUDIT.md`, `src/__tests__/phase1021bnPatientRemoteSignatureDelivery.test.js`

Not reset, cleaned, staged, or committed.

---

## 1–2 — PHASE1021L discrepancy

Independent run of `phase1021lLocalFunctionalTest.test.js` failed on:

`assertRemoteSignatureBinding` → `signContractViaLink`  
message: `Assinatura remota exige signatureRequestId e signLinkId do fluxo.`

Trace:

1. `sendContractForSignature` (Pendentes / Fila / 10.21L) minted `contractSignLinks` **without** `requestId` and **without** a `contractSignatureRequests` row.
2. `signContractViaLink` passed `signatureRequestId: link.requestId` (undefined).
3. 10.21CO `assertRemoteSignatureBinding` correctly fail-closed.

**PHASE1021L_CLASSIFICATION = A. REAL_CURRENT_PRODUCTION_PATH_DEFECT**  
Not a stale fixture. Not a harness mismatch. Canonical clinical `createSignatureRequest` already bound `requestId`; the legacy send writer did not.

**PHASE1021L_FIX =** `sendContractForSignature` now creates a bound patient request+link (`tenant`, `contractId`, `requestId`, `signerRole`/`signerPersonId`). Reuses an existing signable pair. Throws `NEW_LINK_WITHOUT_REQUEST_ID` if a new link would lack `requestId`. Also accepts `partially_signed` (same signable set as UI `canSendForSignature`) so first patient invite after an on-screen professional stroke is not a UI-YES / writer-FORBIDDEN mismatch.

Historical rows without `requestId` were not backfilled.

After the fix: `phase1021lLocalFunctionalTest` **PASS**. `phase1021coLegalEvidenceHardening` **PASS**.

---

## 3 — Canonical contract states

**CANONICAL_CONTRACT_STATES =** `draft | generated | partially_signed | signed | cancelled | voided | superseded`

Read aliases only: `canceled→cancelled`, `completed→signed`, `vigente→signed`, `replaced→superseded`, plus ceremony spellings `sent`/`viewed`→`generated`, `signed_by_*`→`partially_signed`.

**LEGACY_ALIAS_WRITES_FOUND =** documented compatibility only:

- cancel/abort persist LIVE spelling `canceled` (`cancelPersist.js` `LIVE_CANCELLED`) — read as `cancelled`
- `sendContractForSignature` / first-view persist `sent` / `viewed` on the contract — read as `generated`
- request `sent` / `completed` are REQUEST_STATE, not CONTRACT_STATE

**UNKNOWN_STATE_FAIL_CLOSED = YES** (`unknown` is not signable; transitions invalid)

No state resurrection.

---

## 4–6 — Transitions, writers, signability

Allowed graph (writers implemented): draft→generated; generated→partially_signed|signed|cancelled; partially_signed→signed|cancelled (abort); signed→voided; voided|cancelled→superseded (reissue). Blocked: cancelled/voided/superseded→signed; in-place signed version mutation (`createContractNewVersion` fail-closed).

**CONTRACT_STATE_WRITERS =** `finalizeGeneratedContract` (generate); `signContractOnScreen` / `signContractViaLink` / `contractSignatureFlowService` (stroke); `sendContractForSignature` (`sent` compat); first-view (`viewed` compat); `cancelUnsignedContract` / `abortPartialCeremony`; `voidSignedContract`; `reissueContract` (supersede source + insert draft)

**CSIG_WRITERS =** `signContractOnScreen` (append-only)

**REQUEST_WRITERS =** `sendContractForSignature`; `signatureProviderService.createSignatureRequest`; rotate/resend/expire/revoke/cancel/abort; request `completed` on remote sign

**LINK_WRITERS =** `sendContractForSignature`; `createSignatureRequest`; `applyRotateSignLink`; expire/revoke/sign-consume

**TOKEN_WRITERS =** same as link create/rotate (`createId('csgn')`)

**VOID_WRITERS =** `voidSignedContract` (+ atomic void inside `reissueContract` when source is signed)

**REISSUE_WRITERS =** `reissueContract`

**FINAL_ARTIFACT_WRITERS =** `finalSignedContractArtifactService` (skip if artifact already exists)

**UNSAFE_BYPASSES = NONE**

Signable only: `generated` | `partially_signed` (including read aliases `sent`/`viewed`/`signed_by_*`). draft/signed/cancelled/voided/superseded/unknown = blocked.

---

## 7–9 — Ceremony, abort, void

`deriveCeremonyProgress` uses `signing_parties` / required slots dynamically (`N de M`). Not hardcoded to 2 signers or professional-first.

Abort: existing csig/hash/manifest/artifact unchanged; remaining access revoked; contract terminal; `CEREMONY_ABORTED` audit. No signature deletion.

Void: legal snapshot (csig, manifest, artifact, document hash/html/version) unchanged. Finance unchanged. **SIGNED_EVIDENCE_MUTATION_ON_VOID = NONE**

---

## 10–13 — Reissue

`newContractId != oldContractId`. Successor starts `draft`. No copy of signatures, manifest, request/link/token, or final artifact.

**CANCELLED_REISSUE_POLICY = SAFE_AND_INTENTIONAL**  
10.23B table: reissue source = cancelled | voided | signed (via atomic void). UX `canReissue` matches. Cancelled source is superseded and never signable again.

**REISSUE_ATOMICITY = PASS** (`reissueContract` is a single `withDb`; clone-then-save rolls back on throw — no orphan successor / half-void)

**REISSUE_CONCURRENCY = PASS** (second call idempotent; one successor)

**LEGACY_VERSIONLESS_REISSUE_POLICY =** missing/invalid version → successor version `INITIAL_GENERATED_CONTRACT_VERSION + 1` (2). Old row untouched. No backfill.

---

## 14–21 — Access, rotate, resend, expire, races

**LINKS_CREATED_WITHOUT_REQUEST_ID = NONE** (new path). Production creators: `sendContractForSignature`, `createSignatureRequest`, `applyRotateSignLink` — all set `requestId`.

**MAX_SIGNABLE_LINKS_PER_REQUEST = 1**

Rotate: same requestId, new linkId/token, old pending revoked. Cannot make cancelled/signed/voided/superseded signable.

Resend: same request/link/token/`expiresAt`. Delivery only.

Expire: `expiresAt <= trustedNow` blocks view/sign before lazy persist; contract is never `expired`.

Rotate-vs-sign / cancel-vs-sign: single-threaded `withDb` serializes; first commit wins; second re-reads. Old token after rotate cannot sign. Signed/cancelled contract cannot rotate or resurrect. Stale token after void/supersede: `getContractBySignToken` null (`isContractSignable` second defense).

**DUPLICATE_CSIG_PROTECTION = YES** (existing duplicate-stroke guards + binding)

**RESURRECTION_PATHS = NONE**

---

## 22–24 — Artifact, finance, tenant

**FINAL_ARTIFACT_MUTABLE_PATHS = NONE** (existing artifact skipped; void preserves; reissue uses new identity)

**AUTOMATIC_FINANCIAL_SIDE_EFFECTS = NONE** (cancel/abort/void/reissue/rotate/resend/expire)

**TENANT_ISOLATION = PASS** (writers use `assertLifecycleTenant`; cross-tenant BLOCK)

---

## 25–27 — RBAC / UI / public

MASTER / ADMIN: legal high-impact allowed.  
GERENTE: no automatic void/reissue (needs admin/master). Sensitive cancel only with `admin_contratos:cancel`.  
RECEPÇÃO: resend yes; rotate/void/reissue no.  
PROFESSIONAL: rotate yes (writer `canPerformRotateSigningAccess` + UI `canRotateAccess`). Void/reissue no.  
PUBLIC: valid token only.

**PROFESSIONAL_ROTATE_POLICY = CONSISTENT**

**RBAC_UI_WRITER_MISMATCHES = NONE**

**PUBLIC_SIGNING_FAIL_CLOSED = PASS** (unknown/expired/revoked/completed/signed/cancelled/voided/superseded: no stroke UI, no csig, no token leak)

---

## 28–30 — Token secrecy, audit, terminal UI

**RAW_TOKEN_LOGGING = NONE**  
**TOKEN_IN_AUDIT = NONE** (`appendLifecycleAudit` stores requestId/linkId, not token)  
**RAW_TOKEN_UI_RENDERING = NONE** (Pendentes does not render `{link.token}`)

Audit events exist for send/resend/rotate/revoke/expire/signature/abort/cancel/void/reissue/supersede. Idempotent retry does not duplicate legal cancel/void/reissue events.

Signed UI: no sign/resend/rotate/cancel/abort/`Nova versão`. Cancelled/voided/superseded: no sign/resend/rotate. Lineage on Assinados. No direct DB mutation from UI.

---

## 31–34 — Historical / static audits

No production pilot mutation. Fixtures only.

**LEGAL_HARD_DELETE_PATHS = NONE** (no splice/delete of contracts, csig, manifest, final artifact, or legal audit)

No signed-evidence in-place mutation bypass. `createContractNewVersion` remains `SIGNED_CONTRACT_IMMUTABLE`.

---

## 35–36 — Typecheck and tests

**TYPECHECK_BASELINE_FAILURES =** `tsc -b` fails in `src/domain-events/*` and `src/repositories/*` (preexisting, unrelated)

**TYPECHECK_NEW_LIFECYCLE_FAILURES = NONE** (10.23I is JS only; no lifecycle path in tsc errors)

Targeted I + 10.23H/G/F/E/D/C + 10.21L + 10.21CO + contract module + signature flow + public signing + tenant isolation: **214 tests, 18 files, PASS**

**BUILD = PASS** (`vite build`)  
**DIFF_CHECK = PASS** on 10.23I files. Full worktree `git diff --check` still flags SMTP leftovers (preexisting, not staged).

---

## 37–38 — Fixes in I

1. Bind `requestId` on `sendContractForSignature` (root cause of 10.21L / 10.21CO).
2. Reuse existing signable request+link (one signable link).
3. Allow send on `partially_signed` to match UI policy (first remote invite after professional stroke).

No migration. No backfill. No pilot rewrite. Assertions not weakened.

---

## Remaining technical debt (not 10.23I)

- `tsc -b` domain-events / repositories
- SMTP / patient-email leftovers in worktree
- LIVE cancel still persists `canceled` spelling (read-normalized)
- Contract `sent`/`viewed` still written as ceremony compat
- IndexedDB `withDb` is the atomic primitive (single-threaded); no multi-tab distributed lock

**Known limitation:** historical links created before this fix may lack `requestId`. They are immutable evidence. New access cannot be created without `requestId`. Remote sign of a truly unbound historical token remains fail-closed (correct).

---

## Production safety

Production code changed (`sendContractForSignature`). After green push, Vercel auto-deploy. No production data mutation. Smoke is read-only.
