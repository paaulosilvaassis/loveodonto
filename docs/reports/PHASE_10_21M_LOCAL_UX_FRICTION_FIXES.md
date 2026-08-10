# PHASE_10.21M — LOCAL UX FRICTION FIXES

## Gate

**READY_FOR_FIRST_REAL_PRODUCTION_PILOT**

> Correções locais de fricção UX apenas. Sem migration, sem feature_flags, sem ativação de produção, sem commit/push/deploy.

---

## Entrega pedida

| Campo | Valor |
|-------|--------|
| **Status** | DONE |
| **Fix financial review** | **PASS** — revisão espelha total / entrada / saldo / parcelas / valor da parcela / forma |
| **Fix prerequisites** | **PASS** — pendências antecipadas com CTAs (regras de finalize intactas) |
| **Tests** | phase1016–1018, 1020, 1021c, 1021k, **1021m** PASS |
| **Scenario 5 retest** | **PASS** (entrada/saldo/4×200 espelhados) |
| **Scenario 7 retest** | **PASS_WITH_FRICTION** (conteúdo financeiro OK; viewport mobile visual ainda smoke) |
| **Build** | **PASS** |
| **Production active** | **OFF** |
| **Tenant production** | **OFF** |
| **V1** | **INTACT** |
| **Risks** | Baixo — alias `entry`↔`downPayment` em leitura; sem mudança de schema/rollout |
| **Blockers** | Nenhum para unlock controlado; smoke UI autenticado do banner ainda recomendado |
| **Gate** | **READY_FOR_FIRST_REAL_PRODUCTION_PILOT** |

---

## FIX 1 — Revisão financeira

### Causa raiz

A condição aceita do orçamento usava `paymentOptions[].entry`, enquanto o resolver/`buildWizardViewModel` lia só `downPayment` / `financialSnapshotJson.entrada`. Sem receivables gerados, parcelas também não apareciam.

### Correção

- Alias de leitura `entry ?? downPayment` no bridge / resolver / schedule (sem recalcular valores).
- `resolveWizardFinancialDisplay`: usa snapshot do contrato quando válido; senão dados já gravados no orçamento aceito.
- UI da revisão (`FinancialSummary`): total, entrada, saldo, nº de parcelas, valor da parcela, forma de pagamento.
- Label amigável para `type: 'installments'`.

### Evidência (R$ 1.000 / entrada 200 / saldo 800 / 4×200)

```
view.financial.totalLabel → R$ 1.000,00
view.financial.downPaymentLabel → R$ 200,00
view.financial.balanceLabel → R$ 800,00
view.financial.installmentCount → 4
view.financial.installmentValueLabel → R$ 200,00
```

---

## FIX 2 — Pré-requisitos de finalização

### Auditoria

`finalizeGeneratedContract` continua exigindo (strict):

- Endereço do paciente
- TCLE obrigatório conforme tratamento (ex.: Implantes)

Regras **não removidas**.

### Correção

- `listWizardFinalizePrerequisites` reutiliza `validateContractGeneration({ strict: true })`.
- Painel no wizard (Documentos + Revisão): **“Antes de finalizar, complete:”**
- CTAs: **Corrigir dados** / **Adicionar documento**
- Bloqueio de avanço/gerar documentos enquanto houver pendências.
- Etapa Revisão fica `ready: false` até resolver.

---

## Testes

| Suite | Resultado |
|-------|-----------|
| phase1016 | PASS (22) |
| phase1017 | PASS (16) |
| phase1018 | PASS (12) |
| phase1020 | PASS (16) |
| phase1021c | PASS (7) |
| phase1021k | PASS (15) |
| phase1021m | PASS (7) |
| phase1021l (cenários 5/7) | scenario5 **PASS**; scenario7 **PASS_WITH_FRICTION** (viewport) |
| `npm run build` | PASS |

Arquivo: `src/__tests__/phase1021mLocalUxFrictionFixes.test.js`

Cobertura pedida:

1. revisão mostra entrada — PASS  
2. revisão mostra saldo — PASS  
3. revisão mostra quantidade de parcelas — PASS  
4. revisão mostra valor da parcela — PASS  
5. ausência de endereço → pendência antecipada — PASS  
6. ausência de TCLE → pendência antecipada — PASS  
7. finalização com requisitos — PASS  
8. V1 intacto — PASS  
9. produção OFF — PASS  

---

## Arquivos tocados

- `src/services/operationalContractWizardSupport.js` (novo)
- `src/services/operationalContractWizardService.js`
- `src/components/contracts/operational/OperationalContractWizard.jsx`
- `src/contracts/operationalUxMessages.js`
- `src/services/clinicalBudgetContractBridge.js`
- `src/contracts/contractVariableResolver.js`
- `src/components/clinical/contract/clinicalContractSchedule.js`
- `src/components/clinical/budget/budgetUtils.js`
- `src/index.css`
- `src/__tests__/phase1021mLocalUxFrictionFixes.test.js`
- `src/__tests__/phase1021lLocalFunctionalTest.test.js` (assert scenario 5)
- `package.json` (`test:supabase:phase1021m`)

---

## Produção / V1 / local test

| Check | Estado |
|-------|--------|
| Production global | OFF |
| Tenant production | OFF |
| Operational UX server SSOT | OFF |
| Local test mode | PRESERVADO |
| V1 hub/pendentes/public sign | PRESERVADOS |
| feature_flags / PUT rollout | NÃO ALTERADOS |
| Migration / schema / RLS | NÃO ALTERADOS |

---

## Decisão

Fricções MEDIUM da 10.21L corrigidas em localhost. Fluxo pronto para o **primeiro pilot de produção real** sob unlock controlado humano.

**HARD STOP.** Sem ativar produção. Sem commit/push/deploy. Aguardando autorização humana.
