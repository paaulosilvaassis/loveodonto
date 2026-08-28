# PHASE 10.23G — ROTATE / RESEND / EXPIRE

**Escopo:** um link ativo, rotação de token, expiração autoritativa lazy.

**Não implementado:** 10.23H UI/RBAC completa (void/reissue bits; esconder caminhos inseguros restantes).

## Writers

CANONICAL_ROTATE_WRITER = `rotateSigningAccess`

CANONICAL_RESEND_WRITER = `resendSigningAccess`

CANONICAL_EXPIRE_WRITER = `persistExpiredSigningAccess` (lazy)

ROTATE_MODEL = SAME_REQUEST

ONE_ACTIVE_SIGNABLE_LINK = YES (por requestId / slot PATIENT)

OLD_TOKEN_REUSED_ON_ROTATE = NO

RESEND_CREATES_TOKEN = NO

RESEND_CHANGES_EXPIRES_AT = NO

EXPIRY_SOURCE_OF_TRUTH = `expiresAt <= trustedNow`

EXPIRY_PERSIST = lazy no resolve / sign / rotate / createSignatureRequest

CONTRACT_EXPIRED_STATUS = NO

CRON = NONE

ROTATE_AUTH = SENSITIVE + profissional da cerimônia (recepção BLOCK)

RESEND_AUTH = OPERATIONAL (admin / master / gerente / recepção / profissional)

ROTATE_REASON_REQUIRED = YES

RESEND_REASON_REQUIRED = NO

UNSAFE_BYPASSES = NONE

- rotação inline do provider delega ao writer canônico
- `createContractNewVersion` permanece `SIGNED_CONTRACT_IMMUTABLE`

## Testes

TARGETED_TESTS = PASS (`phase1023gSigningAccessRotateResendExpire.test.js`)

TEN_23F_REGRESSION = PASS

TEN_23E_REGRESSION = PASS

TEN_23D_REGRESSION = PASS

TEN_23C_REGRESSION = PASS

TEN_21BN_REGRESSION = PASS (send-again após expiry continua SAME_REQUEST + novo token)

BUILD = PASS (`vite build`)

## Dados

DATABASE_MIGRATION = NONE

BACKFILL = NONE

PRODUCTION_DATA_MUTATION = ZERO

FINAL_GATE = READY_FOR_PHASE_10_23H_UI_RBAC
