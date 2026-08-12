# PHASE_10.21S — MULTI-DOCUMENT SIGNATURE ARCHITECTURE AUDIT

**Status:** CONCLUÍDA (somente auditoria)  
**Código alterado:** não  
**Migration executada:** não  
**Commit / push / deploy:** não  
**Gate:** `READY_FOR_MULTI_DOCUMENT_SIGNATURE_ARCHITECTURE_APPROVAL`

---

## 0. Resumo executivo

O package operacional já lista **Contrato + TCLE + LGPD**, e o TCLE pode ser anexado (`attachedTcleIds` / `documentRecords`).  
O motor V2 de assinatura, porém, prova criptograficamente **apenas 1 ContractVersion por SignatureEnvelope**.

**Conclusão:** `package multi-document ≠ assinatura jurídica multi-document comprovada`.

Recomendação: **OPTION_C — Manifesto criptográfico do package**, referenciado pelo envelope/evidence existentes, com freeze de snapshots por documento antes da cerimônia.  
Uma assinatura cobre o package; cada documento exige view/aceite individual e hash próprio no manifesto.

---

## 1. Motor atual — mapa

### 1.1 Entidades e fontes

| Conceito | Onde vive | Papel real |
|----------|-----------|------------|
| Contract Package (operacional) | `buildDocumentPackageForBudget` (`operationalContractWizardService.js`) | Checklist clínico: CONTRACT_SERVICES / TCLE / LGPD / IMAGE_USE |
| Contract Package (Domain V2) | `contract-package.types.ts`, `app_contract_packages` | Agrega vários `Contract` por `documentType`; status package-level |
| Contract / Version | `contract.types.ts`, `app_contracts`, `app_contract_versions` | Versão com `documentHash`, `lockedAt`, snapshots |
| SignatureEnvelope | `signature.types.ts`, `app_signature_envelopes` | **1** `contractId` + **1** `contractVersionId` |
| SignatureSigner | `app_signature_signers` | Aceites + `evidence_snapshot` |
| SignaturePolicy | `app_signature_policies` | Métodos, OTP, ordem, expiração |
| Signing session | `app_signature_sessions` (+ challenges) | Sessão pública 1 envelope × 1 signer |
| Public signing | `ContractSignPublicV2Page.jsx`, `/public/signatures-v2/:token/*` | Abre/aceita/assina o documento do envelope |
| Terms acceptance | `SignatureRequiredAcceptance` em `signer.acceptedTerms` | Códigos seedados no create envelope |
| Signature evidence | `SignatureEvidenceSnapshot` + `hashSignatureEvidence` | Hash do signer + `documentHash` do **contrato** |
| Evidence report | `signature-evidence-report.ts` | Report por contract/version/envelope |
| Integrity manifest | `contract-integrity-manifest.ts` | Por contract/version (não package operacional) |
| Artifacts / PDF | `SIGNED_PDF`, `EVIDENCE_REPORT`, pipeline artifacts | PDF do **contrato** do envelope |
| Audit trail | `ContractAuditEvent` / `app_contract_audit_events` | Eventos de envelope/contrato |
| documentRecords | `documentService.js` | Conteúdo clínico mutável (`content`, `signed`) |
| attachedTcleIds | `generatedContracts.metadata` + resolução clínica | IDs de **tipo** TCLE, não hash de conteúdo |
| LGPD (package) | Item `ready: true`, `hash: null` | Checklist; aceite frágil via `LGPD_NOTICE_ACKNOWLEDGED` |

### 1.2 Diagrama textual — onde os docs extras saem da prova

```text
Treatment / Atendimento
  ↓
Budget (clinical)
  ↓
Contract Package OPERACIONAL
  ├── Contract (renderedHtml / documentHash?)     ←─ único com hash às vezes
  ├── TCLE (attachedTcleIds / documentRecords)   ←─ hash: null; conteúdo mutável
  └── LGPD (item checklist)                      ←─ hash: null; sem snapshot
        │
        │  (pré-requisito clínico / UX)
        │
        ▼
Domain V2 (quando usado)
  Contract (SERVICE_CONTRACT) + ContractVersion [lockedAt + documentHash]
        ↓
  SignatureEnvelope  (contractId + contractVersionId)   ★ 1:1
        ├── Signer.acceptedTerms
        │     DOCUMENT_READ (req)
        │     SIGNATURE_INTENT_CONFIRMED (req)
        │     LGPD_NOTICE_ACKNOWLEDGED (NÃO obrigatório; contentHash estático)
        │     CLINICAL_CONSENT_CONFIRMED  ← enum existe, NÃO é seedado
        ├── SigningSession (token público)
        └── Evidence / PDF / Report
              → cobrem documentHash do CONTRATO da versão
              → NÃO referenciam TCLE contentHash / documentRecordId
              → NÃO referenciam package operacional

★ PONTO DE RUPTURA: a partir do SignatureEnvelope, TCLE/LGPD
  do package operacional deixam de participar formalmente da assinatura.
```

### 1.3 Status lifecycle (atuais)

| Aggregate | Status |
|-----------|--------|
| Contract V2 | `DRAFT` … `SIGNED` … `VOIDED` |
| Envelope | `DRAFT` → `READY` → `SENT` → `IN_PROGRESS` → `PARTIALLY_SIGNED` → `COMPLETED` / `DECLINED` / `EXPIRED` / `CANCELLED` / `FAILED` |
| Signer | `PENDING` → `INVITED` → `VIEWED` → `AUTHENTICATED` → `SIGNED` / `DECLINED`… |
| Package V2 | `DRAFT`, `PENDING`, `PARTIALLY_COMPLETE`, `COMPLETED`, `CANCELLED` |
| Package operacional (derivado 10.21R) | Contrato: DRAFT/READY/PENDING_SIGNATURE/SIGNED; TCLE/LGPD: só DRAFT/READY |

---

## 2. Questões jurídico-técnicas (pelo código)

### A. Ao assinar o envelope, há evidência suficiente de aceite do TCLE?

**Não.**

- Seed de termos no create envelope: `DOCUMENT_READ`, `SIGNATURE_INTENT_CONFIRMED`, `LGPD_NOTICE_ACKNOWLEDGED` — **sem** `CLINICAL_CONSENT_CONFIRMED` e sem `tcleId` / `documentRecordId`.
- `sign()` hasheia `documentHash` do envelope (= hash da ContractVersion) + `acceptedTerms` do signer.
- TCLE operacional é pré-requisito/anexo (`attachedTcleIds`), fora do evidence path.

### B. Hash/evidence cobre só o contrato ou o package?

**Somente o contrato (versão) do envelope.**

Evidência: `buildDocumentPackageForBudget` define `hash: null` para TCLE/LGPD; evidence report tem um único `documentHash` = `envelope.documentHashBeforeSigning`.

### C. Alterar TCLE depois da assinatura pode passar despercebido?

**Sim.**

- `updateDocumentRecord` permite alterar `content` sem trava pós-assinatura do contrato.
- Evidence não inclui hash do TCLE.
- `attachedTcleIds` guardam tipo (`tcle_implante`), não conteúdo.

### D. TCLE possui versão/snapshot imutável antes da assinatura?

**Não no fluxo operacional.**

- Package: `version: '1'`, `hash: null`.
- Domain V2 *poderia* modelar `INFORMED_CONSENT` como ContractVersion locked — o fluxo clínico atual **não** cria isso ao anexar TCLE.

### E. LGPD possui aceite individual registrável?

**Parcial e frágil.**

- Código `LGPD_NOTICE_ACKNOWLEDGED` existe; seed com `required: false` e `contentHash: 'term_lgpd_notice_v1'` (constante, não texto LGPD real do clinic).
- Não há documento LGPD do package com hash próprio no evidence.

### F. É possível provar exatamente QUAL conteúdo do TCLE o paciente viu?

**Não** com o motor atual (sem snapshot/hash do conteúdo no envelope/evidence; página pública serve o documento do envelope/contrato).

### G. PDF/evidence report identifica TCLE individualmente?

**Não.** Campos: `contractId`, `contractVersionId`, `envelopeId`, `documentHash`. Sem `tcleId` / `documentRecordId`.

### H. Risco: contrato SIGNED e TCLE apenas ATTACHED?

**Sim — risco real e explícito.**

- `listPackageDocumentStatuses`: TCLE/LGPD nunca viram `SIGNED`; só `DRAFT`/`READY`.
- Completion V2 valida envelope/contrato, não o checklist operacional de TCLE anexado.
- Validação strict de TCLE ocorre na **geração** operacional, não no `sign()` V2.

---

## 3. Comparação das 3 arquiteturas

### OPTION A — Um envelope por documento

```text
Package
├ Contract → Envelope A
├ TCLE     → Envelope B
└ LGPD     → Envelope C
```

| Critério | Avaliação |
|----------|-----------|
| Segurança | Alta se cada doc for ContractVersion locked + evidence própria |
| Complexidade | Alta — N cerimônias, N tokens, completion do package, UX de “faltam 2 assinaturas” |
| UX | Pior para o paciente (vários links/etapas) |
| Evidência | Clara por documento; package COMPLETED só quando todos COMPLETED |
| Migrations | Baixa–média se reutilizar `app_contract_packages` + contratos tipados; alta no fluxo operacional clínico |
| Compatibilidade | Boa com Domain V2 package (`INFORMED_CONSENT`, `LGPD_TERM` já existem como `CONTRACT_DOCUMENT_TYPES`) |

**Nota:** Domain V2 package **já descreve** items = contracts distintos. O fluxo clínico operacional **não** materializa TCLE/LGPD como contracts V2.

### OPTION B — Envelope multi-document verdadeiro

```text
Package → Envelope
  ├ Contract snapshot/hash
  ├ TCLE snapshot/hash
  └ LGPD snapshot/hash
→ 1 cerimônia
```

| Critério | Avaliação |
|----------|-----------|
| Segurança | Alta se freeze + per-doc accept + hash composto |
| Complexidade | Muito alta — quebra o modelo 1:1 envelope↔contractVersion |
| UX | Ideal (uma cerimônia) |
| Evidência | Forte se report listar cada doc |
| Migrations | Alta — alterar `app_signature_envelopes`, sessions, public API, artifacts |
| Compatibilidade | Risco de invalidar/assumir comportamento de envelopes históricos se não for aditivo |

### OPTION C — Manifesto criptográfico do package (recomendada)

```text
Envelope continua 1↔1 com Contract (principal)
Antes de READY_TO_SIGN / SENT:
  PackageManifest imutável {
    items: [{ documentId, type, version, contentHash, required, artifactRef }]
    packageManifestHash
  }
Aceites por item (viewedAt/acceptedAt)
Assinatura referencia packageManifestHash + documentHash do contrato
```

| Critério | Avaliação |
|----------|-----------|
| Segurança | Alta se freeze de conteúdo + hash por item + manifesto no evidence |
| Complexidade | Média — estende evidence/public UI sem reescrever envelope core |
| UX | Uma cerimônia; paciente visualiza/aceita cada doc |
| Evidência | PackageManifestHash + per-doc hashes = prova do conjunto |
| Migrations | Sim, **aditiva** (manifest/items ou JSONB versionado + storage de snapshots) |
| Compatibilidade | Envelopes antigos sem manifesto continuam válidos (contrato-only) |

---

## 4. Experiência ideal do paciente (proposta)

```text
Documentos para sua assinatura

[ ] Contrato de Prestação de Serviços
    → Visualizar documento → Aceitar

[ ] TCLE — Implantes / Protocolo
    → Visualizar documento → Aceitar

[ ] Política / Termo LGPD
    → Visualizar documento → Aceitar

[ Assinar documentos ]  ← habilitado só com obrigatórios aceitos
```

**Decisão decorrente da OPTION_C:**

- **Uma assinatura** cobre o package (cerimônia única).
- **Cada documento obrigatório** exige visualização + aceite individual registrado.
- Status derivado: documento `ACCEPTED` → após cerimônia, package/itens `SIGNED` sob o mesmo `signedAt` / `signatureEvidenceId`, com hashes distintos no manifesto.

Não usar N assinaturas gráficas (Option A) salvo requisito jurídico externo explícito.

---

## 5. Evidência mínima — existe vs falta

| Campo | Existe hoje? | Onde / gap |
|-------|--------------|------------|
| documentId (contrato) | Sim | envelope.contractId / version |
| documentId (TCLE) | Parcial | documentRecord.id / attached tipo — **fora do evidence** |
| documentType | Parcial | package items; **não no evidence report** |
| version | Parcial | ContractVersion; TCLE package `version:'1'` fixo |
| contentHash | Só contrato | TCLE/LGPD `hash: null` |
| required | Package / terms | TCLE não vira termo required no signer |
| viewedAt | Signer-level | Não per-document no package |
| acceptedAt | Por `acceptedTerms.code` | Sem per-TCLE |
| signerId | Sim | |
| packageId | Operacional sintético `pkg_*` | Não ligado ao envelope V2 |
| envelopeId | Sim | |
| signedAt | Sim | |
| signatureEvidenceId / evidenceHash | Sim (signer/report) | Sem `packageManifestHash` |
| packageManifestHash | **Não existe** | Gap central |

---

## 6. Imutabilidade

### Comportamento atual

| Artefato | Após iniciar assinatura |
|----------|-------------------------|
| ContractVersion V2 | **Locked** (`lockedAt` exigido para criar envelope; draft não editável) |
| TCLE documentRecord | **Mutável** (`updateDocumentRecord` altera `content`) |
| LGPD package item | Sem snapshot; aviso com hash estático de termo |
| Package operacional | Pode ganhar/remover anexos via metadata **sem** invalidar evidence do contrato |

### Regra recomendada

```text
READY_TO_SIGN
  → freeze PackageManifest (snapshots + contentHash por item)
  → envelope SENT / sessão pública
  → assinatura

Qualquer alteração posterior:
  → nova versão do documento afetado
  → novo manifesto
  → nova cerimônia (envelope novo / reissue)
  → itens antigos SUPERSEDED
```

---

## 7. Status derivados (proposta — **não criar enums agora**)

### Package

| Proposto | Enum próximo existente |
|----------|------------------------|
| DRAFT | Package V2 `DRAFT` / operacional incompleto |
| INCOMPLETE | próximos: itens required não ready |
| READY_TO_SIGN | manifesto frozen + contrato APPROVED |
| SIGNING | Envelope `SENT` / `IN_PROGRESS` |
| SIGNED | Envelope `COMPLETED` + manifesto sealed |
| CANCELLED | `CANCELLED` |

### Documento

| Proposto | Hoje |
|----------|------|
| DRAFT / READY | operacional 10.21R |
| PENDING_ACCEPTANCE | **não existe** per-doc na sessão pública |
| ACCEPTED | parcial via `acceptedTerms` (não por TCLE) |
| SIGNED | só contrato |
| SUPERSEDED | Contract `SUPERSEDED` (não package item operacional) |

---

## 8. Prontuário — prova futura desejada

```text
Paciente X
assinou Package Y em Z
contendo:
  Contrato  hash A  (artifact/PDF)
  TCLE      hash B  (snapshot imutável)
  LGPD      hash C  (snapshot imutável)
Evidence E (reportHash + packageManifestHash)
```

Profissional abre **exatamente** o conteúdo frozen (storage privado / artifact refs), não o `documentRecord` vivo editável.

Hoje: prontuário pode ter documentRecord + contrato assinado; **não** amarra hashes B/C à evidence E.

---

## 9. Impacto de migration (por opção) — **não executar**

### OPTION A

| Item | Impacto |
|------|---------|
| New tables | Possivelmente nenhuma se TCLE/LGPD virarem `app_contracts` tipados + items do package V2 |
| New columns | Ligação operacional↔V2 contract ids |
| Migration | Média (wiring + dados) |
| RLS | Políticas já de contracts/envelopes; revisar por N envelopes |
| Storage | N PDFs/evidence |
| API | N invites/tokens ou orquestrador de package |
| Frontend | Fluxo clínico gera contracts tipados; UX multi-envelope |
| Backward compatibility | Alta se aditivo |
| Existing contracts | Intactos |

### OPTION B

| Item | Impacto |
|------|---------|
| New tables / columns | Alterar envelope para multi-doc refs; sessions; artifacts |
| Migration | **Alta** |
| RLS / Storage / API | Redesign |
| Frontend | Public signing multi-doc nativo |
| Backward compatibility | Crítica — exige dual-read envelopes legado |
| Existing contracts | Não invalidar; branch legado obrigatório |

### OPTION C

| Item | Impacto |
|------|---------|
| New tables | Recomendado: `app_signature_package_manifests` + `..._items` (ou JSONB versionado + artifacts) |
| New columns | `envelope.package_manifest_id` / `package_manifest_hash` (nullable) |
| Migration | **Sim, aditiva** |
| RLS | Tenant-scoped como envelopes |
| Storage | Snapshots TCLE/LGPD private bucket (reusar private storage de contracts) |
| API | Extender public status/document para listar items do manifesto; accept per item |
| Frontend | UI multi-doc na página pública; freeze no envio |
| Backward compatibility | Envelopes sem manifesto = comportamento atual (contrato-only) |
| Existing contracts | **Sem invalidação** |

---

## 10. Compatibilidade obrigatória

Preservar:

- contratos V1 / PDFs / envelopes já assinados;
- rollout e tenant piloto;
- V1 fallback;
- feature_flags intactas nesta fase (e na implementação futura: flags de manifesto opt-in).

Nenhuma migration pode reescrever evidence histórica. Manifesto só em envelopes novos.

---

## 11. Recomendação

### `OPTION_C`

**Por quê**

1. Fecha o gap jurídico (prova de *qual* conteúdo de cada doc) sem abandonar o envelope 1:1.
2. Menor redesign do Signature Engine vs Option B.
3. UX de uma cerimônia (melhor que A) com aceites per-doc.
4. Aditivo e compatível com envelopes/PDFs existentes.
5. Reutiliza private storage, evidence hash, public token, INTERNAL_V2 — **sem provider paralelo**.

**Riscos**

- Implementação incorreta que trate manifesto como “soft checklist” sem freeze de bytes → gap permanece.
- Aceite LGPD continuar com hash estático se não houver snapshot do texto real.
- Dois packages (operacional vs V2) precisam de ponte explícita no freeze.

**Complexidade / esforço**

- Médio: schema aditivo + freeze pipeline + public UI multi-doc + evidence/report fields + testes.
- Menor que B; menos fricção de UX que A.

**Migration:** **Sim (aditiva), sob aprovação.**  
**Schema:** manifesto + items (ou equivalente) + nullable FK no envelope.  
**Não:** novo signature provider; não invalidar V1.

---

## 12. Gate fields

| Campo | Valor |
|-------|-------|
| **Current signature model** | 1 Envelope → 1 ContractVersion → 1 cerimônia; evidence sobre `documentHash` do contrato |
| **Current TCLE evidence** | Pré-requisito/anexo (`attachedTcleIds` / documentRecords); fora do evidence hash |
| **Current LGPD evidence** | Termo opcional `LGPD_NOTICE_ACKNOWLEDGED` com contentHash estático; item package sem hash |
| **Evidence gap** | Sem `packageManifestHash`; sem per-doc contentHash/view/accept no sign |
| **Immutability gap** | ContractVersion locked; TCLE documentRecord mutável pós-attach/sign |
| **Option A** | N envelopes; forte prova; UX pior; alinhado a package V2 tipado |
| **Option B** | Envelope multi-doc nativo; UX ideal; migration/risco altos |
| **Option C** | Manifesto imutável + 1 assinatura; menor caminho seguro |
| **Recommended option** | **OPTION_C** |
| **Why** | Segurança/rastreabilidade com compatibilidade e menor redesign do motor |
| **Migration required** | Sim (aditiva), **após aprovação** — não nesta fase |
| **Schema changes required** | Manifest/items (+ FK nullable no envelope) — proposta |
| **API changes required** | Public list/view/accept por item; include manifest hash no sign/evidence |
| **Public signing changes** | Lista documentos; obrigatórios antes de Assinar |
| **Evidence changes** | `packageManifestHash` + items[] no report/snapshot |
| **Prontuario changes** | Referências a snapshots/hashes do manifesto (não content vivo) |
| **Backward compatibility** | Envelopes legados intactos |
| **Risk** | Médio se manifesto for “cosmético”; baixo se freeze for hard-gate |
| **Estimated implementation scope** | 1–2 phases: freeze+manifest → public multi-doc accept → evidence/prontuário |
| **Production active** | Sem alteração nesta fase |
| **Production changes made** | **Nenhuma** |
| **Decision** | Aguardar aprovação de OPTION_C antes de qualquer implementação/migration |
| **Gate** | **READY_FOR_MULTI_DOCUMENT_SIGNATURE_ARCHITECTURE_APPROVAL** |

---

## HARD STOP

- Nenhum código alterado nesta fase  
- Nenhuma migration / RLS / Supabase / flags  
- Nenhum commit / push / deploy  
- Nenhuma assinatura / comunicação externa  

**Próximo passo (humano):** aprovar ou rejeitar OPTION_C (ou escolher A/B) antes de PHASE de implementação.
