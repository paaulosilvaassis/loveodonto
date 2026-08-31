# PHASE 10.23H — UI / RBAC / operator safety

**Escopo:** superfície operacional única para o lifecycle jurídico. Writers 10.23C–G não foram reimplementados.

**HEAD baseline:** `2cd186a`

**PERMISSIONS:** nenhum identificador novo. VOID/REISSUE continuam `canPerformLegalHighImpact` (admin/master). Sem backfill.

## Inventário

CONTRACT_ACTION_SURFACES = `ContractsAssinadosPage`, `ContractsPendentesPage`, `ContractsFilaPage`, `ClinicalContractSection`, `ClinicalSignatureSection`, `PatientRemoteInviteActions`, `ContractDetailModal`, `ContractSignPublicPage`, `CancelContractSecureModal`, `ReissueContractSecureModal`, `SigningAccessSecureModal`

LEGACY_ACTION_SURFACES = `sendContractForSignature` permanece só para primeiro envio quando a policy `canSendForSignature` (sem acesso ativo)

DUPLICATE_ACTION_SURFACES = NONE (policy única)

UNSAFE_UI_PATHS = NONE (toast de `signUrl` removido; sem `Nova versão` jurídica)

PREEXISTING_UNRELATED_CHANGES = SMTP/patient-email leftovers, reports, `tsconfig.tsbuildinfo` — preservados, não commitados

## Autoridade

UI_LIFECYCLE_POLICY_AUTHORITY = `src/contracts/lifecycle/uiPolicy.js` (`getContractLifecycleUiPolicy`)

CONTRACT_STATE_LABELS = Rascunho / Gerado / Assinatura parcial / Assinado / Cancelado / Invalidado / Substituído

SIGNING_ACCESS_STATE_LABELS = Aguardando envio/assinatura / Enviado / Concluído / Revogado / Expirado

## Matriz de estado

DRAFT_ACTION_POLICY = generate/finalize, cancel unsigned; sem sign/resend/rotate/void/reissue

GENERATED_ACTION_POLICY = send, sign on screen, cancel unsigned; resend/rotate/revoke só com acesso

PARTIAL_ACTION_POLICY = continuar cerimônia, abort (evidência preservada), resend/rotate/revoke autorizados

SIGNED_ACTION_POLICY = view evidence/artifact; void/reissue admin/master; sem cancel/abort/resend/rotate/sign/Nova versão

CANCELLED_ACTION_POLICY = terminal; reissue admin/master com confirmação; sem sign/resend/rotate

VOIDED_ACTION_POLICY = histórico; view evidence; reissue admin/master; sem mutação do original

SUPERSEDED_ACTION_POLICY = histórico + linhagem navegável; sem mutação/assinatura

## Matriz de papéis

MASTER_POLICY = todas as ações administrativas do lifecycle

ADMIN_POLICY = todas as ações administrativas autorizadas (inclui void/reissue)

GERENTE_POLICY = cancel/abort/rotate somente se `admin_contratos:cancel`; SEM void/reissue automático

RECEPTION_POLICY = resend operacional; SEM void/reissue/rotate

PROFESSIONAL_POLICY = cerimônia + rotate; SEM void/reissue administrativo

PUBLIC_POLICY = fluxo público do token; sem ações administrativas

## UX de writers

CANCEL_UI = modal seguro + motivo + frase; `cancelContractSecure` → writer canônico

ABORT_UI = texto: assinaturas permanecem como evidência; contrato cancelado; acessos pendentes revogados

VOID_UI = Invalidar contrato assinado; frase `INVALIDAR CONTRATO`; financeiro não muda automaticamente

REISSUE_UI = Reemitir contrato; frase `REEMITIR CONTRATO`; novo contractId; novas assinaturas; PDF antigo histórico

REVOKE_UI = Revogar acesso; motivo; `revokeSigningAccess`

ROTATE_UI = Gerar novo acesso; acesso anterior deixa de funcionar; `rotateSigningAccess`

RESEND_UI = Reenviar acesso; mesmo acesso; prazo inalterado; `resendSigningAccess`

RESEND_EXPLAINS_SAME_ACCESS = YES

ROTATE_EXPLAINS_OLD_ACCESS_INVALIDATION = YES

EXPIRED_ORDINARY_RESEND_BLOCKED = YES (relógio confiável)

CEREMONY_PROGRESS_DYNAMIC = YES (`N de M assinaturas concluídas`)

LINEAGE_UI = YES (Substituído pelo / Reemissão do + número amigável)

AUDIT_UI = eventos de `contractLifecycleAudits` + histórico existente; sem token

ERROR_MAPPING = `mapLifecycleUiError` (PT; sem stack/IDs)

## Página pública

PUBLIC_EXPIRED_UI = "Este acesso de assinatura expirou."

PUBLIC_REVOKED_UI = "Este acesso de assinatura não está mais disponível."

PUBLIC_TERMINAL_CONTRACT_UI = "Este contrato não está disponível para assinatura."

Sem stroke UI nesses estados. Sem vazamento de tenant/request/stack.

## Operator safety

DOUBLE_SUBMIT_PROTECTION = YES (`busy` / `busyId` + disable)

ACCESSIBILITY = labels visíveis, Escape bloqueado se busy, `aria-busy`, `role=alert`

RESPONSIVE = `.ctr-actions` já faz wrap; ações por policy (sem overflow de ações ilegais)

DIRECT_DB_MUTATION_FROM_UI = NONE

UNSAFE_LEGACY_UI_ACTIONS = NONE

SIGNED_NEW_VERSION_UI_PATHS = NONE_UNSAFE

RAW_TOKEN_UI_RENDERING = NONE

RBAC_UI_WRITER_MISMATCHES = NONE (UI espelha `commandAuth`; writers continuam fail-closed)

UNSAFE_BYPASSES = NONE

## Testes

TARGETED_TESTS = PASS (`phase1023hLifecycleUiRbac.test.js`, H01–H60 agrupados)

TEN_23G_REGRESSION = PASS

TEN_23F_REGRESSION = PASS

TEN_23E_REGRESSION = PASS

TEN_23D_REGRESSION = PASS

TEN_23C_REGRESSION = PASS

PHASE1021L_REGRESSION = PREEXISTING_FAIL (`assertRemoteSignatureBinding` — 10.21CO; não enfraquecido)

TEN_21CO_REGRESSION = PASS

PUBLIC_SIGNING_REGRESSION = PASS (`phase1021bs`, `phase1021bu`, `phase1021ao`, `phase1021ap`)

TENANT_ISOLATION_REGRESSION = PASS (`tenantIsolation`, `phase103ContractsPersistenceTenantSecurity`)

FINAL_ARTIFACT_REGRESSION = PASS (coberto por 10.21CO / 10.23C)

BUILD = PASS (`vite build`)

TYPECHECK = PREEXISTING_UNRELATED (`tsc -b` falha em domain-events/repositories; nenhum `.ts` novo em 10.23H)

DIFF_CHECK = PASS nos arquivos 10.23H (arquivos UI que eram CRLF foram normalizados para LF para o gate)

## Dados

DATABASE_MIGRATION = NONE

BACKFILL = NONE

PRODUCTION_DATA_MUTATION = ZERO

CTR00003_PRESERVED = YES

CTR00004_PRESERVED = YES

CTR00005_PRESERVED = YES

FINAL_GATE = READY_FOR_PHASE_10_23I_FINAL_LIFECYCLE_VALIDATION
