# PHASE_10.21J — SAFE FUNCTIONAL TEST PREPARATION REPORT

## Gate

**BLOCKED_BEFORE_FUNCTIONAL_TEST**

> Auditoria + preparação apenas. **Nenhuma ativação**, **nenhum PUT**, **nenhuma alteração de `feature_flags`**, **nenhum commit/push/deploy**, **nenhuma alteração de código**.

---

## SAFETY GATE (obrigatório)

```
SAFE_TEST_ENVIRONMENT: LOCALHOST
PRODUCTION_GLOBAL: OFF
TENANT_PRODUCTION: OFF
REAL_PATIENT: NO
REAL_COMMUNICATION: NO
MIGRATION: NO
SCHEMA_CHANGE: NO
V1_FALLBACK: AVAILABLE
RISK_OF_REAL_PATIENT_IMPACT: LOW
CAN_START_MANUAL_TEST: NO
```

### Por que CAN_START_MANUAL_TEST = NO

O CTA **Gerar / Continuar contrato** (wizard operacional) só aparece se `operationalUxEnabled === true`.

Hoje, em produção e via Admin API local apontando para o Supabase de produção:

- `feature_flags` SSOT → global OFF + tenant OFF → `operationalUxEnabled = false`
- No localhost, o hub (`BudgetsHubPage`) faz hydrate com `fetchContractsOperationalRolloutFromServer`
- Se a sessão SaaS + Admin API local respondem 200, o client grava `source: 'feature_flags'` e **desliga** a UX operacional
- Resultado: o botão **Gerar contrato** do wizard **não aparece**
- Ligar flags em produção é **proibido** nesta fase
- Alterar código para bypass de dev é **proibido** nesta fase

**Blocker:** sem um desbloqueio autorizado (bypass local seguro **ou** ambiente staging isolado **sem** liberar produção), o teste funcional do fluxo operacional completo **não pode começar** de forma estável e leiga.

---

## 1. Ambiente escolhido (comparativo)

| Opção | CTA wizard | Assinatura V1 | Liberar UX a pacientes reais? | Cobertura |
|-------|------------|---------------|-------------------------------|-----------|
| **A) localhost/dev** | Idealmente ON via `local_cache` | Mesmo browser/IndexedDB | Não (se não PUT flags) | Alta |
| **B) produção rollout OFF** | OFF | Só V1 clássico | Não | Baixa (sem wizard) |
| **C) produção tenant ON / global OFF** | OFF (`global && tenant`) | — | Toca SSOT | Inútil + arriscado |
| **D) harness/staging V2** | Não é o CTA do hub | `/assinar/v2` | Baixo se staging | Fluxo técnico, não o operacional |

**Escolha: A — LOCALHOST** (mais seguro para o maior número de etapas **quando** o CTA estiver acessível sem tocar produção).

Motivos:

- Paciente/orçamento/contrato/link ficam no IndexedDB local (`appgestaoodonto.dev.db`)
- Fila V1 **não** envia WhatsApp/e-mail real (só gera link + toast de simulação)
- Não exige (e não deve) ligar global/tenant em produção
- Assinatura pública V1 funciona na **mesma origem/browser**

**Estado atual:** escolha correta, mas **bloqueada** pelo hydrate SSOT OFF (ver acima).

---

## 2. Fluxo encontrado (auditoria)

### 2.1 CTA “Gerar / Continuar contrato”

| Item | Evidência |
|------|-----------|
| Página | `/orcamentos` → `BudgetsHubPage.jsx` |
| Card | `BudgetHubCard.jsx` / `BudgetHubListView.jsx` |
| Labels | `resolveBudgetContractCta` / `resolveHubContractAction` |
| Clique | `handleGenerateContract` → abre `OperationalContractWizard` |

**Condições para aparecer “Gerar contrato”:**

1. `operationalUxEnabled === true`
2. Orçamento `APROVADO`
3. Sem `contractId`
4. `contractAction.action === 'generate'`

**Condições para “Continuar contrato”:**

1. `operationalUxEnabled === true`
2. Já existe `contractId`
3. action `continue` ou `resolve`

**Exige `operationalUxEnabled`?** **SIM.**  
Se OFF, o clique cai no V1 clássico (`openExistingBudgetRow(..., 'contratos')`) — **sem wizard**.

### 2.2 Como `operationalUxEnabled` é calculado

`isOperationalContractsUxEnabled` (`contracts-operational-mode.ts`):

- Se `source === 'feature_flags'`: precisa **global ON e tenant ON** (ou allowlist)
- Se `source === 'local_cache'` e **não** é runtime de produção: `mode === OPERATIONAL_UX` basta
- Default local: `mode: OPERATIONAL_UX`, global/tenant false, `source: local_cache`

### 2.3 Paciente fictício

- Cadastro no app (nome, sexo, nascimento, CPF)
- Persistência: IndexedDB local (não migration)
- Prefixo obrigatório no nome (ver dados de teste)

### 2.4 Orçamento fictício

1. Jornada do paciente → atendimento clínico ativo
2. `/orcamentos` → Criar novo orçamento → `StartPatientBudgetModal`
3. Preencher procedimentos + pagamento
4. Aprovar orçamento (`APROVADO`)
5. Voltar ao hub → CTA (se UX ON)

### 2.5 Wizard → pacote Contrato + TCLE + LGPD

- Componente: `OperationalContractWizard.jsx`
- Steps: Dados → Tratamento → Financeiro → Documentos → Signatários → Revisão → Assinatura
- Pacote: `buildDocumentPackageForBudget` (Contrato + TCLE + LGPD)
- Etapa Documentos abre `GenerateContractModal` → rascunho V1 (`createContractDraft` / `finalizeGeneratedContract`)
- Progresso: IndexedDB `operationalContractWizardProgress`
- Financeiro no wizard: **somente leitura**

### 2.6 Link público

- **Não** no wizard — na **Fila** (`ContractsFilaPage`)
- CTA send → `sendContractForSignature` (`contractModuleService.js`)
- Gera token `csgn…`, status contrato `SENT`
- URL: `/assinatura/{token}`
- Toast: simulação — **sem** envio externo automático

### 2.7 Persistência de link/token

| Dado | Onde |
|------|------|
| Token/link | IndexedDB `contractSignLinks` |
| Contrato | IndexedDB `generatedContracts` |
| Assinatura/evidência | `contractSignatures`, `contractEvents` |
| Rollout cache | `localStorage` `loveodonto.contracts.operationalRollout.v1` |
| SSOT prod | Supabase `feature_flags` (não alterar neste teste) |

**Importante:** a página `/assinatura/:token` lê o IndexedDB do **mesmo browser/origem**. Celular/outro host **não** vê o token local.

### 2.8 Página pública de assinatura

`ContractSignPublicPage.jsx`: summary → document → privacy → sign → `signContractViaLink`.

### 2.9 Depois da assinatura

- Contrato → `SIGNED`
- Link → `signed`
- Imagem da assinatura pode ir para arquivos do paciente (local)
- Fila mostra Baixar/Ver
- **Não** cria financiamento automaticamente neste caminho

### 2.10 Comunicação real?

| Caminho | Envio real? |
|---------|-------------|
| Fila `sendContractForSignature` | **Não** |
| Providers V2 / `sendSignatureEmail` | **Simulado** |
| WhatsApp automático deste fluxo | **Não** |

Risco residual: alguém **copiar** o link e colar no WhatsApp manualmente — **não fazer**.

### 2.11 Side-effects (financeiro / agenda / prontuário)

| Área | Impacto no fluxo operacional |
|------|------------------------------|
| Financeiro | Wizard não cria parcelas; **não** clicar “Ver financeiro” / gerar financiamento |
| Agenda | Não cria consulta; só exige atendimento já iniciado |
| Prontuário/arquivos | Leve: contrato/assinatura no armazenamento local do paciente |
| Sync SaaS | `syncGeneratedContractToSaas` pode espelhar contrato se SaaS ON — risco residual no localhost com backend apontando produção |

### 2.12 Limpeza dos dados fictícios

1. Identificar pelo nome `TESTE CONTRATOS LOVE ODONTO — PHASE 10.21J`
2. DevTools → Application → IndexedDB (`appgestaoodonto.dev.db`) → remover paciente/contratos/links relacionados **ou** reset dev se disponível
3. Limpar cache de rollout local se necessário: chave `loveodonto.contracts.operationalRollout.v1`
4. **Não** usar rollback de produção como “limpeza de paciente”

---

## 3. Dados fictícios (inequívocos)

| Campo | Valor |
|-------|--------|
| Paciente | `TESTE CONTRATOS LOVE ODONTO — PHASE 10.21J` |
| E-mail | `teste.contratos.1021j@example.invalid` |
| Telefone | `00000000000` (não usar número real; não disparar WhatsApp) |
| CPF | CPF de teste válido só para passar validação de formulário (não de pessoa real) |
| Orçamento / plano | `TESTE PHASE 10.21J` |
| Observação interna | Sempre incluir `PHASE_10.21J` |

**Nunca** reutilizar paciente real.  
**Nunca** enviar link por WhatsApp/e-mail real.

---

## 4. Como subir localhost (para quando o teste for liberado)

| Item | Valor |
|------|--------|
| Pasta | `/Users/pauloassis/Desktop/appgestaoodonto-main/appgestaoodonto` |
| Comando | `npm run dev` |
| App URL | `http://localhost:5176` |
| API local | `http://127.0.0.1:3001/health` → deve responder ok |
| Login | Usuário master/admin da clínica de teste (sessão local do app) |

### Como confirmar que NÃO está em produção

Checklist visual:

1. A barra de endereço começa com **`http://localhost:5176`** (não `loveodonto.com.br`)
2. Se abrir `https://www.loveodonto.com.br` → **PARE** — isso é produção
3. No console do terminal do `npm run dev` aparece app em porta **5176**
4. (Opcional) DevTools → Application → Storage key contém `appgestaoodonto.dev.db`

---

## 5. Roteiro manual para leigo

> **NÃO EXECUTE AINDA.**  
> Só após nova autorização e gate `READY_FOR_SAFE_FUNCTIONAL_TEST`.  
> Se em qualquer passo o endereço NÃO for `localhost:5176`, **PARE**.

### PASSO 0 — Conferir ambiente

**Onde clicar:** abrir o navegador Chrome.  
**O que preencher:** na barra de endereço, digitar exatamente `http://localhost:5176`  
**O que deve aparecer:** tela de login do Love Odonto em localhost.  
**Se aparecer algo diferente:** se for `loveodonto.com.br` → **PARE**.

### PASSO 1 — Login

**Onde clicar:** campos de e-mail/senha → Entrar.  
**O que preencher:** login master/admin da clínica de teste.  
**O que deve aparecer:** tela inicial do app.  
**Se aparecer algo diferente:** erro de login → **PARE** e avise.

### PASSO 2 — Confirmar que a UX operacional está acessível (gate visual)

**Onde clicar:** menu → Orçamentos (`/orcamentos`).  
**O que preencher:** nada.  
**O que deve aparecer:** texto de ajuda mencionando **Gerar contrato** no card (modo operacional).  
**Se aparecer algo diferente:** só linguagem V1 clássica e nenhum botão **Gerar contrato** em orçamento aprovado → **PARE** (blocker do hydrate ainda ativo).

### PASSO 3 — Criar paciente fictício

**Onde clicar:** Pacientes → Cadastro → Novo.  
**O que preencher:**

- Nome: `TESTE CONTRATOS LOVE ODONTO — PHASE 10.21J`
- E-mail: `teste.contratos.1021j@example.invalid`
- Telefone: `00000000000`
- Demais campos obrigatórios com dados fictícios

**O que deve aparecer:** paciente salvo com esse nome.  
**Se aparecer algo diferente:** se o nome for de paciente real → **PARE** e não salve.

### PASSO 4 — Iniciar atendimento / jornada

**Onde clicar:** Gestão comercial → Jornada do paciente → iniciar atendimento para o paciente de teste.  
**O que preencher:** conforme tela (paciente de teste).  
**O que deve aparecer:** atendimento clínico ativo.  
**Se aparecer algo diferente:** erro de sessão inativa → **PARE** e refaça o atendimento.

### PASSO 5 — Criar orçamento fictício

**Onde clicar:** Orçamentos → Criar novo orçamento → escolher o paciente de teste.  
**O que preencher:** procedimentos de teste; nome/plano contendo `TESTE PHASE 10.21J`.  
**O que deve aparecer:** orçamento em edição.  
**Se aparecer algo diferente:** orçamento ligado a paciente real → **PARE**.

### PASSO 6 — Aprovar orçamento

**Onde clicar:** no atendimento/orçamento, ação de **Aprovar**.  
**O que preencher:** nada crítico.  
**O que deve aparecer:** status **Aprovado**.  
**Se aparecer algo diferente:** se pedir gerar financeiro/financiamento → **não clique**; só aprove o orçamento.

### PASSO 7 — Gerar contrato (wizard)

**Onde clicar:** Orçamentos → card do orçamento de teste → botão **Gerar contrato**.  
**O que preencher:** nada ainda.  
**O que deve aparecer:** assistente (wizard) com passos Dados / Tratamento / …  
**Se aparecer algo diferente:** abrir só a tela antiga de contratos (V1) sem wizard → **PARE** (UX operacional OFF).

### PASSO 8 — Percorrer o wizard até Documentos

**Onde clicar:** Avançar em Dados → Tratamento → Financeiro → Documentos.  
**O que preencher:** revisar dados; no Financeiro **apenas ler** (não alterar valores).  
**O que deve aparecer:** pacote documental com Contrato + TCLE + LGPD.  
**Se aparecer algo diferente:** erro bloqueando avanço → anote a mensagem e **PARE**.

### PASSO 9 — Gerar o documento do contrato

**Onde clicar:** na etapa Documentos, gerar/finalizar o contrato (modal “Gerar contrato”).  
**O que preencher:** o mínimo pedido pelo modal (sem dados reais de paciente).  
**O que deve aparecer:** contrato gerado/finalizado com sucesso.  
**Se aparecer algo diferente:** pedido para enviar e-mail/WhatsApp real → **cancele** e **PARE**.

### PASSO 10 — Ir para a fila

**Onde clicar:** no wizard, **Ir para fila de assinaturas** (ou menu Contratos → Fila).  
**O que preencher:** nada.  
**O que deve aparecer:** contrato do paciente de teste na fila.  
**Se aparecer algo diferente:** fila vazia → **PARE** e verifique se o contrato foi gerado.

### PASSO 11 — Gerar link público (sem enviar)

**Onde clicar:** CTA de enviar/gerar link na fila.  
**O que preencher:** nada.  
**O que deve aparecer:** mensagem de que o link foi gerado (**simulação**).  
**Se aparecer algo diferente:** se o app abrir WhatsApp/e-mail externo → **PARE** imediatamente.

### PASSO 12 — Abrir assinatura no mesmo computador

**Onde clicar:** abrir o link `/assinatura/...` em **nova aba do mesmo Chrome** (mesmo `localhost:5176`).  
**O que preencher:** nada ainda.  
**O que deve aparecer:** página pública de assinatura do contrato de teste.  
**Se aparecer algo diferente:** “link inválido”/vazio → **PARE** (não use celular/outro navegador neste teste V1 local).

### PASSO 13 — Assinatura fictícia

**Onde clicar:** avançar resumo → documento → privacidade → assinar.  
**O que preencher:** marcar consentimentos pedidos; desenhar assinatura fictícia (`TESTE 10.21J`).  
**O que deve aparecer:** sucesso / contrato assinado.  
**Se aparecer algo diferente:** qualquer envio externo → **PARE**.

### PASSO 14 — Confirmar fila/status

**Onde clicar:** voltar à Fila de contratos.  
**O que preencher:** nada.  
**O que deve aparecer:** status assinado; opção Ver/Baixar.  
**Se aparecer algo diferente:** status não mudou → anote e **PARE**.

### PASSO 15 — Confirmar V1 fallback intacto (sem desligar produção)

**Onde clicar:** não mexer em `/gestao/contratos/rollout` de produção.  
**O que preencher:** nada.  
**O que deve aparecer:** produção continua OFF (não ativar nada).  
**Se aparecer algo diferente:** qualquer botão de “ligar produção/global/tenant” → **NÃO CLIQUE** e **PARE**.

### PASSO 16 — Limpeza

**Onde clicar:** localizar o paciente `TESTE CONTRATOS LOVE ODONTO — PHASE 10.21J` e remover dados de teste (ou pedir suporte técnico para limpar IndexedDB local).  
**O que preencher:** nada em produção.  
**O que deve aparecer:** paciente/contratos de teste removidos do ambiente local.  
**Se aparecer algo diferente:** se estiver em `loveodonto.com.br` → **PARE**.

---

## 6. Riscos

| Risco | Nível | Mitigação |
|-------|-------|-----------|
| Hydrate SSOT OFF esconde CTA | **Alto (blocker)** | Não iniciar teste até desbloqueio autorizado |
| Confundir localhost com produção | Médio | Checklist da barra de endereço |
| Sync SaaS espelhar contrato | Baixo–médio | Não usar produção; preferir falha de sync em dev |
| Envio manual de link por WhatsApp | Médio | Proibido no roteiro |
| Assinatura em outro device | Alto (quebra o teste) | Só mesma origem/browser |
| Gerar financiamento sem querer | Médio | Não clicar financeiro |

---

## 7. Blockers

1. **Hydrate SSOT:** GET autenticado com flags OFF desliga `operationalUxEnabled` no localhost → CTA wizard ausente.
2. **Proibido nesta fase:** PUT/ativar flags, alterar código, push/deploy.
3. **Assinatura V1 multi-device:** depende de IndexedDB local.
4. **Sem roteiro de delete paciente óbvio na UI** — cleanup manual no storage local.

### O que precisaria (próxima fase — só com autorização)

Uma destas opções (escolher depois; **não implementar agora**):

- **Opção 1:** bypass de desenvolvimento: em `import.meta.env.DEV`, se SSOT vier OFF, manter `local_cache` + `OPERATIONAL_UX` sem gravar flags.
- **Opção 2:** ambiente staging isolado (Supabase staging + API staging) com hydrate que não force OFF o modo local de teste.
- **Opção 3:** autorização explícita para teste controlado em produção com tenant ON (fora do escopo seguro atual).

---

## 8. Estado de produção (confirmado / não alterar)

| Item | Estado |
|------|--------|
| Railway commit operacional | `a7e929b` |
| globalEnabled | **false** |
| tenantEnabled | **false** |
| operationalUxEnabled | **false** |
| V1 fallback | intacto |
| Contracts V2 técnico/harness | OFF |
| Produção operacional ativada | **NO** |
| Migration / schema / RLS / bucket | **não alterados** |

---

## 9. Decisão final

| Campo | Valor |
|-------|--------|
| Ambiente escolhido | **LOCALHOST** |
| Fluxo encontrado | Hub orçamentos → wizard → pacote → fila → `/assinatura/:token` → IndexedDB |
| Dados fictícios | definidos (paciente/orçamento PHASE 10.21J) |
| Riscos | hydrate blocker; sync SaaS; confusão prod |
| Roteiro manual | preparado (não executar ainda) |
| Blockers | CTA operacional inacessível sem bypass/flags |
| Estado de produção | OFF / OFF / OFF |
| **Gate** | **BLOCKED_BEFORE_FUNCTIONAL_TEST** |

---

## Entrega

**PHASE_10.21J — SAFE FUNCTIONAL TEST PREPARATION**

Aguardando autorização humana para:

1. desbloquear o acesso ao CTA em localhost de forma segura, **ou**
2. autorizar outro caminho explícito.

**Não iniciar o teste manual até novo gate.**
