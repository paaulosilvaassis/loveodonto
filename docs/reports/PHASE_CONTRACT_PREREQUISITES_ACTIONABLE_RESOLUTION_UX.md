# PHASE_CONTRACT_PREREQUISITES_ACTIONABLE_RESOLUTION_UX

## Gate

**READY_FOR_LOCAL_MANUAL_VALIDATION**

> Painel “Dados obrigatórios pendentes” virou central de resolução com CTAs contextuais.  
> Validações jurídicas/clínicas **intactas**. Sem commit/push/deploy. Sem flags/rollout.

---

## Root cause UX

O checklist (`getContractReadinessChecklist` → `ContractReadinessChecklist`) listava pendências corretamente, mas **não oferecia caminho de resolução**. O usuário precisava descobrir sozinho:

- Dados da Clínica (responsável técnico / CRO)
- Cadastro do paciente em atendimento
- Documentos → Consentimentos (TCLE)

---

## CTAs criados

| Grupo | CTA | Destino |
|-------|-----|---------|
| Clínica | **Corrigir dados da clínica** | `/admin/dados-clinica?section=documentacao&highlight=responsavel-tecnico&returnTo=…` |
| Paciente / responsável | **Completar cadastro do paciente** | `/pacientes/cadastro/{patientId}?tab=enderecos\|dados&highlight=pending&returnTo=…` |
| TCLE | **Resolver TCLE** | `/atendimento-clinico/{appointmentId}?section=documentos&docCategory=consentimentos&docTemplate=consent_implante&returnTo=…` |

---

## Preservação de contexto

- `patientId`, `appointmentId`, `budgetId` (e `contractId` quando houver) entram em `resolutionContext` na `ClinicalContractSection`.
- Destinos são montados por `buildPrerequisiteDestination` / `buildContractReturnUrl` (`contractPrerequisitesResolution.js`).
- CTA de paciente **sempre** usa o `patientId` do atendimento atual (nunca cadastro genérico).
- `returnTo` só aceita path seguro `/atendimento-clinico/…` (`isSafeClinicalReturnUrl`).

## Retorno

Após salvar em clínica/paciente (ou “Voltar ao contrato” em documentos):

1. navega para `returnTo` com `section=contratos&revalidate=1&budgetId=…&patientId=…`
2. `ClinicalAppointmentPage` força `bumpWorkflow()` quando `revalidate=1`
3. checklist reexecuta `getContractReadinessChecklist` (strict)
4. pendências resolvidas somem / grupos viram ✓; `Gerar contrato` só habilita se `canGenerate` real

## Revalidação

Continua 100% derivada de `validateContractGeneration` / `getContractReadinessChecklist`.  
Nenhum botão é liberado artificialmente.

---

## Arquivos alterados

- `src/contracts/contractPrerequisitesResolution.js` *(novo)*
- `src/components/contracts/ContractReadinessChecklist.jsx`
- `src/components/clinical/ClinicalContractSection.jsx`
- `src/pages/ClinicalAppointmentPage.jsx`
- `src/pages/PatientCadastroPage.jsx`
- `src/pages/ClinicSettingsPage.jsx`
- `src/components/clinical/DocumentsSection.jsx`
- `src/services/operationalContractWizardSupport.js` (labels CTA alinhados)
- `src/index.css`
- `src/__tests__/contractPrerequisitesActionableResolutionUx.test.js` *(novo)*
- `src/__tests__/phase1021mLocalUxFrictionFixes.test.js` (expect CTA)
- este relatório

---

## Entrega

| Campo | Valor |
|-------|--------|
| **Tests** | `contractPrerequisitesActionableResolutionUx` 9/9 + `phase1021m` 7/7 **PASS** |
| **Build** | **PASS** |
| **Migration required** | **NO** |
| **Production flags changed** | **NO** |
| **Contracts rollout changed** | **NO** |
| **Risks** | Baixo — só navegação/UX; retorno depende de `returnTo` seguro |
| **Blockers** | Nenhum técnico; validação manual no piloto pendente |
| **Decision** | Pronto para validação local no atendimento clínico |

## HARD STOP

- Não gerar contrato real
- Não assinar
- Não enviar comunicação
- Não alterar feature flags / liberar outro tenant
- Não commit / push / deploy sem autorização humana
