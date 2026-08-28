# PHASE 10.23E — Cancel / Abort / Revoke writers

**Commit:** a preencher após git  
**Escopo:** CANCEL_UNSIGNED + ABORT_PARTIAL + REVOKE_SIGNING_ACCESS  
**Não implementado:** VOID_SIGNED, SUPERSEDE, REISSUE, ROTATE

## Worktree

PREEXISTING_UNRELATED_CHANGES (não staged nesta fase):

- docs/reports/_phase1021v_domain_e2e_result.json
- src/__tests__/mocks/lucide-react.js
- src/__tests__/phase1021bnDirectSmtpUi.test.js
- src/components/clinical/ClinicalSignatureSection.jsx
- src/components/contracts/SendContractSignatureModal.jsx
- src/services/patientEmail.js
- tsconfig.tsbuildinfo
- reports/shots 10.21AL / 10.23A / .DS_Store e correlatos untracked

## Writers

CANONICAL_CANCEL_WRITER = `cancelUnsignedContract` (`contractLifecycleCommandService`)  
CANONICAL_ABORT_WRITER = `abortPartialCeremony`  
CANONICAL_REVOKE_WRITER = `revokeSigningAccess`

CANCEL_UNSIGNED_ALLOWED_STATES = draft, generated  
ABORT_PARTIAL_ALLOWED_STATES = partially_signed (cerimônia incompleta, ≥1 csig)

LEGAL_REASON_REQUIRED_CANCEL = YES (`LIFECYCLE_REASON_REQUIRED`, inclusive whitespace)  
LEGAL_REASON_REQUIRED_ABORT = YES  
LEGAL_REASON_REQUIRED_EXPLICIT_REVOKE = YES  
ACTOR_REQUIRED = YES (`user.id`, `LIFECYCLE_ACTOR_REQUIRED`)  
TRUSTED_TIMESTAMP_IMPLEMENTED = YES (um `actedAt` ISO por comando)

## Persistência

LIVE contract spelling = `canceled`  
Request/link spelling = `revoked`

CANCEL_METADATA = canceledAt, canceledBy, canceledByRole, cancelReason, previousLifecycleState  
ABORT_METADATA = abortedAt, abortedBy, abortReason + ceremony.status=aborted  
REVOKE_METADATA = revokedAt, revokedBy, revokeReason, previousStatus (imutáveis em retry)

## Audit

CONTRACT_CANCEL_AUDIT = CONTRACT_CANCELLED  
CEREMONY_ABORT_AUDIT = CEREMONY_ABORTED  
REQUEST_REVOKE_AUDIT = SIGN_REQUEST_REVOKED  
LINK_REVOKE_AUDIT = SIGN_LINK_REVOKED

## Efeitos

CANCEL_REVOKES_REQUEST = YES  
CANCEL_REVOKES_LINK = YES  
ABORT_REVOKES_REQUEST = YES  
ABORT_REVOKES_LINK = YES  
EXISTING_SIGNATURE_PRESERVED_ON_ABORT = YES  
MANIFEST_PRESERVED = YES  
FINAL_ARTIFACT_PRESERVED = YES  
FINANCIAL_SIDE_EFFECT = NONE

TENANT_BINDING_ENFORCED = YES (`LIFECYCLE_TENANT_MISMATCH`)  
REQUEST_LINK_BINDING_ENFORCED = YES (`SIGNING_ACCESS_BINDING_INVALID`)

## Autorização / UI

CANCEL_AUTHORIZATION = SENSITIVE (admin / master / admin_contratos:cancel)  
ABORT_AUTHORIZATION = LEGAL_HIGH_IMPACT (mesma RBAC efetiva)  
REVOKE_AUTHORIZATION = SENSITIVE (mesma RBAC)

CANONICAL_UI_PATH = CancelContractSecureModal → cancelContractSecure → dispatchCancelOrAbort  
LEGACY_CANCEL_WRITERS = cancelGeneratedContract, cancelContractSecure (ambos delegam)  
LEGACY_REVOKE_WRITERS = cancelSignatureRequest (delega)  
UNSAFE_BYPASSES = NONE

DIRECT_CANCEL_WRITES = `cancelPersist.js` (somente txn canônica)  
DIRECT_REQUEST_REVOKE_WRITES = `accessRevocation.js` (somente txn canônica)  
DIRECT_LINK_REVOKE_WRITES = `accessRevocation.js` (somente txn canônica)  
UNGUARDED_CANCEL_PATHS = NONE  
UNGUARDED_REVOKE_PATHS = NONE

Idempotência: segundo CANCEL/ABORT/REVOKE não cria novo fato jurídico nem reescreve motivo/ator/timestamp originais.

## Ressurreição

CANCELLED_RESURRECTION_REGRESSION = PASS (E44/E45: link pending artificial + contrato cancelled → CONTRACT_NOT_SIGNABLE, ZERO csig)  
ABORTED_RESURRECTION_REGRESSION = PASS (abort + restore pending → CONTRACT_NOT_SIGNABLE)

Camada 1 (request/link revoked) e camada 2 (`assertContractSignable`) independentes. 10.23C guard permanece.

## Testes

TARGETED_TESTS = PASS (E01–E48 em `phase1023eCancelAbortRevoke.test.js`)  
TEN_23D_REGRESSION = PASS  
TEN_23C_REGRESSION = PASS  
  T26 persist spelling alinhado `cancelled` → `revoked` (canônico). Asserção comportamental (token não assina) inalterada.  
CONTRACTS_REGRESSION = PASS (`contractModuleService`)  
SIGNATURE_REGRESSION = PASS (`contractSignatureFlow`, 10.21BA/BU/CO/AP)  
REQUEST_LINK_REGRESSION = PASS (CO/BU + 10.23E E15–E18/E28–E34)  
FINAL_ARTIFACT_REGRESSION = PASS (10.23C T22–T24 + 10.23E E42/E43)  
TENANT_ISOLATION_REGRESSION = PASS (`tenantIsolation`, phase103, 10.23E E35–E38)  
PHASE_10_21_REGRESSION = PASS (CK, CH, BZ, BU, CO, BA, AP)

PREEXISTING_PHASE1021L_FAILURE = FAIL  
PHASE1021L_FAILURE_REASON = `sendContractForSignature` cria link sem `requestId`; `assertRemoteSignatureBinding` exige request/link binding  
FAILURE_CHANGED_BY_10_23E = NO  
PREEXISTING_FAILURE_UNCHANGED = YES

BUILD = PASS (`vite build`)  
DIFF_CHECK = PASS  
TYPECHECK = PREEXISTING FAIL (domain-events / repositories CRM; fora do escopo 10.23E)

## Dados / deploy

DATABASE_MIGRATION = NONE  
BACKFILL = NONE  
PRODUCTION_DATA_MUTATION = ZERO

CTR00003_PRESERVED = YES (piloto imutável; sem backfill)  
CTR00004_PRESERVED = YES  
CTR00005_PRESERVED = YES (signed, 2 csigs, artifact existente; sem mutação)

Smoke pós-deploy (somente leitura): app load, módulo contratos, UI de motivo/confirmação.  
Não cancelar/revogar/assinar contrato real de produção.

FINAL_GATE = READY_FOR_PHASE_10_23F_VOID_AND_REISSUE
