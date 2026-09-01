# POST-10.23 — Revoked remote signing access incident closeout

**Mode:** closeout / regression freeze  
**New feature:** no  
**Production mutation:** none  
**Pilots CTR-2026-00003 / 00004 / 00005:** preserved, not mutated  
**Incident reference:** POST-10.23 revoked remote signing access (controlled production contract CTR-2026-00006)

No patient PII. No email addresses. No raw tokens. No secrets.

---

## A. Symptom

A generated, legally signable contract showed remote access as **Revogado**.

The signer received an email with CTA **REVISAR E ASSINAR CONTRATO**. Clicking that CTA opened the public page:

- Acesso indisponível
- Este acesso de assinatura não está mais disponível

The operator could not recover signing access through the normal UI.

---

## B. Production evidence (read-only)

Confirmed in production:

- contract canonical state = generated (UI “Gerado”)
- ceremony 0/2
- manifest frozen
- signature request status = revoked
- sign link status = revoked
- tenant / contract / party bindings = valid
- revocation = USER_EXPLICIT_REVOKE / REVOKE_SIGNING_ACCESS
- email delivery = PROVIDER_ACCEPTED (the message arrived)

Email delivery was **not** the root cause.

---

## C. Root cause

A signing request/link was **explicitly revoked**.

The email that had already been accepted by the provider still contained the **revoked** public URL. That is expected: historical mail is immutable.

The product gap was operational:

a legally signable `generated` or `partially_signed` contract whose remote request/link was revoked had **no safe recovery writer**.

`canSendForSignature` required `access.kind === none`.  
`canRotateAccess` excluded `revoked`.  
Rotate must not accept a terminal revoked parent request.

Result: the contract was stuck.

---

## D. Why public fail-closed was correct

The public signing page correctly rejected the revoked token.

That is **not** a bug. It must remain permanent:

- fail-closed
- no stroke UI
- no signature persistence

OLD_REVOKED_REQUEST_RESURRECTION = NONE  
OLD_REVOKED_LINK_RESURRECTION = NONE  
OLD_REVOKED_TOKEN_RESURRECTION = NONE

---

## E. Recovery gap

Required recovery (authorized operator only):

create **new** request + **new** link + **new** token  
for the **same** contract, tenant, and unsigned signing party  
without mutating legal content, manifest, existing signatures, or finance.

---

## F. Patch A

Canonical writer: `replaceRevokedSigningAccess`  
Invite wrapper: `replaceRevokedSigningAccessAndInvite`

PR #2 — revoked access recovery.

Creates NEW requestId, NEW linkId, NEW token.  
Does **not** resurrect the revoked parent.  
Does **not** redefine ROTATE (still same request, new link).  
Email after replacement uses the NEW signable URL.  
Delivery failure does not revoke the new access.

---

## G. Patch A.1

UX clarification only. Writers unchanged.

PR #3 — signing-access UX clarification.

Active/sent access must not label rotate as “Gerar novo acesso”.

---

## H. Canonical RESEND vs ROTATE vs REPLACE

| Operation | Writer | Request | Link | Token |
| --- | --- | --- | --- | --- |
| RESEND | `resendSigningAccess` | same | same | same (expiry unchanged) |
| ROTATE | `rotateSigningAccess` | same **valid** request | new | new (old link invalidated) |
| REPLACE REVOKED | `replaceRevokedSigningAccess` | **new** | **new** | **new** (old revoked records remain terminal) |

These three MUST NEVER be collapsed into one generic “send again”.

### Permanent UI mapping

**Active access (pending/sent, signable):**

- Assinar agora
- Reenviar acesso → `resendSigningAccess`
- Mais ações: Copiar link; **Substituir link de assinatura** → `rotateSigningAccess`; **Revogar acesso** → `revokeSigningAccess`

**Revoked access:**

- **Gerar novo acesso** → `replaceRevokedSigningAccess` only
- Do not show Reenviar / Copiar link ativo / Substituir link / Revogar novamente
- Never label recovery as “Reativar acesso”

---

## I. Real production E2E confirmation

Operator validation after Patch A / A.1:

1. contract had revoked remote signing access
2. old revoked access remained invalid
3. operator generated NEW access through normal UI
4. replacement access was created
5. new signature email arrived
6. CTA in the NEW email opened the public signing page
7. contract was reviewed
8. signature completed successfully

**REAL_PRODUCTION_E2E_RESULT = PASS**

The old revoked email/link remaining invalid is expected and permanent.

---

## J. Permanent regression tests

- `src/__tests__/phase1023jRevokedAccessReplacement.test.js` — Patch A matrix A01–A35
- `src/__tests__/phase1023kSigningAccessUx.test.js` — Patch A.1 UX01–UX16
- `src/__tests__/phase1023lRevokedSigningAccessRecovery.e2e.test.js` — **incident chain E2E**

The E2E covers, at the service boundary:

generated contract → create remote access → revoke → old URL blocked → replace → NEW request/link/token → old rows stay revoked → email payload uses NEW URL → NEW URL signable → canonical csig persisted → old URL remains blocked.

It also preserves professional csig + manifest on partial ceremony, and asserts that selecting the first historical link **without** a signability filter would rebuild the original email defect (`REGRESSION_TEST_WOULD_CATCH_OLD_BUG = YES`).

---

## K. Security / legal invariants

- NEW_LINK_WITHOUT_REQUEST_ID = IMPOSSIBLE
- MAX_SIGNABLE_ACCESS_PER_CONTRACT_PARTY = 1
- MAX_SIGNABLE_LINKS_PER_REQUEST = 1
- CROSS_TENANT_REPLACEMENT = BLOCK
- WRONG_PARTY_REPLACEMENT = BLOCK
- TERMINAL_CONTRACT_REPLACEMENT = BLOCK
- RAW_TOKEN_LOGGING = NONE
- TOKEN_IN_AUDIT = NONE
- UNSAFE_BYPASSES = NONE
- LEGAL_EVIDENCE_MUTATION = NONE
- AUTOMATIC_FINANCIAL_SIDE_EFFECTS = NONE
- DATABASE_MIGRATION = NONE
- BACKFILL = NONE

Replacement must not change contractId, legal content, manifest, existing csig, evidence, final artifact, or financial records.

---

## L. Production release baseline

Official production `origin/main` at closeout start:

- `be054ba` — close final legal lifecycle invariants (10.23I)
- PR #2 `763c8ee` / merge `f71349d` — Patch A `replaceRevokedSigningAccess`
- PR #3 `bd459bc` / merge `85bc7db` — Patch A.1 UX clarification

**PRODUCTION_CODE_CHANGED by this closeout = NO** (tests + this document only).

Finance V2 and SMTP/patient-email leftovers remain local and out of `origin/main`.
