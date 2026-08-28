# PHASE 10.23F — VOID_SIGNED + REISSUE + SUPERSEDE

**Escopo:** invalidar contrato assinado e reemitir com nova identidade jurídica.  
**Não implementado:** ROTATE / RESEND / expiry persistida (10.23G).

## Writers

CANONICAL_VOID_WRITER = `voidSignedContract`  
CANONICAL_REISSUE_WRITER = `reissueContract` (SUPERSEDE interno)

VOID_ALLOWED_STATE = signed (`completed` normaliza para signed)  
REISSUE_ALLOWED_SOURCE_STATES = signed (via VOID atômico) | voided | cancelled

REISSUE_NEW_CONTRACT_ID = YES  
REISSUE_NEW_VERSION = YES (oldVersion + 1)

OLD_SIGNATURES_COPIED = NO  
OLD_MANIFEST_COPIED = NO  
OLD_REQUEST_LINK_TOKEN_COPIED = NO  
OLD_FINAL_ARTIFACT_COPIED = NO

REISSUE_ATOMICITY_MODEL = um `withDb` (void se signed → insert sucessor → supersede fonte)  
REISSUE_IDEMPOTENCY = YES (já superseded com sucessor vivo não cria outra identidade)  
CONCURRENT_REISSUE_PROTECTION = YES (checagem `replacedById`/`supersededByContractId` no mesmo withDb)

UNSAFE_BYPASSES = NONE  
`createContractNewVersion` permanece fail-closed (`SIGNED_CONTRACT_IMMUTABLE`).

## Testes

TARGETED_TESTS = PASS (`phase1023fVoidReissue.test.js`)  
TEN_23E_REGRESSION = PASS  
TEN_23D_REGRESSION = PASS (VOID/SUPERSEDE agora `WRITER_IMPLEMENTED = true`)  
TEN_23C_REGRESSION = PASS (`Nova versão` / in-place ainda bloqueados)  
BUILD = PASS (`vite build`)  
DIFF_CHECK = PASS

## Dados

DATABASE_MIGRATION = NONE  
BACKFILL = NONE  
PRODUCTION_DATA_MUTATION = ZERO  
CTR00003/00004/00005 = PRESERVED (`PILOT_IMMUTABLE`)

FINAL_GATE = READY_FOR_PHASE_10_23G_ROTATE_RESEND_EXPIRE
