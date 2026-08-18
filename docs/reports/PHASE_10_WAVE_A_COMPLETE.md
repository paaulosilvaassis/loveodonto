# PHASE_10_WAVE_A_COMPLETE

**Status:** COMPLETE  
**Data:** 2026-08-16  
**Arquitetura:** `docs/platform/PHASE_10_CONTRACTS_ARCHITECTURE.md` (não redesenhada)  
**Infraestrutura:** não tocada  
**remoteActionsExecuted:** false  
**Commit:** não  
**Deploy:** não

---

## Gate

| Critério | Status |
|----------|--------|
| Painel jurídico no Atendimento real | sim |
| Orçamento integrado | sim |
| Package idempotente | sim |
| Cerimônia contém LGPD | sim |
| Prontuário mostra histórico | sim |
| RBAC recepção | sim |
| Status centralizados | sim |
| Telas reais utilizadas | sim |
| Regressões passaram | sim |
| Infraestrutura tocada | não |

---

## ContractPackage reutilizado

Sim. `buildDocumentPackageForBudget`, `getTreatmentDocumentRequirements`, `getContractStatusForQuote`, `createContractDraft`, `attachEligibleTcleToTreatmentPackage` e o manifesto OPTION_C existente continuam a fonte. O ViewModel **não** persiste tabela nova.

- `packageId`: `pkg_{budgetId}` (mesmo padrão operacional)
- Geração: `ensureLegalPackageForBudget` reutiliza contrato ativo; `duplicated` é sempre `false`

## Painel Atendimento

`Pacote jurídico` no atendimento clínico (`ClinicalContractSection` → `ClinicalDocumentPackagePanel` → `LegalPackagePanel`).

Exibe paciente, orçamento, tratamento, responsável legal, status, progresso, pendências, documentos (contrato / TCLE / LGPD / imagem / outros `documentType`) e CTAs por estado. Documento locked não recebe CTA de edição.

## Documentação no orçamento

Seção `Documentação jurídica` em `ClinicalBudgetSection` quando o orçamento está aprovado.

CTAs: `Gerar contrato e consentimentos` / `Abrir pacote jurídico` / `Enviar para assinatura`. Hub `/orcamentos` navega para `section=contratos` do mesmo atendimento.

## Geração idempotente

`ensureLegalPackageForBudget`:

1. Se já existe contrato ativo → reutiliza  
2. Anexa TCLE elegível sem duplicar  
3. LGPD é documento derivado (texto canônico 10.21U), não registro paralelo  
4. Segunda chamada devolve o mesmo `contractId` / `packageId`

## Contrato / TCLE / LGPD

| Documento | Origem | Persistência nova |
|-----------|--------|-------------------|
| Contrato | V1 `generatedContracts` | não |
| TCLE | `documentRecords` + `attachedTcleIds` | não |
| LGPD | `package-manifest-lgpd.ts` na cerimônia e no ViewModel | não |

## Cerimônia

`ContractSignPublicPage` (V1 pública) lista os documentos do pacote via `PublicPackageManifestDocuments`.

- Aceite por documento  
- LGPD deixa de ser só a fase `privacy` paralela  
- Manifesto criptográfico V2/staging permanece OPTION_C quando existir  
- Sem criptografia nova

## Prontuário

Aba **Contratos e consentimentos** em `/prontuario/:patientId` (`?tab=contratos`). Histórico por package e por documento. Sem edição de versão locked/signed. CTA **Abrir pacote** volta ao atendimento.

## RBAC recepção

Exclusivamente `roleDefaults.js` + `can()`.

Recepção (`atendimento` alias) passou a ter: `prontuario_contratos:view|create|send` e `admin_contratos:view|generate|print|export_pdf`.

Não recebe: edit locked, cancel, sign (marcar signed), view_audit / evidência, delete.

## Helper / status canônico

`src/contracts/legalPackageStatus.js`

PackageStatus: `not_started` · `preparing` · `awaiting_signature` · `partially_signed` · `completed` · `superseded` · `cancelled`

Ações: `deriveLegalPackageAvailableActions` — mesmo helper no Atendimento, Orçamento e Prontuário.

## Navegação

| De | Para |
|----|------|
| Orçamento / hub | `/atendimento-clinico/:id?section=contratos` |
| Atendimento | painel Pacote jurídico (mesma aba) |
| Pacote → cerimônia | envio / assinatura V1 existente |
| Pacote → prontuário | `/prontuario/:id?tab=contratos` |
| Prontuário → pacote | `openLegalPackage` |

Nenhuma rota `*-v2`.

## Compatibilidade V1 / domínio V2 / harness

- V1 preservado  
- V2 (`src/domain/contracts/`) preservado  
- Harness `*-v2` preservado e fora da jornada clínica  
- Wizard operacional permanece no hub (fechado); CTA principal vai à tela real

## Componentes reutilizados

`ClinicalDocumentPackagePanel`, `PublicPackageManifestDocuments`, `createContractDraft`, `getTreatmentDocumentRequirements`, `mapOperationalDocumentTypeToContractDocumentType`, `resolveLgpdPresentedContent`, `openExistingBudget` / `openExistingContract`.

## Arquivos alterados / criados

**Criados**

- `src/contracts/legalPackageStatus.js`
- `src/contracts/legalPackagePermissions.js`
- `src/contracts/legalPackageViewModel.js`
- `src/contracts/legalPackageEnsure.js`
- `src/contracts/legalPackageCeremony.js`
- `src/contracts/legalPackageNavigation.js`
- `src/components/contracts/legal/LegalPackagePanel.jsx`
- `src/components/clinical/budget/BudgetLegalPackageSection.jsx`
- `src/components/prontuario/PatientLegalPackagesTab.jsx`
- `src/__tests__/phase10WaveALegalJourney.test.js`
- `docs/reports/PHASE_10_WAVE_A_COMPLETE.md`

**Alterados**

- `src/components/clinical/ClinicalContractSection.jsx`
- `src/components/clinical/ClinicalBudgetSection.jsx`
- `src/components/clinical/ClinicalSignatureSection.jsx`
- `src/components/contracts/operational/ClinicalDocumentPackagePanel.jsx`
- `src/components/budgets/BudgetHubCard.jsx`
- `src/components/budgets/BudgetHubListView.jsx`
- `src/components/budgets/PatientBudgetsContractsTab.jsx`
- `src/pages/BudgetsHubPage.jsx`
- `src/pages/PatientChartPage.jsx`
- `src/pages/contratos/ContractSignPublicPage.jsx`
- `src/permissions/roleDefaults.js`
- `src/index.css`

## Testes novos

`src/__tests__/phase10WaveALegalJourney.test.js` — 23 casos obrigatórios (orçamento sem package, geração, idempotência, TCLE+LGPD, pendente/opcional, awaiting/partial/completed, locked/signed, recepção on/off, prontuário vazio/com package, navegação, cerimônia LGPD, ações, V1, harness, sem duplicação).

## Testes executados / resultado

```
Test Files  9 passed
Tests       110 passed
```

Suites: Wave A, 10.16, 10.17, 10.18, 10.21R, 10.21AM, `contractModuleService`, `contractSignatureFlow`, `fullBudgetContractFlowValidation`.

## Regressões

Passaram. V1 e V2 intactos.

## Infra

| Item | Valor |
|------|-------|
| migration | não |
| schema | não alterado |
| RLS | não alterada |
| remoteActionsExecuted | false |
| cutover | não |
| deploy | não |
| commit | não |
| Git push | não |

## Correções locais nesta Wave

1. `import React` nos JSX novos (render de teste / runtime clássico). Sem mudança de regra de negócio.

## Pronto para Wave B

**sim** — pacote jurídico visível na jornada real; Wave B pode materializar TCLE/LGPD como `Contract` com hash no manifesto sem redesenhar a UX.
