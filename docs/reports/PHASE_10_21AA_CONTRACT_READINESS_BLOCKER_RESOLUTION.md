# PHASE_10.21AA — CONTRACT READINESS BLOCKER RESOLUTION

**Gate:** `BLOCKED` (Gerar contrato PASS; E2E completo ainda incompleto)  
**Production writes / migrations / rollout:** **ZERO**  
**Commit / push / deploy:** **NÃO**

---

## SSOT `canGenerate`

| Camada | Arquivo / função |
|--------|------------------|
| UI | `ClinicalContractSection.jsx` — `canGenerate = contractAccessible && generateReadiness.ready && !linkedContract && contractReadiness.canGenerate` |
| Gate pré-checklist | `resolveContractGenerateReadiness` (mesmo arquivo) — pendingCritical / professionalId / clinicForumCity |
| Checklist jurídico | `getContractReadinessChecklist` → `validateContractGeneration({ strict: true })` |
| Variáveis | `resolveContractVariables` (`contractVariableResolver.js`) |
| TCLE | `validateRequiredTcles` (`contractTcleRegistry.js`) + `resolveAttachedTcleIdsFromClinicalDocuments` |

`contractReadiness.canGenerate === result.ok` (nenhum `missing` crítico).

---

## Readiness capturado (antes da resolução)

`canGenerate: false`

Missing (ordem):

1. Endereço / cidade / UF / foro da clínica  
2. Endereço do paciente  
3. Nome + CRO do responsável técnico  
4. Forma de pagamento (orçamento sem condição escolhida / não aprovado no smoke parcial)  
5. TCLE `tcle_implante`

`generateReadinessReasons`: cadastro paciente incompleto (`phone`, `address_min`) + foro clínico ausente.

---

## Classificação

| Pendência | Classe | Ação |
|-----------|--------|------|
| Endereço/foro clínica | **A** | Seed staging fictício (`ensureStagingFictionalClinicContractPrereqs`) — equivale a preencher `/admin/dados-clinica` |
| CRO responsável técnico | **A** | Idem (cadastro clínica) |
| CRO colaborador atendimento | **A** | Seed staging em colaboradores sem CRO (necessário para salvar TCLE) |
| Endereço/telefone paciente | **A** | UI cadastro (Endereços / Telefones) |
| Forma de pagamento | **A** | UI Orçamento: apresentar → marcar escolhida → aprovar |
| TCLE Implantes | **B** | UI Documentos → Consentimentos → Implante → Salvar (após aprovação) |

**Hydrate (C):** não — campos realmente vazios.  
**Identidade (D):** não — IDs propagados.  
**Regra legada (E):** não.

---

## Dependência circular?

**NÃO.**

Ordem válida:

1. Aprovar orçamento  
2. Documentos liberados (`budgetApproved`)  
3. Resolver TCLE  
4. `canGenerate=true`  
5. Gerar contrato  

TCLE **não** exige contrato já gerado para anexar via Documentos.

---

## Fix

- `ensureStagingFictionalClinicContractPrereqs.js` + bootstrap em `main.jsx` / `StagingTestModeBanner`  
- Resolução paciente/pagamento/TCLE via UI oficial no smoke  
- **Sem** bypass de `canGenerate`

---

## Retest

`CONTRACT_GENERATE_RETEST = PASS`  
`canGenerateAfter = true`  
`Gerar contrato` enabled + clique abre `GenerateContractModal` (“Pronto para gerar contrato”).

---

## Próximo bloqueio

Modal pós-clique: CTA **Gerar rascunho** (`GenerateContractModal`) — fluxo draft/finalize ainda não fechado no E2E.

---

## Segurança

| Item | Valor |
|------|-------|
| Browser/API project | `tckdjyunwmdpqmewrwvt` |
| Production project | `uoepkwhqztmsjnzirpev` (não usado) |
| Production writes | ZERO |
| Migrations / rollout | ZERO |
| Paciente real / WhatsApp / e-mail / SMS | ZERO |

---

## Testes / Build

- `phase1021aaContractReadinessBlockerResolution.test.js` PASS  
- 10.21Z / X / V / U / R + contract prerequisites PASS (62)  
- `npm run build` PASS  

Artefatos: `_phase1021aa_readiness_capture.json`, `_phase1021aa_generate_retest.json`, `_phase1021aa_next_blocker.json`
