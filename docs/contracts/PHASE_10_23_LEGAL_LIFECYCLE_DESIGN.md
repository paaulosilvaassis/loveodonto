# PHASE 10.23 — Legal lifecycle state machine & immutability contract

**Fase:** 10.23B  
**Modo:** DESIGN / DOCUMENTATION ONLY  
**Data:** 2026-08-28  
**Código funcional:** FORBIDDEN nesta fase  
**10.22:** `PHASE_10_22_SAFELY_PARKED` (não tocada)  
**Pilotos históricos:** CTR-2026-00003, CTR-2026-00004, CTR-2026-00005 — imutáveis; sem backfill; sem rewrite

Este documento é o contrato jurídico-técnico **antes** de qualquer writer novo. Implementação começa na 10.23C (emergency fail-closed), não aqui.

Camada de destino: **LIVE IndexedDB** (`generatedContracts`, `contractSignatures`, `contractSignatureRequests`, `contractSignLinks`, `clinicalPackageManifests`, `contractAttachments`).  
Domínio TypeScript V2 (`contract-status.machine.ts`, envelopes) **não** é a fonte canônica — runtime não está em produção.

---

## 0 — Achados herdados (10.23A)

`FINAL_GATE_10.23A = BLOCKED_LEGAL_EVIDENCE_MUTABILITY`

Não há hard-delete jurídico executável. Side effect financeiro de cancel/reissue atual = **NONE**.

| ID | Defeito LIVE |
| --- | --- |
| DEFECT_1 | `createContractNewVersion` muta contrato `signed` in-place para `replaced` |
| DEFECT_2 | `signContractOnScreen` não fail-closes `canceled`; link pendente ressuscita o contrato |
| DEFECT_3 | Cancel de contrato não revoga atomicamente request/link ativos |
| DEFECT_4 | Path admin de cancel sem motivo obrigatório nem autorização adequada |
| DEFECT_5 | `signed` vs `completed` inconsistentes; writer de cancel só bloqueia `signed` |
| DEFECT_6 | Imutabilidade do PDF final incompleta; guarda hardcoded só em CTR-2026-00003 |

Política operacional já definida: contestação / substituição = **void (ou abort) da versão anterior + reissue de nova identidade**. Nunca editar silenciosamente documento já assinado.

---

## 1 — Terminologia

Termos abaixo são **operações ou efeitos jurídicos**. Não são sinônimos. Status persistido usa a seção 2.

| Termo | Definição canônica |
| --- | --- |
| **CANCEL** | Encerrar um contrato **ainda sem nenhuma assinatura**. O documento deixa de ser utilizável. Evidência de rascunho/geração/freeze (se houver) permanece. Não é void de documento assinado. |
| **ABORT** | Encerrar uma **cerimônia incompleta** (já existe ≥1 stroke obrigatório, cerimônia ≠ signed). Strokes existentes permanecem imutáveis. Signatários pendentes perdem acesso. O contrato deixa de ser assinável. |
| **VOID** | Invalidar o **uso futuro** (jurídico/operacional) de um contrato **já assinado**, preservando 100% da evidência histórica. Void ≠ delete. Void ≠ editar HTML/PDF/csig. |
| **SUPERSEDE** | Marcar um contrato já preservado (voided, ou cancelled após abort) como **substituído por outro `contractId` explícito**. Exige sucessor. Não reescreve conteúdo. |
| **REISSUE** | Criar uma **nova identidade jurídica** (novo `contractId`, nova versão, novo freeze, nova cerimônia, novas assinaturas, novo artefato). Pode copiar conteúdo de negócio como material inicial. **Proibido** copiar evidência legal. |
| **REVOKE** | Invalidar acesso de assinatura: request e/ou link e, por identidade, o token (`link.token`). Irreversível para aquele token. |
| **ROTATE** | Revogar acesso ativo e emitir **novo** link/token para o **mesmo** signatário e o **mesmo** documento/cerimônia. Não cria novo contrato. |
| **RESEND** | Reenviar o **mesmo** link ainda válido. Só entrega. Não cria request/link/token. Não altera documento, cerimônia, evidência nem `expiresAt`. |
| **EXPIRE** | Perda de capacidade de assinar pelo relógio (`expiresAt <= trustedNow`). Independente de persistir `expired`. |

Ortografia persistida LIVE hoje: `canceled`. Canônico deste contrato: **`cancelled`**. Writers novos gravam `cancelled`. Leitura normaliza `canceled` → `cancelled` na fronteira de guard. Não reescrever rows históricas.

`replaced` LIVE = precursor informal de **superseded**. Leitura normaliza `replaced` → `superseded`. Não backfill.

`completed` LIVE = alias de **signed** na fronteira de guard. Não backfill.

---

## 2 — Estados canônicos

Cerimônia **não** vive no mesmo campo que o ciclo de vida jurídico do documento. `signed_by_clinic` / `sent` / `viewed` são progresso de coleta, não estados jurídicos distintos.

### CONTRACT_STATE

Campo: `generatedContracts.status` (após normalização de guard).

| Valor | Significado |
| --- | --- |
| `draft` | Identidade criada; conteúdo ainda editável; 0 strokes. |
| `generated` | Conteúdo finalizado; 0 strokes; pode ter freeze; ainda unsigned. |
| `partially_signed` | ≥1 stroke obrigatório persistido; cerimônia incompleta. |
| `signed` | Todos os signatários obrigatórios; artefato final pode existir. |
| `cancelled` | Encerrado sem conclusão da cerimônia (CANCEL_UNSIGNED ou ABORT). Terminal. |
| `voided` | Assinado e invalidado para uso futuro. Evidência intacta. Terminal de uso; pode receber SUPERSEDE append-only. |
| `superseded` | Preservado e ligado a um sucessor explícito. Terminal. |

**Não** são estados canônicos de contrato: `sent`, `viewed`, `signed_by_clinic`, `signed_by_patient`, `ready_to_send`, `awaiting_data`, `vigente`, `rescindido`, `expired` (contrato), `refused`.  
Mapeamento somente na fronteira de leitura (seção 18). Convite/visualização pertencem a REQUEST/LINK e CEREMONY.

### CEREMONY_STATE

Campo: `metadata.signatureCeremony.status` (já existe no LIVE).

| Valor | Significado |
| --- | --- |
| `not_started` | Sem freeze completo e/ou sem slots resolvidos. |
| `blocked` | Pré-requisito clínico/identidade impede coleta. |
| `ready_to_sign` | 0 strokes; slots conhecidos; documento assinável. |
| `awaiting_remote` | 0 strokes no paciente; convite/link ativo (opcional; derivável). |
| `partially_signed` | ≥1 slot obrigatório signed; falta ≥1. |
| `signed` | Todos obrigatórios signed. |
| `aborted` | Cerimônia encerrada incompleta. Strokes existentes imutáveis. |
| `legacy_signed` | Somente leitura histórica (piloto/legado sem ceremony version). Não transicionar para este estado. |

### REQUEST_STATE

Campo: `contractSignatureRequests.status`.

| Valor | Significado |
| --- | --- |
| `pending` | Criado; ainda não enviado ou reutilizável internamente. |
| `sent` | Convite aceite pelo transporte pelo menos uma vez. |
| `completed` | Stroke remoto deste request concluído. Terminal de sucesso. |
| `revoked` | Acesso invalidado (REVOKE / CANCEL / ABORT / ROTATE do acesso antigo). Terminal. |
| `expired` | Relógio + persistência (seção 13). Terminal. |

Alias LIVE: `cancelled` → `revoked` na fronteira de guard. Writers novos gravam `revoked`.

### LINK_STATE

Campo: `contractSignLinks.status`. Token = `link.token` (não há entidade token).

| Valor | Significado |
| --- | --- |
| `pending` | Candidato a assinatura **somente se** também `expiresAt > trustedNow` e request signable. |
| `signed` | Token consumido com sucesso. Replay = fail-closed. |
| `revoked` | Invalidado por operação jurídica/operacional. |
| `expired` | Persistido após detecção de relógio ou como efeito de rotação do link antigo. |

Alias LIVE: `cancelled` / `consumed` → `revoked` / `signed` na fronteira. Writers novos não gravam `consumed` nem `cancelled`.

### MANIFEST / ARTIFACT (não são CONTRACT_STATE)

- Manifest clínico: `FROZEN` após freeze. Sem `CANCELLED` de manifesto: freeze permanece como evidência mesmo após CANCEL/ABORT/VOID.
- Final artifact: `generated` \| `failed` \| ausente (histórico). `generated` é imutável (seção 17).

---

## 3 — Terminais e imutabilidade

**Terminais jurídicos de contrato:** `cancelled`, `signed`, `voided`, `superseded`.

`signed` é terminal para **conteúdo e evidência**, mas pode receber **apenas** append-only de VOID (→ `voided`) ou, se já voided, SUPERSEDE. Nunca recebe novo stroke, novo freeze, novo PDF in-place.

| Estado | CONTENT | VERSION | MANIFEST | SIGNATURE | FINAL_ARTIFACT | REQUEST_CREATE | LINK_CREATE | NEW_STROKE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `draft` | mutável | n/a | n/a | — | — | no | no | no |
| `generated` | imutável após freeze; editável só se ainda não frozen (regra atual de finalize) | lock após freeze | freeze once | — | — | yes se freeze | yes se freeze | yes se signable |
| `partially_signed` | imutável | imutável | imutável | append-only novos slots | — | no* | rotate/resend só | só slots pendentes |
| `signed` | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** |
| `cancelled` | **NO** | **NO** | **NO** | **NO** | n/a | **NO** | **NO** | **NO** |
| `voided` | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** |
| `superseded` | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** |

\* Request novo no parcial: **não**. Acesso pendente usa ROTATE ou RESEND no request existente.

Regra central: objeto histórico terminal pode receber **eventos/metadata append-only** (voidedAt, supersededByContractId, audit). **Não** pode ter conteúdo, csig, manifesto ou PDF reescritos.

Pilotos 00003/00004/00005: mesmo `signed`/`generated` estão **operacionalmente congelados** — nenhuma transição VOID/REISSUE/CANCEL/ABORT. Código: `PILOT_IMMUTABLE`.

---

## 4 — Matriz de transições

Nenhuma transição implícita. Writers citados são **alvo de implementação** (10.23C+), não código atual.

`REASON_REQUIRED`: S = sim; — = não.  
Autorização: ver seção 14.

### 4.1 Contrato / cerimônia

| FROM | ACTION | TO | PRECONDITIONS | WRITER | REASON | AUTH | AUDIT | SIDE_EFFECTS | FAILURE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `draft` | FINALIZE | `generated` | paciente/profissional/pré-reqs atuais; não piloto mutável | `finalizeClinicalContractDraft` (existente) | — | generate | `CONTRACT_GENERATED` (existente FINALIZE) | freeze posterior separado | `NOT_READY` |
| `generated` | FIRST_STROKE | `partially_signed` | invariant §5; 0 strokes antes | `signContractOnScreen` | — | signer slot | `SIGNED` stroke | ceremony → partially_signed | `CONTRACT_NOT_SIGNABLE` / integrity |
| `partially_signed` | COMPLETING_STROKE | `signed` | invariant §5; último slot | `signContractOnScreen` | — | signer slot | `SIGNED` + artifact async | PDF **novo** se ainda não generated | `CONTRACT_NOT_SIGNABLE` |
| `draft` | CANCEL_UNSIGNED | `cancelled` | 0 strokes; não piloto | `cancelUnsignedContract` | S | SENSITIVE | `CONTRACT_CANCELLED` | revoke requests/links se existirem | `CANCEL_NOT_ALLOWED` |
| `generated` | CANCEL_UNSIGNED | `cancelled` | 0 strokes; não piloto | `cancelUnsignedContract` | S | SENSITIVE | `CONTRACT_CANCELLED` | **revoke atômico** pending access | `CANCEL_NOT_ALLOWED` |
| `partially_signed` | ABORT_PARTIAL_CEREMONY | `cancelled` + ceremony `aborted` | ≥1 stroke; não signed; não piloto | `abortPartialCeremony` | S | LEGAL_HIGH | `CEREMONY_ABORTED` | **revoke atômico**; csigs intactos | `ABORT_NOT_ALLOWED` |
| `signed` | VOID_SIGNED | `voided` | 2/2; não piloto; não já voided/superseded | `voidSignedContract` | S | LEGAL_HIGH | `CONTRACT_VOIDED` | financeiro NONE | `VOID_NOT_ALLOWED` |
| `voided` | SUPERSEDE | `superseded` | `newContractId` existe; tenant match; sucessor derivado | `supersedeContract` (interno ao REISSUE) | S (herda reissue) | LEGAL_HIGH | `CONTRACT_SUPERSEDED` | liga IDs | `SUPERSEDE_REFERENCE_REQUIRED` |
| `cancelled` | SUPERSEDE | `superseded` | sucessor de reissue após abort/cancel | idem | S | LEGAL_HIGH | `CONTRACT_SUPERSEDED` | liga IDs | `SUPERSEDE_REFERENCE_REQUIRED` |
| `signed` | SUPERSEDE direto | — | **PROIBIDO** | — | — | — | — | — | `VOID_REQUIRED_BEFORE_SUPERSEDE` |
| `signed` | REISSUE in-place | — | **PROIBIDO** (DEFECT_1) | — | — | — | — | — | `SIGNED_IN_PLACE_MUTATION_FORBIDDEN` |
| `*` | REISSUE_CONTRACT | **novo** `draft`/`generated` | fonte cancelled/voided (ou signed via VOID atômico); não piloto fonte | `reissueContract` | S | LEGAL_HIGH | `CONTRACT_REISSUED` + SUPERSEDE na fonte | novo ID; financeiro NONE | `REISSUE_NOT_ALLOWED` |

`signed` → `replaced` atual **sai de circulação** (UI desligada na 10.23C; writer removido/guardado na 10.23D).

### 4.2 Request

| FROM | ACTION | TO | PRECONDITIONS | WRITER | REASON | AUTH | AUDIT | SIDE_EFFECTS | FAILURE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| — | CREATE | `pending` | contrato signable; freeze; 0 request ativo signable do slot | `createSignatureRequest` | — | OPERATIONAL | `request_created` | cria link pending | `CONTRACT_NOT_SIGNABLE` |
| `pending` | SEND | `sent` | transporte | `sendSignatureEmail` | — | OPERATIONAL | `email_sent` | delivery only | delivery errors |
| `pending`/`sent` | COMPLETE | `completed` | stroke remoto OK; link deste request | `signContractViaLink` | — | token+binding | `signed_via_link` | link → signed | `SIGNATURE_REQUEST_NOT_SIGNABLE` |
| `pending`/`sent` | REVOKE | `revoked` | não completed | `revokeSigningAccess` | S | SENSITIVE | `SIGN_REQUEST_REVOKED` | todos links pending → revoked | `REQUEST_NOT_REVOCABLE` |
| `pending`/`sent` | EXPIRE_PERSIST | `expired` | `expiresAt <= trustedNow` | lazy no writer de resolve/sign/rotate | — | system | `SIGN_LINK_EXPIRED` | links pending → expired | — |

### 4.3 Link

| FROM | ACTION | TO | PRECONDITIONS | WRITER | REASON | AUTH | AUDIT | SIDE_EFFECTS | FAILURE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pending` | SIGN | `signed` | invariant §5 + `expiresAt > now` | `signContractViaLink` | — | token | `signed_via_link` | request completed | `SIGN_LINK_NOT_SIGNABLE` |
| `pending` | REVOKE | `revoked` | — | `revokeSigningAccess` / abort / cancel | S | SENSITIVE | `SIGN_LINK_REVOKED` | token morto | `SIGN_LINK_NOT_REVOCABLE` |
| `pending` | EXPIRE | `expired` | relógio | lazy persist | — | system | `SIGN_LINK_EXPIRED` | token morto | — |
| `pending` | ROTATE | old `revoked` ou `expired`; new `pending` | ≤1 pending signable | `rotateSignLink` | S | SENSITIVE | `SIGN_LINK_ROTATED` | novo token; same request | `ROTATION_RACE` / `NOT_SIGNABLE` |

---

## 5 — Invariante global de assinatura (fail-closed)

**Um** guard, chamado por **todo** writer de stroke (`signContractOnScreen`, `signContractViaLink`, upload externo se permanecer).

Assinatura só é aceita se **todos** forem verdade:

1. contrato existe  
2. `tenant_id` do ator/link casa com o contrato  
3. contrato está em `SIGNABLE_CONTRACT_STATES`  
4. cerimônia está em estado assinável (não `aborted`, `signed`, `legacy_signed` para novo stroke)  
5. manifesto FROZEN (fluxo clínico)  
6. `contract.version` persistida casa com o freeze  
7. content hash casa com freeze  
8. signer é o slot esperado  
9. esse signer ainda não assinou  
10. se remoto: `signatureRequestId` + `signLinkId` binding exato (10.21CO)  
11. se remoto: request ∈ {`pending`, `sent`} e não expirado  
12. se remoto: link `pending` e `expiresAt > trustedNow`  
13. se remoto: token resolve para esse link (identidade)

```text
SIGNABLE_CONTRACT_STATES = { generated, partially_signed }
```

Qualquer outro estado, inclusive aliases normalizados:

| Estado efetivo | Stroke |
| --- | --- |
| `draft` | BLOCK (`CONTRACT_NOT_SIGNABLE`) |
| `cancelled` | BLOCK |
| `voided` | BLOCK |
| `superseded` | BLOCK (`replaced` incluso) |
| `signed` / `completed` / `vigente` | BLOCK (stroke adicional) |
| ceremony `aborted` | BLOCK (`CEREMONY_NOT_SIGNABLE`) |

Isto **elimina ressurreição** (DEFECT_2).

Erros estáveis (além dos de integridade já existentes: `FROZEN_*`, `REMOTE_SIGNATURE_BINDING_*`):

| Código | Quando |
| --- | --- |
| `CONTRACT_NOT_SIGNABLE` | estado jurídico fora de `SIGNABLE_CONTRACT_STATES` |
| `CEREMONY_NOT_SIGNABLE` | aborted / já signed / blocked |
| `SIGNATURE_REQUEST_NOT_SIGNABLE` | request ausente, revoked, expired, completed, outro contrato |
| `SIGN_LINK_NOT_SIGNABLE` | link não pending, expirado, revoked, token mismatch |
| `PILOT_IMMUTABLE` | CTR 00003/00004/00005 |
| `SIGNED_IN_PLACE_MUTATION_FORBIDDEN` | tentativa de mutar row signed (reissue in-place) |

Fonte de verdade de expiry: **`expiresAt <= trustedNow` bloqueia mesmo se status persistido ainda for `pending`.**

---

## 6 — A. CANCEL_UNSIGNED

```text
PRECONDITIONS =
  contract.status ∈ { draft, generated } após normalização
  zero rows em contractSignatures para contractId
  ceremony não partially_signed / signed / aborted
  não piloto
  tenant match

RESULTING_STATE =
  CONTRACT_STATE = cancelled
  CEREMONY_STATE = não inicia ou permanece not_started
  requests pending/sent → revoked
  links pending → revoked

REASON_REQUIRED = YES
ACTOR_REQUIRED = YES (userId)
TIMESTAMP_REQUIRED = YES (cancelledAt)
PREVIOUS_STATE_REQUIRED = YES (previousStatus)

REQUEST_REVOCATION = YES (atômico no mesmo withDb)
LINK_REVOCATION = YES (atômico)
MANIFEST_HANDLING = preservar se frozen; não “unfreeze”; não delete
DOCUMENT_HANDLING = preservar HTML/versão; content imutável após cancel
FINANCIAL_SIDE_EFFECT = NONE
AUDIT_EVENT = CONTRACT_CANCELLED

DELETE = FORBIDDEN
```

Se já existir 1 stroke → recusar com `ABORT_REQUIRED` (usar B, não A).

---

## 7 — B. ABORT_PARTIAL_CEREMONY

Cenário: PROFESSIONAL signed, PATIENT pending.

```text
PRECONDITIONS =
  CONTRACT_STATE = partially_signed
    (LIVE hoje: signed_by_clinic / signed_by_patient)
  ≥1 csig obrigatório
  cerimônia ≠ signed
  não piloto

RESULTING_STATE =
  CONTRACT_STATE = cancelled
  CEREMONY_STATE = aborted
  csigs existentes = imutáveis (mesmo id, evidenceJson, stroke)
  freeze / HTML / version = imutáveis
  requests pending/sent → revoked
  links pending → revoked
  tokens antigos = unusable

REASON_REQUIRED = YES
ACTOR_REQUIRED = YES
TIMESTAMP_REQUIRED = YES (abortedAt; cancelledAt igual)
PREVIOUS_STATE_REQUIRED = YES

FINANCIAL_SIDE_EFFECT = NONE
AUDIT_EVENT = CEREMONY_ABORTED
  (pode emitir também CONTRACT_CANCELLED no mesmo withDb,
   causationId compartilhado — um fato jurídico, dois registros tipados)

DELETE_SIGNATURE = FORBIDDEN
NEW_STROKE_AFTER = FORBIDDEN (§5)
```

Contrato **não** ganha estado `aborted`. Abort é da cerimônia; o documento unsigned-incompleto encerra como `cancelled`.

---

## 8 — C. VOID_SIGNED_CONTRACT

2/2 + PDF (ou tentativa de PDF). VOID ≠ delete.

Preservar obrigatoriamente:

- row do contrato (`contractId` original)  
- `contract.version`  
- manifesto + hash + content SHA-256  
- todos os csigs + `evidenceJson` / `evidenceHash`  
- PDF final + `artifactBinarySha256` se existir  
- `patientFile` / attachment  
- audit anterior  
- referências financeiras (somente leitura)

Append-only na row (não substituir campos de evidência):

```text
status            = voided
voidReason        = VOID_REASON
voidedAt          = TIMESTAMP
voidedBy          = ACTOR
previousStatus    = signed (ou completed normalizado)
```

`signed → voided` é **direto**. Não passar por `cancelled`.

```text
NO signature reuse
NO PDF overwrite / regenerate / delete
NO HTML edit
FINANCIAL_SIDE_EFFECT = NONE
AUDIT_EVENT = CONTRACT_VOIDED
PILOT = BLOCK PILOT_IMMUTABLE
```

Uso operacional futuro do documento voided (vínculo de atendimento, “contrato vigente”) = **não**. Leitura forense = **sim**.

---

## 9 — D. REISSUE_CONTRACT

REISSUE **nunca** muta o contrato assinado in-place.

### Identidade e linhagem (mínimo LIVE)

| Campo | Onde | Papel |
| --- | --- | --- |
| `id` | cada row | identidade jurídica |
| `parentContractId` | novo | `previousContractId` (já existe no LIVE) |
| `replacedById` | antigo | alias de `supersededByContractId` (já existe) |
| `version` | novo | `oldVersion + 1` (já existe) |
| `rootContractId` | novo, opcional | se ausente, derivar: walk `parentContractId` ou `id` da primeira geração |

Não introduzir colunas novas nesta onda se `parentContractId` + `replacedById` + `version` bastarem. Documentar semanticamente:

```text
contractId              = identidade jurídica desta versão
previousContractId      = parentContractId
supersededByContractId  = replacedById no ancestral
```

### VOID + REISSUE vs SUPERSEDE + REISSUE

| Fonte | Sequência atômica (um withDb) |
| --- | --- |
| `signed` | VOID_SIGNED → criar novo ID → SUPERSEDE (`voided` → `superseded` + `replacedById`) |
| `voided` (já void, sem sucessor) | criar novo ID → SUPERSEDE |
| `cancelled` (após cancel/abort) | criar novo ID → SUPERSEDE |
| `partially_signed` / `generated` | **não** REISSUE; CANCEL/ABORT primeiro se for o caso, ou editar unsigned segundo regras atuais |

Não permitir REISSUE a partir de `signed` sem evento VOID no mesmo commit lógico.

### Novo documento deve ter

- novo `contractId`  
- nova `version`  
- novo freeze / novo `packageManifestId` + hash  
- nova cerimônia  
- novas assinaturas (cerimônia zerada)  
- novo artefato final **depois** da nova cerimônia  

Pode copiar HTML/negócio como **material inicial** do draft (tratamento, valores snapshot) — isso **não** é evidência.

### Proibido copiar para a nova identidade

- ids de csig  
- stroke / `signatureImageUrl` como assinatura da nova cerimônia  
- `evidenceHash` / `evidenceJson`  
- request / link / token  
- `finalArtifactAttachmentId` / `pdfUrl` como artefato da nova row  
- `packageManifestId` / hash do ancestral  

```text
REISSUE_CREATES_NEW_CONTRACT_ID = YES
REISSUE_CREATES_NEW_MANIFEST = YES
REISSUE_REQUIRES_NEW_SIGNATURES = YES
OLD_CONTRACT_PRESERVED = YES
OLD_SIGNATURES_PRESERVED = YES (no id antigo)
OLD_FINAL_ARTIFACT_PRESERVED = YES
SIGNED_IN_PLACE_MUTATION_ALLOWED = NO
```

`createContractNewVersion` atual **viola** este contrato e deve ser desativado (10.23C) e substituído (10.23F).

---

## 10 — E. REVOKE_SIGNING_ACCESS

Operação lógica atômica sobre o slot remoto.

```text
INPUT = requestId (preferencial) ou linkId
REASON_REQUIRED = YES
ACTOR_REQUIRED = YES
TIMESTAMP_REQUIRED = YES

EFFECT (mesmo withDb) =
  request pending|sent → revoked (revokedAt, revokeReason, revokedBy, previousStatus)
  todos links do request com status pending → revoked
  token = unusable (guard §5)

AUDIT = SIGN_REQUEST_REVOKED + SIGN_LINK_REVOKED por link
  (ou um evento com relatedLinkIds[] — preferir um evento request
   + metadata linkIds para não explodir ledger)

PUBLIC_PAGE = mensagem neutra inválido/revogado
WRITER = fail-closed independente da UI
```

Não reativa token revogado. Rotação cria **outro** link.

---

## 11 — F. ROTATE_SIGN_LINK

Rotação segura para incidente (token vazado) ou expiry.

```text
SEQUENCE =
  1. autorizar ROTATE (SENSITIVE + reason)
  2. localizar request do slot PATIENT deste contractId
  3. REVOKE todos links pending desse request (não só o primeiro find)
  4. criar novo link + token, status pending, mesmo requestId
  5. bind signerPersonId + tenant + contractId + documentHash/version já frozen
  6. audit SIGN_LINK_ROTATED { oldLinkId, newLinkId, requestId }
  7. e-mail = passo separado (RESEND do novo URL ou send explícito)
```

**Decisão: SAME_REQUEST.**

Justificativa no modelo LIVE: um request = um convite de um slot (paciente) para um documento frozen. Rotação troca a **credencial**, não o ato jurídico de solicitar assinatura. `NEW_REQUEST` duplicaria `csreq-*`, quebraria binding 10.21CO (`signatureRequestId` na evidência) e enfraqueceria “um request ativo por slot”.

```text
INVARIANT = no máximo UM link signable (pending ∧ not expired)
            por (requestId) e, equivalente, por (contractId, PATIENT slot)

RACE =
  unique constraint lógico no withDb:
  contar pending signable após revoke deve ser 0 antes do insert
  se count > 0 → ROTATION_RACE e abortar o insert
```

Link antigo: `revoked` (incidente) ou `expired` (rotação por relógio). Ambos unsable.

---

## 12 — G. RESEND_SAME_LINK

```text
WHEN_ALLOWED =
  contrato em SIGNABLE_CONTRACT_STATES
  request pending|sent
  exatamente um link signable
  expiresAt > trustedNow
  não piloto bloqueado para convite se política assim exigir

MUST_NOT =
  criar request / link / token
  alterar HTML, version, freeze, ceremony, csig
  alterar expiresAt silenciosamente

AUDIT_EVENT = SIGN_INVITE_RESENT
DELIVERY_ATTEMPT_ID = messageId do transporte (já usado na idempotência email_sent)

Duplicate provider delivery = notificação, não duplicação jurídica.
```

Se o link estiver expirado → recusar RESEND com `SIGN_LINK_NOT_SIGNABLE`; o operador usa ROTATE.

---

## 13 — Expiração

```text
SOURCE_OF_TRUTH = expiresAt <= trustedNow
```

Sempre bloqueia view de assinatura e stroke, **mesmo se** `status === pending`.

Persistência de `expired` é **lazy**, no primeiro writer que observar o relógio (`getContractBySignToken`, sign, rotate, createSignatureRequest). Sem cron obrigatório.

Não promover o **contrato** para `expired`. Expiry é de request/link.

---

## 14 — Matriz de autorização

Não preservar permissões inseguras atuais (recepção reissue; admin cancel sem motivo; profissional sem bit mas com revoke frouxo).

Senha **não** substitui autorização. Pode existir confirmação explícita (frase) **além** do RBAC, não no lugar dele.

| Ação | Classe | master | admin | gerente | recepcao | RT | professional | Reason | Confirmação |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RESEND_LINK | OPERATIONAL | yes | yes | yes | yes | no* | yes (cerimônia) | no | no |
| REVOKE_LINK | SENSITIVE | yes | yes | yes | no | no | yes (slot paciente da cerimônia) | yes | yes (dialog) |
| ROTATE_LINK | SENSITIVE | yes | yes | yes | no | no | yes (cerimônia) | yes | yes |
| CANCEL_UNSIGNED | SENSITIVE | yes | yes | yes | no | no | no | yes | yes |
| ABORT_PARTIAL | LEGAL_HIGH_IMPACT | yes | yes | yes | no | no | no | yes | yes |
| VOID_SIGNED | LEGAL_HIGH_IMPACT | yes | yes | **no** | no | no | no | yes | yes (frase) |
| REISSUE | LEGAL_HIGH_IMPACT | yes | yes | **no** | no | no | no | yes | yes (frase) |

\* RT não tem papel jurídico próprio neste módulo; assina como PROFESSIONAL/CLINIC_REPRESENTATIVE quando for o slot.

Bits alvo (nomes): `admin_contratos:cancel`, novos `admin_contratos:void`, `admin_contratos:reissue`, `admin_contratos:revoke_sign_access`. Não usar `prontuario_contratos:delete`.

Path admin atual que chama `cancelGeneratedContract` sem payload legal: **remover ou redirecionar** ao writer canônico (10.23C/H).

---

## 15 — Eventos de audit (append-only)

Ledger LIVE atual (`contractEvents`, `contractAuditLogs`, `contractCancelAudit`, `contractSignatureAudits`) permanece. Novos tipos abaixo; sem secrets/tokens em payload (pode haver `linkId` / `requestId`).

Payload mínimo comum: `tenantId`, `contractId`, `actorId`, `timestamp`, `previousState`, `newState`, `reason` quando a operação exigir.

| EVENT_TYPE | Reason | Relacionados |
| --- | --- | --- |
| `CONTRACT_CANCELLED` | yes | requestIds/linkIds revogados |
| `CEREMONY_ABORTED` | yes | signatureIds **referenciados, não copiados** |
| `CONTRACT_VOIDED` | yes | attachmentId do PDF (id only) |
| `CONTRACT_REISSUED` | yes | `newContractId`, `previousContractId` |
| `CONTRACT_SUPERSEDED` | yes | `supersededByContractId` |
| `SIGN_REQUEST_REVOKED` | yes | `requestId`, `linkIds` |
| `SIGN_LINK_REVOKED` | yes | `linkId`, `requestId` |
| `SIGN_LINK_ROTATED` | yes | `oldLinkId`, `newLinkId`, `requestId` |
| `SIGN_LINK_EXPIRED` | no | `linkId`, `requestId` |
| `SIGN_INVITE_RESENT` | no | `requestId`, `linkId`, `deliveryAttemptId` |

Proibido: raw token, senha, SMTP key, PDF bytes, stroke base64.

---

## 16 — Isolamento financeiro

```text
CONTRACT_CANCEL_FINANCIAL_SIDE_EFFECT = NONE
VOID_FINANCIAL_SIDE_EFFECT = NONE
REISSUE_FINANCIAL_SIDE_EFFECT = NONE
ABORT_FINANCIAL_SIDE_EFFECT = NONE
```

O select atual `cancel_future` / `refund` **não** executa financeiro e **não** deve passar a executar neste lifecycle. Qualquer efeito em orçamento, receivable, pagamento ou financiamento é **workflow explícito separado**, fora destes writers.

Campo `cancelFinancialAction` se permanecer = anotação operacional no audit, não gatilho.

---

## 17 — Imutabilidade do artefato final

Quando `metadata.finalArtifactStatus === generated` **ou** existir attachment `source=final_signed_artifact` / `pdfUrl` de cerimônia concluída:

```text
NO overwrite
NO delete
NO regeneration in-place
NO binary replacement
NO hash replacement
```

Reissue → artefato **novo** no **novo** `contractId`.  
Voided/superseded → artefato antigo permanece no id antigo.

Histórico sem `artifactBinarySha256` (CTR-00005): **legível**, sem backfill.

Guarda de implementação: qualquer contrato `signed`/`completed`/`voided`/`superseded` com PDF existente, **não** lista hardcoded de IDs. Pilotos: extra `PILOT_IMMUTABLE` contra VOID/REISSUE/CANCEL além do PDF.

`isImmutablePilotContract` atual cobre só 00003 — insuficiente (DEFECT_6). 10.23C amplia: (a) skip regen se already_generated para **qualquer** signed; (b) freeze operacional dos três pilotos contra writers de lifecycle.

---

## 18 — Compatibilidade / sem backfill

```text
HISTORICAL_BACKFILL_REQUIRED = NO
```

CTR-00003 / 00004 / 00005: somente leitura. Sem conversão forçada. Sem regenerar PDF. Sem preencher SHA-256. Sem `voidedAt`. Sem `signatureRequestId` em evidence antiga.

Normalização **somente em memória** na fronteira de guard/UI:

| Persistido | Efetivo |
| --- | --- |
| `canceled` | `cancelled` |
| `replaced` | `superseded` |
| `completed`, `vigente` | `signed` (imutabilidade + anti-stroke) |
| `signed_by_clinic`, `signed_by_patient` | `partially_signed` |
| `sent`, `viewed` | `generated` + ceremony awaiting_remote/viewed |
| request `cancelled` | `revoked` |
| link `cancelled` | `revoked` |
| link `consumed` | `signed` |

Não gravar a normalização de volta na row histórica.

---

## 19 — Ondas de implementação

| Onda | Objetivo | Mutação de evidência histórica |
| --- | --- | --- |
| **10.23C** | Emergency fail-closed: parar ressurreição; bloquear Nova versão / in-place replace; guard de signability; PDF imutável para todo signed; gate UI perigosa; revoke atômico no cancel/abort **mínimo** se o patch de cancel já existir | nenhuma em 00003/04/05 |
| **10.23D** | Estados canônicos + normalização de guard + códigos de erro; ceremony `aborted`; aliases | nenhuma rewrite |
| **10.23E** | Writers CANCEL_UNSIGNED, ABORT_PARTIAL, REVOKE_SIGNING_ACCESS | só contratos não-piloto |
| **10.23F** | VOID_SIGNED + REISSUE (novo ID) + SUPERSEDE; remover/encerrar `createContractNewVersion` | só não-piloto; nunca in-place signed |
| **10.23G** | ROTATE (todos pending), RESEND puro, expiry persistida lazy | — |
| **10.23H** | UI/RBAC: esconder Nova versão insegura; modal único de cancel; void/reissue só admin/master | — |
| **10.23I** | Testes de regressão + validação controlada (não tocar pilotos; não 10.22) | ZERO em produção piloto |

Princípio: **reduzir risco em produção antes** de construir o lifecycle completo. 10.23C não entrega void/reissue jurídico completo.

---

## 20 — Mitigação imediata (decisão)

```text
EMERGENCY_PATCH_REQUIRED = YES
```

Os defeitos 1, 2, 3, 5 e 6 são **alcançáveis** hoje na UI/writers LIVE (Nova versão em Assinados; sign após cancel; admin cancel; completed vs signed; regen potencialmente fora de 00003).

### Escopo mínimo 10.23C (ainda não implementar aqui)

**A.** Desabilitar/esconder **Nova versão** para contratos `signed`/`completed` (e de preferência o botão inteiro até 10.23F). Guard no writer: `SIGNED_IN_PLACE_MUTATION_FORBIDDEN`. Incluir 00005.

**B.** Guard central de signability (§5) em `signContractOnScreen` / `signContractViaLink` / token resolve. Bloquear `cancelled/canceled`, `replaced`, `voided`, `signed/completed`, ceremony `aborted`.

**C.** `cancelGeneratedContract` / `cancelContractSecure`: no mesmo `withDb`, revogar requests `pending|sent` e links `pending` daquele `contractId`. Sem isso o guard B já impede ressurreição; C evita convite zumbi.

**D.** `maybeGenerateFinalSignedArtifact`: tratar **qualquer** contrato já `signed`/`completed` com PDF/`finalArtifactStatus=generated` como imutável — não só `IMMUTABLE_PILOT` de 00003. Estender `PILOT_IMMUTABLE` a 00003+00004+00005 contra cancel/reissue/void/regen.

**E.** Authorization gate: remover cancel admin one-click sem reason **ou** forçar o mesmo writer seguro. Remover capacidade de recepção chamar reissue (esconder ação).

Fora de 10.23C: VOID/REISSUE completos, novos statuses persistidos `voided`, UI jurídica completa.

---

## Diagramas

### Contrato (canônico)

```
draft → generated → partially_signed → signed → voided → superseded
  │         │              │
  └─────────┴──────────────┴──→ cancelled (CANCEL_UNSIGNED ou ABORT)
cancelled → superseded (após REISSUE)

PROIBIDO: signed → replaced/superseded in-place
PROIBIDO: cancelled → signed (ressurreição)
```

### Acesso remoto

```
request: pending → sent → completed
                   ↘ revoked
                   ↘ expired

link:    pending → signed
                   ↘ revoked  (revoke / abort / cancel / rotate-old)
                   ↘ expired
rotate:  pending* → revoked/expired  +  new pending (same request)
resend:  pending (inalterado) + delivery attempt
```

---

## PHASE_10.23B — RESULT (stamp)

```text
CANONICAL_CONTRACT_STATES =
  draft | generated | partially_signed | signed | cancelled | voided | superseded

CANONICAL_CEREMONY_STATES =
  not_started | blocked | ready_to_sign | awaiting_remote |
  partially_signed | signed | aborted | legacy_signed

CANONICAL_REQUEST_STATES =
  pending | sent | completed | revoked | expired

CANONICAL_LINK_STATES =
  pending | signed | revoked | expired

TERMINAL_CONTRACT_STATES = cancelled | signed | voided | superseded
SIGNABLE_CONTRACT_STATES = generated | partially_signed

CANCEL_UNSIGNED_DESIGN = YES (§6)
ABORT_PARTIAL_DESIGN = YES (§7)
VOID_SIGNED_DESIGN = YES (§8)
REISSUE_DESIGN = YES (§9 novo contractId)
REVOKE_LINK_DESIGN = YES (§10)
ROTATE_LINK_DESIGN = YES (§11 SAME_REQUEST)
RESEND_LINK_DESIGN = YES (§12)
EXPIRATION_DESIGN = YES (§13 relógio + persist lazy)

REISSUE_CREATES_NEW_CONTRACT_ID = YES
REISSUE_CREATES_NEW_MANIFEST = YES
REISSUE_REQUIRES_NEW_SIGNATURES = YES
OLD_CONTRACT_PRESERVED = YES
OLD_SIGNATURES_PRESERVED = YES
OLD_FINAL_ARTIFACT_PRESERVED = YES

SIGNED_IN_PLACE_MUTATION_ALLOWED = NO
CANCELLED_SIGNATURE_ALLOWED = NO
VOIDED_SIGNATURE_ALLOWED = NO
SUPERSEDED_SIGNATURE_ALLOWED = NO

REMOTE_ACCESS_REVOKED_ON_ABORT = YES
REMOTE_ACCESS_REVOKED_ON_CANCEL = YES

FINAL_ARTIFACT_IMMUTABILITY = once generated, no overwrite/delete/regen in-place

AUTHORIZATION_DESIGN = §14 (VOID/REISSUE = admin+master only)
AUDIT_EVENT_DESIGN = §15
FINANCIAL_ISOLATION = NONE on legal ops

HISTORICAL_BACKFILL_REQUIRED = NO

EMERGENCY_PATCH_REQUIRED = YES
EMERGENCY_PATCH_SCOPE = 10.23C A–E (§20)

IMPLEMENTATION_WAVES = C emergency → D states → E cancel/abort/revoke →
  F void+reissue → G rotate/resend/expire → H UI → I tests

FINAL_GATE = READY_FOR_PHASE_10_23C_EMERGENCY_FAIL_CLOSED_PATCH
```

Não implementar 10.23C neste documento.

---

## 10.23D — autoridade canônica (implementada)

Código: `src/contracts/lifecycle/` (única fonte). O adapter `contractLifecycleGuard.js` **delega** — não há segundo grafo.

| Superfície | Persistido vs derivado |
| --- | --- |
| CONTRACT_STATE | persistido em `generatedContracts.status`; normalização só na leitura |
| CEREMONY_STATE | **HYBRID**. Persistido: `metadata.signatureCeremony.status`. Derivados: `not_started`, `awaiting_remote`, `aborted` |
| REQUEST / LINK | persistidos; `cancelled`/`consumed` são aliases de leitura |

`TRANSITION_DEFINED` ≠ `WRITER_IMPLEMENTED`. VOID_SIGNED / SUPERSEDE / REISSUE estão no grafo e **não** têm writer. REISSUE exige `oldContractId !== newContractId`.

Cancel LIVE continua gravando `canceled`. Ação canônica no audit: `CANCEL_UNSIGNED` ou `ABORT_PARTIAL`.

---

## 10.23E — writers CANCEL / ABORT / REVOKE (implementados)

Boundary único: `src/services/contractLifecycleCommandService.js`

| Comando | Ação | Estados de origem | Reason | Actor | Authz |
| --- | --- | --- | --- | --- | --- |
| `cancelUnsignedContract` | CANCEL_UNSIGNED | `draft`, `generated` | obrigatório | `user.id` autenticado | SENSITIVE: admin / master / `admin_contratos:cancel` |
| `abortPartialCeremony` | ABORT_PARTIAL | somente `partially_signed` + cerimônia incompleta + ≥1 csig | obrigatório | idem | LEGAL_HIGH_IMPACT: mesma RBAC efetiva |
| `revokeSigningAccess` | REVOKE_SIGNING_ACCESS | qualquer estado jurídico (não cancela o contrato) | obrigatório na ação explícita | idem | SENSITIVE: mesma RBAC |

VOID_SIGNED / SUPERSEDE / REISSUE / ROTATE **não** foram implementados.

### Persistência LIVE (compatibilidade)

- Contrato cancelado/abortado grava `status = canceled` (alias canônico `cancelled`).
- Request/link revogados gravam `status = revoked`.
- `cancelled`/`canceled` em request/link continuam aliases de leitura → `revoked`.

### Metadados

CANCEL_UNSIGNED: `canceledAt`, `canceledBy`, `canceledByRole`, `cancelReason`, `previousLifecycleState`, `cancelLifecycleAction`.  
ABORT_PARTIAL: os mesmos + `abortedAt`, `abortedBy`, `abortReason` e `metadata.signatureCeremony.status = aborted`.  
REVOKE: `revokedAt`, `revokedBy`, `revokeReason`, `previousStatus` no request/link. Retry idempotente **não** reescreve esses campos.

`actedAt` é um único timestamp ISO por comando, reutilizado em contrato, request, link e audit.

### Efeitos

- CANCEL/ABORT revogam request `pending|sent` e link `pending` **do mesmo contractId**, no mesmo `withDb`.
- Revogação explícita exige `contractId` + `requestId` (e `signLinkId` se informado). Binding cruzado → `SIGNING_ACCESS_BINDING_INVALID`.
- Sem delete de request/link/csig/evidence/manifest/artifact.
- Sem mutação financeira. `cancelFinancialAction` é intenção operacional apenas.
- Falhas estáveis: `LIFECYCLE_REASON_REQUIRED`, `LIFECYCLE_ACTOR_REQUIRED`, `LIFECYCLE_TENANT_MISMATCH`, `CEREMONY_NOT_ABORTABLE`, `SIGNING_ACCESS_BINDING_INVALID`, `CANCEL_NOT_ALLOWED`.

### Idempotência

- CANCEL/ABORT já `cancelled` → `{ idempotent: true }` sem novo audit e sem reescrever motivo/ator/timestamp.
- REVOKE já `revoked` → idempotente; metadados legais originais imutáveis.

### Audit append-only

`contractLifecycleAudits` + `contractAuditLogs`:

- `CONTRACT_CANCELLED`
- `CEREMONY_ABORTED`
- `SIGN_REQUEST_REVOKED`
- `SIGN_LINK_REVOKED`

Payload mínimo: tenantId, contractId, actorId, actedAt, reason, previousState, newState, requestId/linkId quando couber. Sem token, senha ou PII desnecessária.

### Delegação LIVE

- `cancelGeneratedContract` → `dispatchCancelOrAbort`
- `cancelContractSecure` → `cancelGeneratedContract` (senha = UX, não autorização)
- `cancelSignatureRequest` → `revokeSigningAccess`

UI canônica: `CancelContractSecureModal` (motivo + frase + senha de reforço). Parcial usa linguagem “Cancelar cerimônia/contrato” e preserva assinaturas.

### Não implementado nesta fase

VOID_SIGNED, SUPERSEDE, REISSUE, ROTATE_SIGNING_ACCESS UI/writer redesign.
