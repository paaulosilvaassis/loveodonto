# PHASE_10.21R — TCLE SIGNATURE INTEGRATION AND DOCUMENT IDENTITY FIX

**Status:** CONCLUÍDA (local)  
**Commit:** não realizado  
**Deploy:** não realizado  
**Gate:** `READY_FOR_LOCAL_TCLE_SIGNATURE_VALIDATION`

---

## 1. Objetivo

Integrar o TCLE ao pacote documental/assinatura operacional já existente (sem motor paralelo), corrigir truncamento de identidade do paciente, endurecer mapping de CRO e fazer o CTA “Resolver TCLE” abrir Consentimentos (com template recomendado).

---

## 2. Auditoria do motor de assinatura (Bloco 1)

| Pergunta | Resposta |
|----------|----------|
| 1. TCLE no mesmo package/envelope do contrato? | **Package operacional: sim** (`buildDocumentPackageForBudget` → Contrato + TCLE + LGPD). **SignatureEnvelope V2: 1 contract/version** — não é envelope multi-documento nativo. |
| 2. Múltiplos documentos por package? | **Sim** no package operacional / Domain V2 package types. |
| 3. Status próprio por documento? | **Parcial** — statuses derivados no painel (`DRAFT/READY/PENDING_SIGNATURE/SIGNED`); envelope V2 assina 1 contrato. |
| 4. Paciente vê Contrato + TCLE + LGPD antes de assinar? | **Parcial** — package lista docs; página pública atual foca o contrato do envelope. TCLE entra como pré-requisito anexado (`attachedTcleIds` / documentRecords). |
| 5. Assinatura por envelope ou por documento? | **Por envelope/contrato** no INTERNAL_V2; package operacional agrega pré-requisitos. |
| 6. Evidence report referencia docs aceitos? | **Sim** para o contrato/envelope existente; TCLE vinculado via metadata/prontuário, sem storage paralelo. |
| 7. PDF final preserva arquivos separados? | **Sim** — documentos distintos (não fundidos em um texto). |
| 8. Associação clinical document ↔ contract package? | **Sim** — `metadata.attachedTcleIds` + `documentRecords.metadata.tcleId` (já existente) + service idempotente novo. |
| 9. O que faltava? | CTA na UI de Consentimentos; SSOT de nome; navegação Resolver TCLE; status labels no package. |

**Decisão arquitetural desta fase:** reutilizar package operacional + attach idempotente. **Não** criar provider/envelope multi-doc novo (exigiria aprovação + possível migration).

---

## 3. Relatório do gate (campos pedidos)

| Campo | Valor |
|-------|-------|
| **Existing signature engine reused** | Sim — Contracts Domain V2 / assinatura pública + package operacional; sem provider paralelo. |
| **Package integration** | `attachTcleDocumentToTreatmentPackage` → `metadata.attachedTcleIds` + snapshot via `buildDocumentPackageForBudget`. |
| **TCLE integration** | CTA “Adicionar ao pacote de assinatura” / “Vincular último TCLE ao pacote” em Consentimentos. |
| **LGPD integration** | Continua item do package operacional (coexiste; não fundido). |
| **Public signing integration** | Reutilizada para o contrato do tratamento; TCLE como doc do package/prontuário (não envelope multi-doc). |
| **Patient name root cause** | `DocumentsSection` preferia `nickname` (`"de Assis"`) sobre `profile.full_name` / `full_name` do paciente no atendimento. |
| **Patient name fix** | SSOT `resolvePatientFullName` + `getPatient()`; `replaceTemplateVariables` endurecido (keys longas primeiro, split/join). |
| **Professional/CRO mapping** | `resolveProfessionalCro` / `resolveProfessionalFullName`; CRO ausente **bloqueia** attach ao package (não inventa CRO). |
| **Clinic mapping** | Mesma SSOT `clinicProfile` / addresses / phones / logo já usada no tenant. |
| **Treatment/TCLE mapping** | Registry existente: `PROTOCOLO_TOTAL` → `tcle_implante` (“Implantes / Protocolo”). Recomendação: manter; não criar obrigação extra sem regra configurada. |
| **Resolve TCLE navigation fix** | `docCategory=consentimentos` + `docTemplate` + remount `key` em `ClinicalAppointmentPage` (evita abrir Atestados). |
| **Evidence integration** | Reutiliza infrastructure existente do contrato/envelope; attach só referencia TCLE no package/metadata. |
| **Prontuario integration** | `createDocumentRecord` + link package; sem duplicar binário. |
| **Files changed** | Ver §4 |
| **Tests** | `phase1021rTcleSignatureAndIdentityFix.test.js` **8/8 pass**; suites relacionadas OK; 1 falha pré-existente em `contractSignatureFlow` (`window.location.origin` no Node). |
| **Build** | `npm run build` **OK** |
| **Migration required** | **Não** |
| **New tables** | **Não** |
| **New provider** | **Não** |
| **External communication** | **Não** disparada automaticamente pela integração |
| **Production changed** | **Não** |
| **Rollout changed** | **Não** |
| **Risks** | Assinatura pública ainda não lista TCLE como documento navegável separado no envelope; status SIGNED do TCLE depende do fluxo de contrato, não de envelope próprio. |
| **Blockers** | Nenhum para validação local do attach + identidade + navegação. Full Bloco 2/10 multi-doc viewer exige aprovação arquitetural. |
| **Decision** | Implementar com package operacional existente; documentar limite do envelope 1:1. |
| **Gate** | **READY_FOR_LOCAL_TCLE_SIGNATURE_VALIDATION** |

---

## 4. Arquivos

### Criados
| Arquivo |
|---------|
| `src/utils/patientIdentity.js` |
| `src/services/tclePackageAttachmentService.js` |
| `src/__tests__/phase1021rTcleSignatureAndIdentityFix.test.js` |
| `docs/reports/PHASE_10_21R_TCLE_SIGNATURE_INTEGRATION_AND_DOCUMENT_IDENTITY_FIX.md` |

### Modificados
| Arquivo | Alteração |
|---------|-----------|
| `src/utils/documentTemplates.js` | `replaceTemplateVariables` seguro |
| `src/components/clinical/DocumentsSection.jsx` | SSOT identidade; CRO gate; CTAs package; highlight template |
| `src/pages/ClinicalAppointmentPage.jsx` | `docCategory`/`docTemplate` + remount + `budgetId` |
| `src/components/contracts/operational/ClinicalDocumentPackagePanel.jsx` | Status por documento |
| `src/index.css` | Estilos identity/warn |

---

## 5. Validação manual sugerida (localhost)

1. Atendimento → Contrato → **Resolver TCLE**  
2. Deve abrir **Documentos → Consentimentos** (não Atestados) e destacar **Implante** quando aplicável  
3. Conferir nome: **Paulo Henrique Silva de Assis** (nunca só “de Assis”)  
4. Conferir profissional + CRO (ou bloqueio se CRO ausente)  
5. **Adicionar ao pacote de assinatura** → **Voltar ao contrato para enviar**  
6. Package deve listar Contrato + TCLE + LGPD com status  
7. Abrir página pública de assinatura **sem** concluir assinatura real / sem WhatsApp automático

---

## 6. HARD STOP

- Sem commit / push / deploy  
- Sem migration / flags / rollout  
- Sem assinatura real / comunicação externa  

**Gate:** `READY_FOR_LOCAL_TCLE_SIGNATURE_VALIDATION`
