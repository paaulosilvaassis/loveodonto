# PHASE_10.21K — LOCALHOST-ONLY SAFE TEST MODE REPORT

## Gate

**READY_FOR_LOCAL_FUNCTIONAL_TEST**

> Mecanismo local implementado e validado. **Sem commit/push/deploy.**  
> **Sem teste funcional com paciente** nesta fase — aguardar autorização humana.

---

## Respostas obrigatórias

```
LOCAL_TEST_MODE_READY: YES
PRODUCTION_GLOBAL: OFF
TENANT_PRODUCTION: OFF
PRODUCTION_UX: OFF
LOCALHOST_TEST_UX: ON   # quando npm run dev + hostname localhost/127.0.0.1
REAL_COMMUNICATION_POSSIBLE: NO
CLINICAL_TEST_DATA_STAYS_LOCAL: YES
CAN_START_FUNCTIONAL_TEST: YES   # pronto; NÃO iniciado nesta fase
```

---

## Files changed

| Arquivo | Papel |
|---------|--------|
| `src/domain/contracts/rollout/contracts-operational-ux-local-test.ts` | **novo** — regra DEV + env + hostname |
| `src/services/contractsOperationalRolloutService.js` | UX efetiva OR bypass; snapshot SSOT separado |
| `src/services/contractSaasSyncService.js` | bloqueia sync SaaS no local test |
| `src/components/contracts/operational/LocalOperationalUxTestBanner.jsx` | **novo** — banner |
| `src/pages/BudgetsHubPage.jsx` | banner + rótulo teste local |
| `src/pages/contratos/ContractsRolloutPage.jsx` | Servidor OFF / LOCAL TEST MODE ON; mutações SSOT bloqueadas na UI |
| `src/pages/contratos/ContractsFilaPage.jsx` | banner |
| `src/index.css` | estilo do banner |
| `.env.development` | `VITE_CONTRACTS_OPERATIONAL_UX_LOCAL_TEST=true` |
| `.env.example` | documentação (comentado) |
| `package.json` | script `test:supabase:phase1021k` |
| `src/__tests__/phase1021kLocalOperationalUxTestMode.test.js` | **novo** — 15 testes |

---

## Local bypass rule

```
localTestEnabled =
  import.meta.env.DEV === true
  && VITE_CONTRACTS_OPERATIONAL_UX_LOCAL_TEST === "true"
  && ["localhost", "127.0.0.1"].includes(hostname)
  && !forbiddenProductionHostname(hostname)
```

Forbidden: `loveodonto.com.br`, `www.loveodonto.com.br`, `*.vercel.app`.

Efeito: `isOperationalContractsUxEnabledForCurrentClinic` pode retornar `true` **sem** mutar o estado SSOT.  
Se modo for `V1_ONLY` ou `ROLLED_BACK`, o bypass **não** força UX.

---

## Hostname protection

PASS — só `localhost` / `127.0.0.1`; bloqueio explícito de produção e Vercel.

## Environment protection

PASS — flag só em `.env.development` (não em produção).  
Build prod: `import.meta.env.DEV` inlined como `false` (`return!1`).

## Production flags

Não alteradas. Snapshot servidor continua reportando global/tenant/UX **OFF**.

## Supabase writes

- Paciente/orçamento/contrato/link do fluxo V1 operacional: IndexedDB local (`appgestaoodonto.dev.db`).
- `syncGeneratedContractToSaas` → **skipped** com `reason: local_operational_ux_test` quando local test ON.
- Nenhum PUT/POST de rollout pelo bypass.

## External communication

Audit reconfirmado no caminho operacional:

| Etapa | Envio real? |
|-------|-------------|
| Pacote / wizard | Não |
| `sendContractForSignature` | Não (só IndexedDB + toast simulação) |
| Página `/assinatura` | Não |
| Assinatura | Não |
| Providers V2 e-mail/SMS | Simulados / fora deste fluxo |

**REAL_COMMUNICATION_POSSIBLE: NO** (caminho operacional V1 local).

## V1 fallback

PASS — com server OFF e local test OFF, hub segue V1.  
Com local test ON, wizard disponível; V1 clássico permanece no código.

## Tests

| Suite | Resultado |
|-------|-----------|
| `phase1021k` | **15/15 PASS** |
| `phase1021c` | **7/7 PASS** |
| `phase1020` | **16/16 PASS** |

## Build

`npm run build` → **PASS** (produção; DEV=false no bundle).

## Local visual validation

- Config pronta: `.env.development` com flag `true`.
- Banner + painel exibem `LOCAL TEST MODE: ON` e `Servidor: OFF` quando a regra completa estiver ativa.
- Confirmação visual no browser: abrir `http://localhost:5176` após `npm run dev` (não iniciado o teste funcional com paciente nesta fase).

## Production active

**NO**

## Risks

| Risco | Mitigação |
|-------|-----------|
| Confundir teste local com produção | Banner + hostname + DEV |
| Sync SaaS espelhar contrato | Bloqueado no local test |
| Assinatura só no mesmo browser | Limitação V1 IndexedDB (já conhecida) |
| Flag em `.env.local` acidental no build | DEV=false no prod build ainda bloqueia |

## Blockers

Nenhum para o **mecanismo**.  
Teste funcional com paciente fictício: **aguardando autorização** (hard stop).

---

## Entrega

| Campo | Valor |
|-------|--------|
| **Files changed** | ver tabela acima |
| **Local bypass rule** | DEV ∧ env ∧ localhost |
| **Hostname protection** | PASS |
| **Environment protection** | PASS |
| **Production flags** | OFF / intactas |
| **Supabase writes** | clínicos do fluxo → local; sync SaaS bloqueado |
| **External communication** | NO no caminho operacional |
| **V1 fallback** | AVAILABLE |
| **Tests** | PASS (1021k/1021c/1020) |
| **Build** | PASS |
| **Local visual validation** | config ON; browser smoke do paciente **não** executado |
| **Production active** | NO |
| **Risks** | baixos / mitigados |
| **Blockers** | nenhum no modo; teste funcional aguarda OK humano |
| **Gate** | **READY_FOR_LOCAL_FUNCTIONAL_TEST** |

---

**HARD STOP.** Sem commit, sem push, sem paciente fictício até autorização.
