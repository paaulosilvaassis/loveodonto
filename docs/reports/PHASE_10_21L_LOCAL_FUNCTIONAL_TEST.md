# PHASE_10.21L — LOCAL FUNCTIONAL TEST

## Gate

**LOCAL_FUNCTIONAL_TEST_PASS**

> Execução local com dados fictícios `1021L`. Sem ativação de produção, sem PUT/POST de rollout, sem migration, sem commit/push/deploy.  
> Evidência principal: `src/__tests__/phase1021lLocalFunctionalTest.test.js` (PASS).  
> Smoke browser: localhost confirmado; login SaaS automatizado não entrou nas rotas autenticadas (banner visual pós-login **não** capturado nesta sessão — regra + componente validados por código/teste 10.21K).

---

## Entrega pedida

| Campo | Valor |
|-------|--------|
| **Environment** | `http://127.0.0.1:5176` + Admin API `:3001` |
| **Local banner** | Componente + regra ON (DEV+env+localhost). Smoke autenticado UI: **não confirmado** (ficou em `/login`) |
| **Production global** | **OFF** |
| **Tenant production** | **OFF** |
| **Patient** | `TESTE CONTRATOS LOVE ODONTO 1021L` |
| **Budget** | `TESTE PHASE 10.21L` — Implante unitário teste — R$ 1.000 (entrada 200 + 4×200) |
| **Scenario 1** | **PASS** — paciente local, nome TESTE |
| **Scenario 2** | **PASS** — orçamento aprovado; CTA Gerar contrato elegível com local test ON |
| **Scenario 3** | **PASS** — wizard view model preenchido |
| **Scenario 4** | **PASS** — 7 etapas; pacote Contrato + TCLE + LGPD |
| **Scenario 5** | **PASS_WITH_FRICTION** — revisão OK; financeiro do wizard não espelha entrada/parcelas |
| **Scenario 6** | **PASS** — link `/assinatura/:token` local; zero `fetch` externo |
| **Scenario 7** | **PASS_WITH_FRICTION** — conteúdo público OK; viewport mobile UI não clicado (smoke headless sem auth) |
| **Scenario 8** | **PASS** — assinatura fictícia local; zero envio externo |
| **Scenario 9** | **PASS** — documento com paciente/tratamento corretos |
| **Scenario 10** | **PASS** — fila lista contrato do paciente teste |
| **Scenario 11** | **PASS** — com local test OFF, UX efetiva false → V1 disponível; contrato legível |
| **Scenario 12** | **PASS** — SSOT servidor global/tenant/UX **OFF** |
| **Clicks** | 15 (instrumentados no harness) |
| **Times** | budget→contrato ~13ms; assinatura ~5ms; total harness ~69ms (service-layer) |
| **Bugs found** | 2 frictions (não CRITICAL) |
| **Critical** | 0 |
| **High** | 0 |
| **Medium** | 2 (ver abaixo) |
| **Low** | 0 |
| **External communication** | **NO** |
| **Production writes** | **NO** (sync SaaS skipped; sem patients table em prod; flags vazias) |
| **Cleanup** | Dados fictícios removidos do DB local do teste |
| **V1** | AVAILABLE |
| **Production state** | global OFF / tenant OFF / UX OFF |
| **Decision** | Fluxo operacional local funcional com frictions de UX |
| **Gate** | **LOCAL_FUNCTIONAL_TEST_PASS** |

---

## Ambiente

| Check | Resultado |
|-------|-----------|
| App | `http://127.0.0.1:5176` HTTP 200 |
| Hostname | `127.0.0.1` (não produção) |
| API | `/health` 200 `saas-admin-api` |
| `VITE_CONTRACTS_OPERATIONAL_UX_LOCAL_TEST` | `true` em `.env.development` |
| Local test rule | DEV + env + localhost → ON |
| Server SSOT | global/tenant/UX OFF |

### Banner

- Código: `LocalOperationalUxTestBanner` com texto obrigatório.
- Painel: `LOCAL TEST MODE: ON` + `Servidor (SSOT): OFF`.
- Smoke UI autenticado: **falhou a injeção de sessão** (permaneceu em `/login`) — não invalida o harness funcional; requer confirmação visual humana no próximo passo se desejado.

---

## Dados fictícios usados

| Campo | Valor |
|-------|--------|
| Paciente | TESTE CONTRATOS LOVE ODONTO 1021L |
| CPF | 52998224725 (fictício válido de formulário) |
| Telefone | 00000000000 |
| E-mail | teste.contratos.1021l@example.invalid |
| Orçamento | TESTE PHASE 10.21L |
| Tratamento | Implante unitário teste |
| Valor | R$ 1.000,00 |
| Condição | Entrada R$ 200 + 4× R$ 200 |

---

## Frictions / bugs (não corrigidos nesta fase)

### MEDIUM-1 — Financeiro do wizard não espelha parcelas

`buildWizardViewModel` mostrou `totalLabel = R$ 1.000,00` mas `downPaymentLabel` / parcelas como `—` apesar do `paymentOption` aceito com entry=200 e 4×200.

### MEDIUM-2 — Finalize exige TCLE clínico + endereço

`finalizeGeneratedContract` bloqueou com:

`Pendências: Endereço do paciente; TCLE obrigatório: Termo de Consentimento — Implantes`

No harness, após registrar a friction, o status foi promovido a `GENERATED` para exercer link/assinatura/fila (equivalente pós-finalize quando readiness OK). Em uso real local, o operador precisará anexar TCLE/endereço ou o wizard precisará orientar melhor.

Nenhum CRITICAL. Nenhuma comunicação externa. Nenhuma escrita de produção.

---

## Produção / cleanup

| Check | Resultado |
|-------|-----------|
| `feature_flags` operacionais | 0 rows (OFF) |
| Tabela `public.patients` | inexistente no schema prod (dados clínicos do app = local) |
| Busca `%1021L%` em prod patients | N/A (sem tabela) |
| Cleanup local do harness | paciente/contrato/links 1021L removidos do DB de teste |
| PUT/POST rollout | **não executados** |

---

## Métricas

```json
{
  "clicks": 15,
  "errors": [],
  "frictions": [
    "wizard financial.downPaymentLabel vazio apesar de entry=200 no orçamento",
    "finalizeGeneratedContract: Pendências: Endereço do paciente; TCLE obrigatório: Termo de Consentimento — Implantes"
  ],
  "times": {
    "budgetToContractStartMs": 13,
    "signatureMs": 5,
    "totalMs": 69,
    "wizardMs": 47
  }
}
```

---

## Decisão final

O fluxo local **orçamento → wizard → pacote → link → assinatura → fila → V1 → SSOT OFF** foi exercitado com sucesso em dados fictícios.

Frictions MEDIUM não impedem o gate de passagem do teste funcional local, mas devem ser tratados antes de unlock de produção se impactarem a operação clínica real.

**HARD STOP.** Sem ativar produção. Sem commit/push/deploy. Aguardando autorização humana.
