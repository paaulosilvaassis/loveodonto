# PHASE_10.23A — Contract cancellation, reissue & signature incident lifecycle

**Data:** 2026-08-28  
**Modo:** READ-ONLY  
**Mutations:** ZERO  
**10.22:** não tocada (`WAITING_EXTERNAL_PREREQUISITE` / `PHASE_10_22_SAFELY_PARKED`)

Fonte: código operacional IndexedDB (`src/services/*`, `src/contracts/*`, UI clínica/admin) + domínio TypeScript V2 (`src/domain/contracts/*`, runtime **não** produção).

---

## Duas camadas (não misturar)

| Camada | Onde | Produção (piloto 10.21) |
| --- | --- | --- |
| **LIVE** | `generatedContracts` IndexedDB, `contractModuleService.js`, `contractService.js`, `signatureProviderService.js` | SIM — CTR-2026-00005 |
| **DOMAIN V2** | `contract-status.machine.ts`, `contract.application-service.ts`, envelopes | NÃO — `CONTRACTS_V2_RUNTIME_MODES` = `disabled` / `memory-test` / `local-integration` / `staging-disabled` |

O restante deste relatório descreve **LIVE**, salvo quando marcado DOMAIN.

---

## 1 — Inventário de status

### CONTRACT_STATUSES (LIVE — `contractConstants.js`)

| Status | Classificação |
| --- | --- |
| `draft` | DEFINED + ACTUALLY_USED |
| `generated` | DEFINED + ACTUALLY_USED |
| `sent` | DEFINED + ACTUALLY_USED |
| `viewed` | DEFINED + ACTUALLY_USED |
| `signed_by_clinic` | DEFINED + ACTUALLY_USED (cerimônia 1/2 profissional) |
| `signed_by_patient` | DEFINED + ACTUALLY_USED (paciente primeiro / ANY_ORDER) |
| `signed` | DEFINED + ACTUALLY_USED (cerimônia 2/2; piloto 00005) |
| `canceled` | DEFINED + ACTUALLY_USED (writer `cancelGeneratedContract`) |
| `replaced` | DEFINED + ACTUALLY_USED (`createContractNewVersion`) |
| `completed` | DEFINED + PARTIAL (webhook/legado; cerimônia clínica grava `signed`) |
| `refused` | DEFINED + PARTIAL (webhook map; writer clínico não recusa) |
| `expired` | DEFINED + PARTIAL (mapa de webhook; link expira sem promover contrato) |
| `awaiting_data` / `ready_to_send` | DEFINED + DEAD/LEGACY (label UI) |
| `vigente` / `rescindido` | DEFINED + DEAD/LEGACY (labels; `vigente` lido como “assinado” em ceremony helper) |

### CONTRACT_STATUSES (DOMAIN V2 — não produção)

`DRAFT`, `READY_FOR_REVIEW`, `PENDING_INTERNAL_APPROVAL`, `APPROVED`, `PENDING_SIGNATURES`, `PARTIALLY_SIGNED`, `SIGNED`, `DECLINED`, `EXPIRED`, `CANCELLED`, `SUPERSEDED`, `TERMINATED`, `VOIDED`.

`VOIDED` está no enum e em `TERMINAL_CONTRACT_STATUSES`, mas **nenhuma transição entra em VOIDED** no grafo. DEAD.

### CEREMONY_STATUSES (LIVE)

`blocked`, `ready_to_sign`, `partially_signed`, `awaiting_required_signers`, `signed` (`COMPLETED` alias), `legacy_signed`. Snapshot em `metadata.signatureCeremony`.

### SIGNATURE_STATUSES

LIVE: stroke **não** tem state machine — presença em `contractSignatures[]` = assinado. Slot da cerimônia: `signed` \| `pending`.

DOMAIN: `PENDING` → `INVITED` → … → `SIGNED` / `CANCELLED` / `EXPIRED` / `DECLINED` / `FAILED`. Não wired em produção.

### REQUEST_STATUSES (LIVE `contractSignatureRequests`)

| Status | Classificação |
| --- | --- |
| `pending` | USED |
| `sent` | USED |
| `cancelled` | USED (`cancelSignatureRequest`) |
| `completed` | USED (após `signContractViaLink`) |
| `revoked` | DEFINED em filtro de rotação; **nunca escrito** — DEAD |

### LINK_STATUSES (LIVE `contractSignLinks`)

`pending`, `signed`, `consumed` (lido), `expired` (rotação), `cancelled` (revogação de request). Token = `link.token` (não há tabela de token).

### MANIFEST_STATUSES

LIVE: freeze em `clinicalPackageManifests` + `metadata.frozenAt` / `packageManifestId` / `packageManifestHash`. Sem enum de lifecycle (não há `CANCELLED`/`SUPERSEDED` no writer clínico).

DOMAIN: `DRAFT` \| `FROZEN` \| `SIGNING` \| `SIGNED` \| `SUPERSEDED` \| `CANCELLED` — design only.

### FINAL_ARTIFACT_STATUSES (LIVE metadata)

`generated`, `failed`, ausente (histórico 00005: PDF existe; campos CO binários ausentes — **não backfill**).

---

## 2 — Máquina de estados LIVE (real)

```
draft
  --finalize--> generated
  --cancelGeneratedContract--> canceled

generated
  --send / invite--> sent
  --cancel--> canceled
  --professional stroke--> signed_by_clinic
  --upload PDF--> signed   (atalho)

sent / viewed
  --first human view--> viewed
  --stroke--> signed_by_clinic | signed_by_patient | signed
  --cancel--> canceled

signed_by_clinic / signed_by_patient   (cerimônia parcial)
  --stroke restante--> signed
  --cancel--> canceled     (UI clínica + admin; NÃO revoga link)

signed / completed
  --createContractNewVersion--> replaced   (in-place)
  --cancel--> BLOQUEADO no writer se status==='signed'
              NÃO bloqueado se status==='completed'

canceled
  --signContractOnScreen / via link pendente--> signed*   (FALHA ABERTA)
```

`*` `signContractOnScreen` só recusa `draft` e `signed`. Não recusa `canceled`, `replaced`, `expired`, `refused`.

| Pergunta | Resposta LIVE |
| --- | --- |
| SIGNED_CONTRACT_MUTABLE | **YES** — `createContractNewVersion` grava `status=replaced` + `replacedById` na row assinada |
| SIGNED_CONTRACT_CANCEL_SUPPORTED | **NO** para `signed` (writer). **FURO** para `completed` |
| PARTIAL_CEREMONY_CANCEL_SUPPORTED | **YES** (status → `canceled`; strokes permanecem; links **não** revogados) |
| FINALIZED_DOCUMENT_EDIT_SUPPORTED | **NO** para HTML (`isContractEditable` = draft/generated). Status/metadata da row assinada **são** mutáveis |

DOMAIN: `SIGNED` → `SUPERSEDED` \| `TERMINATED` apenas. Não produção.

---

## 3 — Cancelamento de contrato

Writers:

1. **Canônico clínico (hardening):** `cancelContractSecure` → `cancelGeneratedContract`
2. **Admin bypass:** `AdminContratosConsentimentosPage` chama `cancelGeneratedContract` **sem** senha, frase, motivo
3. **DOMAIN:** `cancelContract` + `contracts:cancel` — não produção

| Campo | Valor |
| --- | --- |
| CONTRACT_CANCELLATION_IMPLEMENTED | YES (LIVE unsigned/partial) |
| CAN_CANCEL_DRAFT | YES |
| CAN_CANCEL_GENERATED | YES |
| CAN_CANCEL_PARTIALLY_SIGNED | YES (`signed_by_clinic` ≠ `signed`) |
| CAN_CANCEL_SIGNED | NO (writer). UI clínica esconde. Admin esconde só `canceled`, mas writer bloqueia `signed` |
| CANCELLATION_REASON_REQUIRED | YES no fluxo seguro; **NO** no admin bypass |
| CANCELLED_BY_RECORDED | YES (seguro); admin bypass grava `canceledBy` via `user.id` |
| CANCELLED_AT_RECORDED | YES |
| PREVIOUS_STATUS_RECORDED | YES só em `contractCancelAudit` (fluxo seguro) |
| AUDIT_EVENT_CREATED | YES: `contractAuditLogs` action `CANCEL`; fluxo seguro também `contractCancelAudit` + clinical `contract_canceled` |

Tipo: **SOFT_STATE_TRANSITION** (`status=canceled`). **DELETE = NO** neste writer.  
**PRESERVES_EVIDENCE = PARTIAL:** row, HTML, csigs permanecem; requests/links **não** são encerrados.

---

## 4 — Reissue / nova versão

LIVE: `createContractNewVersion` (`contractModuleService.js`).

| Campo | Valor |
| --- | --- |
| REISSUE_IMPLEMENTED | PARTIAL (clone rascunho; não é void jurídico) |
| NEW_CONTRACT_ID_CREATED | YES |
| NEW_VERSION_CREATED | YES (`version` = old+1 no draft) |
| OLD_CONTRACT_PRESERVED | PARTIAL (row permanece; **status sobrescrito** `signed` → `replaced`) |
| OLD_SIGNATURES_PRESERVED | YES (continuam no `contractId` antigo; não copiadas) |
| OLD_FINAL_PDF_PRESERVED | YES (`pdfUrl` não é apagado no patch) |
| Motivo / ator jurídico | **AUSENTE** (sem reason, sem confirmação) |

Campos reais: `replacedById` (old), `parentContractId` (new).  
DOMAIN mapper: `replacedById` ↔ `supersededByContractId`.  
Não existe `reissueReason` / `supersedesContractId` no LIVE.

UI: botão **Nova versão** em `/gestao/contratos/assinados` (`rolesAllowed`: admin, gerente, recepcao). **Sem `can()`.**  
**Não** chama `isImmutablePilotContract` — CTR-2026-00005 é vulnerável a este clique.

DOMAIN `REISSUE` existe só em `CONTRACT_VERSION_GENERATION_REASONS`.

---

## 5 — Request / link / token revocation

| Campo | Valor |
| --- | --- |
| REQUEST_REVOCATION_IMPLEMENTED | YES — `internalProvider.cancelSignatureRequest` |
| LINK_REVOCATION_IMPLEMENTED | YES — pending links do request → `cancelled` |
| TOKEN_REVOCATION_IMPLEMENTED | YES por identidade (token **é** o link) |

Guard público: `getContractBySignToken`

- `signed` / `consumed` → `{ replay: true }`
- `status !== pending` (inclui `cancelled`, `expired`) → `null` (fail-closed)
- `expiresAt < now` + pending → `{ expired: true }` (runtime; **não** persiste)

`REVOKED_LINK_PUBLIC_ACCESS_BLOCKED` = YES **depois** de persistir `cancelled`/`expired`.  
`REVOKED_LINK_SIGN_BLOCKED` = YES via o mesmo resolver (`signContractViaLink` recusa `!resolved`).

`cancelSignatureRequest` **não** verifica tenant, papel, nem status do contrato. UI: profissional na cerimônia, reason hardcoded `'cancelado pela clínica'`, **sem confirmação**.

---

## 6 — Expiração

| Campo | Valor |
| --- | --- |
| EXPIRATION_IMPLEMENTED | PARTIAL |
| EXPIRED_LINK_VIEW_BLOCKED | YES (runtime `expired: true` → UI pública) |
| EXPIRED_LINK_SIGN_BLOCKED | YES (runtime) |
| REQUEST_STATUS_UPDATED_ON_EXPIRATION | NO (até resend/rotação) |
| LINK_STATUS_UPDATED_ON_EXPIRATION | NO no relógio; YES se `createSignatureRequest` rotaciona (`expired`) |
| AUDIT_EVENT_ON_EXPIRATION | NO no expiry passivo; YES `challenge_rotated` no resend |

Runtime rejection ≠ transição persistida.

---

## 7 — Rotação de link

Não há `rotateSignLink` dedicado. Rotação **implícita** em `createSignatureRequest` quando request paciente não-terminal está expirado.

| Campo | Valor |
| --- | --- |
| LINK_ROTATION_IMPLEMENTED | PARTIAL (só expiry + reenvio) |
| OLD_LINK_REVOKED | YES se `status===pending` → `expired` (primeiro link do request) |
| OLD_TOKEN_UNUSABLE | YES após persist (`status !== pending` → null) |
| NEW_LINK_CREATED | YES |
| NEW_TOKEN_CREATED | YES |
| SAME_REQUEST | YES |
| NEW_REQUEST | NO |
| ROTATION_REASON | metadata `expired_link` only |
| ROTATED_BY / ROTATED_AT | `createdBy`/`createdAt` do novo link; sem campos de rotação |
| AUDIT_EVENT | `challenge_rotated` |

`ROTATION_RACE_PROTECTION` = PARTIAL: `withDb` síncrono (um tab). Dois links `pending` no mesmo request: só o **primeiro** `find` é expirado.

Não há rotação operacional por incidente (compromisso de token ainda válido).

---

## 8 — Incidente 1/2 (profissional signed, paciente pending)

Não executado. Inferência de código:

| Campo | Valor |
| --- | --- |
| CAN_ABORT_1_OF_2 | YES via cancel de contrato **ou** cancel de request |
| PROFESSIONAL_SIGNATURE_PRESERVED | YES (nenhum writer apaga `contractSignatures`) |
| PATIENT_REQUEST_REVOKED | só se `cancelSignatureRequest`; **não** no cancel de contrato |
| PATIENT_LINK_REVOKED | idem |
| FROZEN_MANIFEST_PRESERVED | YES (freeze não é desfeito no cancel) |
| DOCUMENT_PRESERVED | YES |
| AUDIT_TRAIL_PRESERVED | YES (append) |

Risco: abortar contrato **sem** revogar request deixa o paciente assinar e **ressuscitar** o contrato (`canceled` → `signed`).

---

## 9 — Incidente 2/2 (signed + PDF)

| Campo | Valor |
| --- | --- |
| CAN_VOID_SIGNED_CONTRACT | NO (LIVE). DOMAIN TERMINATED/VOIDED não produção; VOIDED inalcançável até no grafo |
| CAN_REISSUE_SIGNED_CONTRACT | PARTIAL — `createContractNewVersion` (in-place replace, sem void) |

Se alguém clicar Nova versão:

| OLD_PDF_IMMUTABLE | bytes permanecem; status da row **muda** |
| OLD_SIGNATURES_IMMUTABLE | strokes não são reescritos nem reutilizados no draft |
| OLD_MANIFEST_IMMUTABLE | freeze antigo permanece na row old |
| NEW_CEREMONY_REQUIRED | YES (draft novo, sem csigs) |
| NEW_SIGNATURES_REQUIRED | YES |

Reuso de stroke/csig na nova versão: **não implementado** (não CRITICAL por reuso; CRITICAL por mutar a row assinada e ausência de guarda do piloto 00005).

---

## 10 — Artefato final

`maybeGenerateFinalSignedArtifact`: skip `already_generated` se `finalArtifactStatus==='generated'` && `pdfUrl`. Skip `immutable_pilot` **somente CTR-2026-00003**.

| Campo | Valor |
| --- | --- |
| FINAL_ARTIFACT_IMMUTABLE | PARTIAL (skip se already_generated; 00004/00005 não estão no set imutável) |
| FINAL_ARTIFACT_DELETE_PATH_EXISTS | NO no writer de artifact |
| FINAL_ARTIFACT_OVERWRITE_PATH_EXISTS | NO se already_generated; YES se status não é `generated` (retry após `failed`) |
| FINAL_ARTIFACT_REGENERATION_PATH_EXISTS | YES para não-generated; NO para generated |

Cancel/reissue **não** chamam delete/regeneração do PDF. Risco: Nova versão não toca o PDF; muta o contrato dono.

---

## 11 — Financeiro

`cancelFinancialAction` persistido: `keep` \| `cancel_future` \| `refund` \| `manual`.

**Nenhum** serviço financeiro lê esse campo. UI sugere “Cancelar parcelas futuras” / “Estornar” **sem side effect**.

| Campo | Valor |
| --- | --- |
| CONTRACT_CANCEL_FINANCIAL_SIDE_EFFECT | NONE (só log/audit) |
| REISSUE_FINANCIAL_SIDE_EFFECT | NONE |

Orçamento / receivable / pagamento / financiamento **não** são apagados pelo cancel jurídico atual.

---

## 12 — UI / permissões visíveis

| Ação | UI | Quem | Confirmação | Motivo |
| --- | --- | --- | --- | --- |
| Cancelar contrato | Clínica (`CancelContractSecureModal`) | admin / master / `admin_contratos:cancel` (gerente herda) | senha + frase `CANCELAR CONTRATO` | YES |
| Cancelar contrato | Admin Contratos | `admin_contratos:cancel` | **NO** | **NO** |
| Nova versão | Assinados | quem entra na rota (admin/gerente/**recepcao**) | **NO** | **NO** |
| Cancelar solicitação | Cerimônia | quem tem `readiness.canSend` (profissional no fluxo) | **NO** | hardcoded |
| Reenviar e-mail | Cerimônia | `canSend` | NO | N/A |
| Copiar link | Cerimônia | com invite ativo | NO | N/A |
| Rotacionar link | **ausente** | — | — | só implícito no resend expirado |

---

## 13 — Authorization (código real)

```
MASTER (isMaster)     = todas as permissões via can()
ADMIN (role=admin)    = canCancel clínico por role; RBAC total típico
GERENTE               = seed = administrativo → admin_contratos:cancel
ADMINISTRATIVO        = cancel
RECEPCAO              = SEM cancel; COM acesso à página Assinados → Nova versão
PROFISSIONAL/DENTISTA = generate; SEM cancel de contrato; COM cancel/resend de request na cerimônia
RT                    = sem papel jurídico separado (só identidade clínica)
FINANCEIRO            = view prontuário_contratos; sem cancel
```

Operação jurídica (cancel contrato) e convite (e-mail/revoke request) **não** estão no mesmo permission bit — correto na clínica; o revoke de request é mais frouxo que o cancel de contrato.

`prontuario_contratos:delete` e `admin_contratos:delete` existem no **catálogo** e **não** têm writer encontrado.

DOMAIN `contracts:cancel` / `cancel_envelope` — não produção.

---

## 14 — Audit ledger

LIVE, append-only, **não** é chain-hash.

| EVENT | Writer | Entity | Actor | Time | Reason | Prev | New |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `CANCEL` | `contractService.audit` → `contractAuditLogs` | contractId | userId | createdAt | em metadata se seguro | não | implícito |
| `contractCancelAudit` row | `cancelContractSecure` | contractId | userId/name/role | canceledAt | YES | previousStatus | CANCELED |
| `REPLACED` | `registerEvent` → `contractEvents` | contractId | userId | createdAt | **NO** | — | newContractId |
| `request_cancelled` | `logSignatureAudit` | contract + request | user | createdAt | payload.reason | — | — |
| `challenge_rotated` | `logSignatureAudit` | contract + request | user | createdAt | expired_link | — | — |
| `signed_via_link` | `logSignatureAudit` | contract | — | createdAt | — | — | — |
| clinical `contract_canceled` | `logClinicalEvent` | quote | user | — | reason + financialAction | — | — |

Gaps: sem VOID/SUPERSEDE/EXPIRE persistido; REPLACED sem motivo; cancel de contrato **não** emite evento de revoke de link; DOMAIN ledger (`contract.ledger.entry_appended`) não produção.

---

## 15 — Delete path

Pesquisado: `delete()`/`splice()`/`remove()`/`hardDelete` em contracts, signatures, requests, links, manifests, artifacts, audit.

| Path | Classe |
| --- | --- |
| Writers LIVE de cancel/reissue/sign | **não** removem rows jurídicas — SAFE_NONLEGAL |
| Testes `db.contractSignatures = []` | SAFE_NONLEGAL (test harness) |
| DOMAIN memory `store.delete` (object storage) | UNREACHABLE produção |
| `admin_contratos:delete` / `prontuario_contratos:delete` | catálogo sem writer — UNREACHABLE |
| Clear site data do browser / IndexedDB origin | fora do app — UNKNOWN operacional |

**LEGAL_HARD_DELETE_PATHS = NONE** (executável no app).

Risco principal **não** é delete: é **mutação in-place** e **ressurreição**.

---

## 16 — Test coverage

| Tema | Classificação |
| --- | --- |
| cancel contract (domínio V2 draft) | PASSING_TEST_EXISTS (`phase105…`) — **não** cobre LIVE IndexedDB |
| cancelContractSecure / admin bypass | MISSING |
| cancel partial ceremony + preserve csig | MISSING |
| void signed | MISSING |
| reissue / createContractNewVersion | MISSING (página só smoke crash) |
| request revocation + public fail-closed | PARTIAL (resolver `status!==pending`; sem teste de cancel+sign) |
| expiration runtime + rotate on resend + replay | PASSING_TEST_EXISTS (`phase1021bn` P/Q) |
| rotation race dois pending | MISSING |
| old PDF preservation on reissue | MISSING |
| old signature preservation on cancel | MISSING |
| financial preservation | MISSING |
| canceled contract cannot be signed via old link | **MISSING (bug)** |

---

## 17 — Pilotos históricos

Esta fase **não** abriu IndexedDB de produção nem mutou rows.

Última evidência (10.21CO closeout + teste `preservedPilots`):

| | |
| --- | --- |
| CTR00003_PRESERVED | YES last-known (`signed`, hash `h3bb6313c`, PDF regen blocked by `immutable_pilot`) |
| CTR00004_PRESERVED | YES last-known (`generated`, hash `he96548e0`) |
| CTR00005_PRESERVED | YES last-known (`signed`, 2 csigs, PDF `catt-7520a89d-…`) |
| CTR00005_STATUS | `signed` |
| CTR00005_SIGNATURE_COUNT | 2 |
| CTR00005_FINAL_PDF_PRESERVED | YES last-known |

Guarda de imutabilidade de PDF: **somente 00003**. 00005 depende de `already_generated` + disciplina operacional. `createContractNewVersion` **não** está bloqueado para 00005.

---

## 18 — Proposta conceitual (NÃO implementar)

Princípios: append-only; nunca apagar csig; nunca reutilizar csig; nunca sobrescrever PDF assinado; freeze imutável; reissue = nova identidade; link revogado morto; fail-closed; tenant binding; motivo+ator+timestamp.

### A. CANCEL_UNSIGNED

- PRECONDITIONS: status ∈ {draft, generated, sent, viewed}; 0 strokes; tenant match; `contracts` jurídico + confirmação
- RESULTING_STATE: `canceled` (terminal LIVE)
- EVIDENCE_PRESERVED: HTML/draft/audit
- NEW_IDS: nenhum
- AUDIT + REASON: obrigatórios
- Side effect: revogar todos requests/links pending do contrato

### B. ABORT_PARTIAL_CEREMONY

- PRECONDITIONS: 1/2 assinado; não `signed`
- RESULTING_STATE: contrato `canceled` **ou** `ceremony_aborted` (novo); **não** apagar csig profissional
- EVIDENCE_PRESERVED: csig + freeze + HTML
- Revogar request/link paciente **atomicamente** no mesmo `withDb`
- NEW_IDS: nenhum
- AUDIT + REASON: obrigatórios
- Guard: `signContractOnScreen` recusa `canceled`

### C. VOID_SIGNED_CONTRACT

- PRECONDITIONS: `signed`/`completed`; PDF presente
- RESULTING_STATE: `voided` **novo status LIVE** (não `canceled`, não `replaced`)
- EVIDENCE_PRESERVED: 100% da row, csigs, PDF, manifest, hashes
- NEW_IDS: nenhum
- AUDIT + REASON: obrigatórios; senha+frase
- PROIBIDO: editar HTML, regenerar PDF, reutilizar csig
- Financeiro: **nenhum** side effect automático

### D. REISSUE_CONTRACT

- PRECONDITIONS: unsigned cancelado **ou** signed já `voided`
- RESULTING_STATE: **novo** `contractId` + `version`; old `supersededByContractId`; new `supersedesContractId` + `reissueReason`
- EVIDENCE_PRESERVED: old intacto (status jurídico terminal, não overwrite de `signed` direto)
- NEW_IDS: contract, ceremony, requests, links, tokens, future PDF
- NEW_CEREMONY + NEW_SIGNATURES: obrigatório
- Guard: `isImmutablePilotContract` incluir 00003 **e** 00004 **e** 00005

### E. REVOKE_SIGN_LINK

- PRECONDITIONS: link pending; tenant; permissão distinta de e-mail
- RESULTING_STATE: link `revoked` (escrever o status hoje só filtrado); request `cancelled` se último link
- OLD token fail-closed
- AUDIT + REASON

### F. ROTATE_SIGN_LINK

- PRECONDITIONS: request vivo; incidente ou expiry
- RESULTING_STATE: **todos** pending do request → `revoked`/`expired`; 1 novo link+token; same request
- ROTATION_RACE: unique pending-per-request invariant
- AUDIT + REASON + actor + at

### G. RESEND_SAME_LINK

- PRECONDITIONS: link pending **e** não expirado
- RESULTING_STATE: mesmo token; novo `email_sent` audit (messageId)
- NÃO rotacionar

`signContractOnScreen` deve fail-close: `canceled|replaced|refused|expired|voided|rescindido`.

---

## PHASE_10.23A — RESULT

```text
CONTRACT_CANCELLATION_IMPLEMENTED = YES (unsigned/partial; signed blocked)
REISSUE_IMPLEMENTED = PARTIAL (in-place signed→replaced)
REQUEST_REVOCATION_IMPLEMENTED = YES
LINK_REVOCATION_IMPLEMENTED = YES
TOKEN_REVOCATION_IMPLEMENTED = YES (via link.status)
EXPIRATION_IMPLEMENTED = PARTIAL (runtime; persist só na rotação)
LINK_ROTATION_IMPLEMENTED = PARTIAL (expiry resend only)

CAN_ABORT_1_OF_2 = YES (incomplete: does not revoke invite)
CAN_VOID_SIGNED_CONTRACT = NO
CAN_REISSUE_SIGNED_CONTRACT = PARTIAL (unsafe in-place)

SIGNED_CONTRACT_MUTABLE = YES
FINAL_ARTIFACT_IMMUTABLE = PARTIAL
LEGAL_HARD_DELETE_PATHS = NONE

CONTRACT_CANCEL_FINANCIAL_SIDE_EFFECT = NONE
REISSUE_FINANCIAL_SIDE_EFFECT = NONE

CANCEL_UI = YES (clínica segura + admin inseguro)
REISSUE_UI = YES (Nova versão; sem reason)
REVOKE_LINK_UI = PARTIAL (Cancelar solicitação)
ROTATE_LINK_UI = NO
RESEND_EMAIL_UI = YES

AUTHORIZATION_CURRENT_STATE =
  cancel contrato: master/admin/gerente (RBAC cancel) + admin bypass
  nova versão: admin/gerente/recepcao sem can()
  revoke request: profissional da cerimônia, sem bit jurídico

AUDIT_LEDGER_COVERAGE = PARTIAL (append-only; gaps VOID/EXPIRE/REASON no reissue)

CANCELLATION_TESTS = PARTIAL (domínio V2 only)
REISSUE_TESTS = MISSING
REVOCATION_TESTS = PARTIAL
EXPIRATION_TESTS = PASSING_TEST_EXISTS (runtime+rotate)
ROTATION_TESTS = PARTIAL
PRESERVATION_TESTS = MISSING

WHAT_EXISTS = cancel unsigned/partial; revoke request+pending links; expire runtime; resend; rotate-on-expiry; PDF skip already_generated; financial no-op
WHAT_IS_PARTIAL = reissue; expiration persistida; rotation; ceremony abort; artifact immutability (só 00003 no set)
WHAT_IS_MISSING = void signed; fail-closed sign after cancel; rotate-by-incident; reason on reissue; live tests; 00004/00005 immutability guard
WHAT_IS_UNSAFE =
  1. signed → replaced in-place (recepcao pode clicar; 00005 desprotegido)
  2. canceled contract + pending link → sign ressuscita
  3. admin cancel sem senha/motivo
  4. cancel contrato não revoga invite
  5. completed pode passar no writer de cancel

PROPOSED_STATE_MACHINE = A–G acima (paper only)

CTR00003_PRESERVED = YES (last-known; this phase did not touch)
CTR00004_PRESERVED = YES (last-known)
CTR00005_PRESERVED = YES (last-known)

DATABASE_MUTATIONS = ZERO
PRODUCTION_MUTATIONS = ZERO
EMAILS_SENT = ZERO
CONTRACTS_CREATED = ZERO
SIGNATURES_CREATED = ZERO
PDFS_CREATED = ZERO

FINAL_GATE = BLOCKED_LEGAL_EVIDENCE_MUTABILITY
```

Causa do gate: não há hard-delete jurídico executável, mas **há caminho atual que adultera o registro de contrato assinado** (`createContractNewVersion`) e **há caminho que conclui assinatura sobre contrato cancelado**. 10.23B (design paper) só deve seguir após aceite humano desses defeitos como premissas — sem writers nesta fase.

PHASE_10.22 permanece parked.  
Nenhum commit funcional.
