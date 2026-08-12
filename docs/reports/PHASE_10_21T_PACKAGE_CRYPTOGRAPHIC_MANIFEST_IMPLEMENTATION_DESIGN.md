# PHASE_10.21T — PACKAGE CRYPTOGRAPHIC MANIFEST IMPLEMENTATION DESIGN

**Approved architecture:** OPTION_C  
**Status:** DESIGN CONCLUÍDO (sem apply)  
**Migration applied:** **NO**  
**Schema changed in Supabase:** **NO**  
**Production changed:** **NO**  
**Flags changed:** **NO**  
**Commit / push / deploy:** **NÃO**  
**Gate:** `READY_FOR_PACKAGE_MANIFEST_IMPLEMENTATION_APPROVAL`

---

## 0. Princípio de segurança

A assinatura deve provar:

> Este signer assinou este package contendo exatamente estes documentos, nestas versões e com estes conteúdos.

Não basta: “assinou o contrato e havia TCLE anexado”.

Após freeze, qualquer byte juridicamente relevante alterado em qualquer documento → `contentHash` diferente → `manifestHash` diferente → identidade do manifesto anterior invalidada (nova versão / nova cerimônia).

---

## 1. Current structures reused

| Estrutura | Uso |
|-----------|-----|
| `CONTRACT_DOCUMENT_TYPES` | Taxonomia oficial (SERVICE_CONTRACT, INFORMED_CONSENT, LGPD_TERM, …) |
| `SIGNATURE_ACCEPTANCE_CODES` | DOCUMENT_READ, CLINICAL_CONSENT_CONFIRMED, LGPD_NOTICE_ACKNOWLEDGED, … |
| `canonicalizeJsonValue` + `sha256Utf8` / `sha256Bytes` | Hash canônico |
| `SignatureEnvelope` 1↔1 `contractVersion` | Preservado |
| `app_contract_packages` | FK opcional `package_id` |
| `app_contracts` / `app_contract_versions` | Contrato primário locked |
| Private storage contracts | Snapshots de conteúdo apresentado |
| Public signing token/session | Mesma cerimônia; UI multi-doc |
| `attachedTcleIds` / documentRecords | Fonte operacional pré-freeze (não evidência final) |
| Triggers `app_contract_reject_tenant_id_change` | Reuso de imutabilidade tenant |

---

## 2. New structures required

| Objeto | Justificativa |
|--------|----------------|
| `app_package_manifests` | Manifesto imutável + `manifest_hash` |
| `app_package_manifest_documents` | Itens com `content_hash` + snapshot refs |
| `app_package_document_acceptances` | Aceite individual por signer/documento |
| Colunas nullable em `app_signature_envelopes` | `package_manifest_id`, `package_manifest_hash` |

**Não** criar novo signature provider / motor paralelo.

---

## 3. Manifest schema (domínio)

Arquivo: `src/domain/contracts/packages/package-manifest.types.ts`

```
PackageManifest
  id, tenantId
  packageId?                    # FK V2 opcional
  sourcePackageKey              # pkg_${budgetId} / package_number
  manifestVersion
  status: DRAFT|FROZEN|SIGNING|SIGNED|SUPERSEDED|CANCELLED
  canonicalizationVersion: pkg_manifest_v1
  manifestHash?
  primaryContractId
  primaryContractVersionId
  createdAt/By, frozenAt/By, idempotencyKey
  documents[]

PackageManifestDocument
  documentKey                   # contract | tcle:tcle_implante | lgpd
  documentType                  # CONTRACT_DOCUMENT_TYPES
  sourceKind / sourceId
  documentVersion, title
  required, displayOrder
  contentMimeType
  contentHash                   # hash do conteúdo apresentado
  contentHashEncoding           # utf8_canonical_v1 | binary_sha256_v1
  snapshotStorage*
  acceptanceCode / acceptanceLabel

PackageDocumentAcceptance
  manifestDocumentId, envelopeId, signerId
  contentHash, acceptanceVersion
  viewedAt, acceptedAt
```

---

## 4. Document snapshot strategy

No `freezePackageForSignature()`:

1. Resolver conteúdo **exatamente** a apresentar (contrato locked HTML/text; TCLE `documentRecord.content`; LGPD texto da política clínica versionada — **nunca** template “atual” na hora da assinatura).
2. Canonicalizar + hashear.
3. Gravar snapshot no private storage (`snapshot_storage_*`).
4. Persist item no manifesto com `content_hash` + path.
5. Página pública e prontuário leem **somente** o snapshot.

`attachedTcleIds` permanece referência operacional; a prova jurídica aponta para o item do manifesto.

---

## 5. Canonicalization

**Version:** `pkg_manifest_v1` (nunca mudar silenciosamente).

### Texto/HTML (`utf8_canonical_v1`)

- UTF-8 via `TextEncoder`
- Remove BOM
- Newlines → `\n` (`\r\n` / `\r`)
- **Não** colapsar whitespace interno
- **Não** alterar casing
- Hash = SHA-256 hex do texto canônico (`sha256Utf8`)

### Binário/PDF (`binary_sha256_v1`)

- SHA-256 dos bytes brutos (`sha256Bytes`) — sem reinterpretar

### JSON do manifesto

- `canonicalizeJsonValue` (chaves ordenadas, skip `undefined`)
- `JSON.stringify` → `sha256Utf8`

Auditoria do hash atual de contrato: `contract-content-hasher.ts` hasheia `renderedHtml` + snapshots com o mesmo padrão de JSON canônico — o manifesto **reusa** essa infraestrutura, com normalização de newline explícita para conteúdo apresentado.

---

## 6. Document / Manifest hash algorithms

### Document

```
contentHash = SHA256( canonicalizePresentedTextV1(presentedContent) )
           ou SHA256( presentedBytes )
```

### Manifest

```
manifestHash = SHA256( JSON.stringify(canonicalizeJsonValue({
  canonicalizationVersion,
  tenantId,
  sourcePackageKey,
  packageId,
  manifestVersion,
  primaryContractId,
  primaryContractVersionId,
  documents: orderedBy(displayOrder, documentKey)[
    documentKey, documentType, documentVersion,
    required, displayOrder, contentHash, contentMimeType
  ]
})))
```

Implementação pura: `package-manifest-hash.ts`  
Garantias cobertas por testes: alterar TCLE/LGPD/contrato, add/remove doc, trocar ordem → hash muda.

---

## 7. Freeze lifecycle

```
DRAFT → FROZEN → SIGNING → SIGNED
              ↘ SUPERSEDED / CANCELLED
```

`freezePackageForSignature()` (design em `package-manifest-freeze.design.ts`):

1. Validar prerequisites  
2. Resolver docs obrigatórios  
3. Snapshots + content hashes  
4. Insert DRAFT + documents  
5. Compute `manifestHash` → status `FROZEN`  
6. Bind envelope (`package_manifest_id` + `package_manifest_hash`)  
7. Ao enviar: `FROZEN` → `SIGNING`  
8. Ao completar: `SIGNING` → `SIGNED`

Mutação pós-freeze: **proibida** (trigger + API). Mudança → novo `manifest_version` + manifesto novo + nova cerimônia.

---

## 8. Acceptance model

UI pública (antes de Assinar):

| Documento | Aceite (labels configuráveis; defaults no map) |
|-----------|-----------------------------------------------|
| Contrato | `DOCUMENT_READ` — “Li e estou de acordo…” |
| TCLE | `CLINICAL_CONSENT_CONFIRMED` — “Li, compreendi e concordo…” |
| LGPD | `LGPD_NOTICE_ACKNOWLEDGED` — “Li e estou de acordo…” (agora **required** quando item required) |

Persistir em `app_package_document_acceptances`:

`documentId/key`, `documentVersion`, `contentHash`, `viewedAt`, `acceptedAt`, `acceptanceVersion=accept_v1`

Gate de `sign()`:

- todos `required` com `acceptedAt`
- `acceptance.contentHash === document.contentHash`
- `envelope.package_manifest_hash === manifest.manifest_hash`

Opcionais (ex.: IMAGE): não bloqueiam se não aceitos.

---

## 9. Envelope integration

**Preserva** 1 envelope / 1 contractVersion.

Alteração mínima:

| Coluna | Tipo | Notas |
|--------|------|-------|
| `package_manifest_id` | uuid NULL | FK composta tenant |
| `package_manifest_hash` | text NULL | sha256; pair-check com id |

Evidence final inclui ambos + `documentHash` do contrato (legado).

---

## 10. Evidence integration

```
evidence
  envelopeId, signerId, signedAt
  contractDocumentHash          # legado
  packageManifestId?
  packageManifestHash?          # package-aware
  documents[]:
    key, type, version, contentHash, required, viewedAt, acceptedAt
```

Legacy: `packageManifestId == null` → evidence contrato-only (modelo antigo).  
**Nunca** recalcular manifesto retroativo para envelopes históricos.

---

## 11. Evidence report

Seção administrativa **PACOTE ASSINADO**:

- Lista cada documento (título, versão, hash, aceito em)
- Manifest Hash
- Assinatura / signer / timestamp

UI paciente: sem hashes; só títulos + visualizar + checkboxes + Assinar.

---

## 12. Public signing UX

```
Implanprime Odontologia
Documentos do seu tratamento

3 documentos precisam da sua revisão.

1. Contrato … [Visualizar] [✓ aceite]
2. TCLE — Implantes … [Visualizar] [✓ aceite]
3. Privacidade e LGPD … [Visualizar] [✓ aceite]

[ Assinar documentos ]
```

`GET document` sempre serve snapshot do manifesto — nunca template live.

---

## 13. LGPD treatment

Corrige fragilidade 10.21S:

- Conteúdo = política/termo **versionado da clínica** (ou snapshot gerado no freeze)
- `contentHash` do texto real (não `term_lgpd_notice_v1`)
- Item `LGPD_TERM` required no package clínico padrão
- `acceptedAt` + hash no acceptance + evidence

---

## 14. TCLE treatment

First-class package document:

- `documentKey = tcle:{tcleId}`
- `documentType` especializado (`IMPLANT_CONSENT` etc.) via map
- Snapshot do `documentRecord.content` (ou PDF) no freeze
- Evidence aponta snapshot/hash — `attachedTcleIds` só operacional

---

## 15. Prontuario integration

Pós-SIGNED:

```
Documentos assinados → Package
  Contrato [Abrir snapshot]
  TCLE [Abrir snapshot]
  LGPD [Abrir snapshot]
  Comprovante [Evidence report]
```

Referências = manifesto + storage paths; não o documentRecord vivo.

---

## 16. Tenant isolation / RLS

| Tabela | RLS |
|--------|-----|
| manifests / documents / acceptances | ENABLE RLS; **deny-by-default** para `anon`/`authenticated`; grants `service_role` (padrão sessions 032) |
| Envelope columns | Herdam RLS existente de `app_signature_envelopes` |

API pública/backend **sempre** filtra `tenant_id` (service_role não substitui validação).  
FKs compostas `(tenant_id, id)` impedem cross-tenant.

---

## 17. Immutability enforcement

| Camada | Mecanismo |
|--------|-----------|
| DB | Triggers `app_package_manifest_reject_frozen_mutation` + document guard |
| API | Reject update/delete when status ∈ FROZEN/SIGNING/SIGNED |
| Hash | contentHash mismatch bloqueia accept/sign |

Menor solução alinhada a `locked_at` de contract versions + audit append-only.

---

## 18. Idempotency

`freezePackageForSignature({ idempotencyKey })`:

- UNIQUE `(tenant_id, idempotency_key)` em manifests
- Replay → retorna manifesto existente (`duplicate: true`)
- Acceptances UNIQUE `(tenant_id, signer_id, manifest_document_id)`
- Envelope create já tem idempotency própria

Não duplicar snapshots se freeze idempotente reutilizar paths existentes do mesmo manifesto.

---

## 19. Legacy compatibility

| Caso | Comportamento |
|------|----------------|
| Envelope sem manifesto | Evidence legado; UI contrato-only |
| Envelope com manifesto | Gate package-aware |
| Contratos/PDFs antigos | Intactos |
| V1 / rollout / flags | Intactos nesta fase |

---

## 20. Migration proposed

**File (NOT APPLIED):**

- `supabase/migrations/036_app_package_manifest_foundation.sql`
- espelhos: `supabase-local/migrations/…`, `supabase-local/supabase/migrations/…`

Header explícito: **NÃO APLICAR / DO NOT APPLY**.

### Tabelas / colunas

| table | column | type | notes |
|-------|--------|------|-------|
| app_package_manifests | * | ver SQL | status + hash + FKs |
| app_package_manifest_documents | * | ver SQL | content_hash + snapshot |
| app_package_document_acceptances | * | ver SQL | per signer |
| app_signature_envelopes | package_manifest_id | uuid null | FK |
| app_signature_envelopes | package_manifest_hash | text null | pair-check |

**Additive. Backward compatible. Rollback-aware** (seção ROLLBACK no SQL).  
**Não altera registros históricos.**

---

## 21. Security audit dependency

**PHASE_SECURITY_01** (alerta RLS Supabase) — auditoria **paralela**.

Nesta sessão:

- MCP Supabase advisors indisponível
- Nenhum relatório `PHASE_SECURITY_*` encontrado no repo

Tabelas **reutilizadas/alteradas** no apply futuro:

- `app_signature_envelopes` (ALTER columns + FK)
- `app_contract_packages` / `app_contracts` / `app_contract_versions` (FKs)
- private storage bucket contracts

**Regra:** se SECURITY_01 marcar qualquer uma dessas → **APPLY bloqueado** até clearance.  
**Esta fase de design não altera RLS existente** além de propor RLS deny-by-default nas **novas** tabelas.

`Security audit dependency:` **OPEN / PARALLEL — APPLY gated**

---

## 22. Tests

| Suite | Resultado |
|-------|-----------|
| `phase1021tPackageCryptographicManifestDesign.test.js` | **11/11 pass** |
| DDL / Supabase | **não executado** (proibido) |

Cobertura pura: canonicalização, hash doc/manifest, T1–T4, ordem, map taxonomia, LGPD não-estático, migration file presente + “NÃO APLICAR”, sem motor paralelo.

---

## 23. Estimated implementation phases (pós-aprovação)

| Phase | Escopo |
|-------|--------|
| **10.21T-impl-1** | Autorizar + aplicar 036 **somente** onde SECURITY_01 liberar (local primeiro) |
| **10.21T-impl-2** | `freezePackageForSignature` + snapshot storage + bind envelope |
| **10.21T-impl-3** | Public UI multi-doc + acceptances + sign gate |
| **10.21T-impl-4** | Evidence/report package-aware + prontuário refs |
| **10.21T-impl-5** | Flag opt-in + regressão + pilot tenant |

---

## 24. Gate fields

| Campo | Valor |
|-------|-------|
| **Approved architecture** | OPTION_C |
| **Current structures reused** | Ver §1 |
| **New structures required** | 3 tabelas + 2 colunas envelope |
| **Manifest schema** | `package-manifest.types.ts` |
| **Document snapshot strategy** | Private storage no freeze |
| **Canonicalization** | `pkg_manifest_v1` |
| **Document hash algorithm** | utf8_canonical_v1 / binary_sha256_v1 |
| **Manifest hash algorithm** | JSON canônico ordenado → SHA-256 |
| **Freeze lifecycle** | DRAFT→FROZEN→SIGNING→SIGNED |
| **Acceptance model** | Per-document table + sign gate |
| **Envelope integration** | nullable manifest id/hash |
| **Evidence integration** | package-aware extension; legacy ok |
| **Evidence report** | seção PACOTE ASSINADO |
| **Public signing UX** | lista + snapshot + 1 Assinar |
| **LGPD treatment** | conteúdo real hasheado, required |
| **TCLE treatment** | first-class manifest document |
| **Prontuario integration** | abrir snapshots do manifesto |
| **Tenant isolation** | tenant_id + FK composta + API |
| **RLS requirements** | deny-by-default novas tabelas |
| **Immutability enforcement** | triggers + API |
| **Idempotency** | idempotency_key + unique acceptances |
| **Legacy compatibility** | manifest null = legado |
| **Migration required** | Sim (aditiva) |
| **Migration proposed** | `036_app_package_manifest_foundation.sql` |
| **Migration applied** | **NO** |
| **Schema changed in Supabase** | **NO** |
| **Tests created** | sim (puros) |
| **Tests run** | 11/11 pass |
| **Production changed** | **NO** |
| **Flags changed** | **NO** |
| **Security audit dependency** | OPEN/PARALLEL — APPLY gated |
| **Risks** | Bridge operacional↔V2 contract ids; LGPD source versioning; SECURITY_01 |
| **Blockers** | Nenhum para **aprovar design**; APPLY espera auth humana + SECURITY_01 |
| **Estimated implementation phases** | 5 subfases (§23) |
| **Decision** | Design pronto para aprovação de implementação |
| **Gate** | **READY_FOR_PACKAGE_MANIFEST_IMPLEMENTATION_APPROVAL** |

---

## HARD STOP

- Migration **não** aplicada  
- Supabase / produção / flags **não** alterados  
- Sem commit / push / deploy  
- Sem assinatura real  

**Aguardar autorização humana** para a fase de implementação (e apply controlado da 036).
