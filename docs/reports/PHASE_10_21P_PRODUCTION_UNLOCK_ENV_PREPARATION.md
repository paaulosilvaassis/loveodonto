# PHASE_10.21P — PRODUCTION UNLOCK ENV PREPARATION

## Gate

**READY_TO_CONFIGURE_RAILWAY_UNLOCK_ENV**

> Auditoria apenas. **Nenhuma** env configurada pelo agente. **Nenhum** PUT.  
> `feature_flags` não alteradas. Estado permanece: global OFF · tenant ON · UX OFF.

---

## Entrega pedida

| Campo | Valor |
|-------|--------|
| **Environment variable** | `CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK=true` |
| **Railway project** | `kind-victory` (id `fec1bf91-53d8-4bc7-924e-2b91fbac3d1a`) |
| **Railway service** | `appgestaoodonto` (Admin API / `saas-admin-api`) |
| **Environment** | `production` (id `1fea99e1-f982-41e9-95ee-cf26aea643c7`) |
| **Restart/redeploy required** | **SIM** — env é lida no processo Node; Railway costuma redeployar ao salvar Variables |
| **Env alone activates production** | **NÃO** |
| **State before** | global=false · tenant=true · UX=false · other=0 |
| **Expected state after env** | **igual** (global=false · tenant=true · UX=false) até novo PUT autorizado |
| **Other required variables** | Nenhuma obrigatória além desta para o unlock server-side; frase humana continua obrigatória no PUT |
| **Risk** | Baixo se só a env for setada; risco sobe só se alguém repetir PUT com a frase sem revisão |
| **Instructions for Paulo** | ver seção abaixo |
| **Gate** | **READY_TO_CONFIGURE_RAILWAY_UNLOCK_ENV** |

---

## 1) Confirmação no código (variável exata)

No Railway Admin API (`server/lib/contractsOperationalRolloutApi.js`):

```js
function isProductionActivationUnlocked() {
  return parseBoolEnv(process.env.CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK)
    || parseBoolEnv(process.env.VITE_CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK);
}
```

Usada **somente** quando o PUT tenta `productionGlobalEnabled: true`.  
Se a env não for true → HTTP **403** `PRODUCTION_ACTIVATION_LOCKED` (exatamente o erro da STEP B).

Valores aceitos como true: `true` / `1` / `yes` / `on` (case-insensitive).

**Nome preferido (use este):**

```text
CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK=true
```

Alias opcional (mesmo efeito no servidor):

```text
VITE_CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK=true
```

Não é necessário setar os dois. Prefira o nome **sem** prefixo `VITE_` neste serviço Node.

---

## 2) Onde configurar

| Item | Valor confirmado por deploys/relatórios anteriores |
|------|-----------------------------------------------------|
| Host da API | `https://appgestaoodonto-production.up.railway.app` |
| `/health` service name | `saas-admin-api` |
| Projeto Railway | **kind-victory** |
| Serviço | **appgestaoodonto** |
| Environment | **production** |
| Root Directory do serviço | `server` |
| Link de referência (projeto) | `https://railway.com/project/fec1bf91-53d8-4bc7-924e-2b91fbac3d1a` |

**Não** configurar essa variável no Vercel do frontend para destravar o PUT da STEP B — o bloqueio 403 veio do **processo Node no Railway**.

---

## 3) O que a env faz / não faz

| Efeito | Sim/Não |
|--------|---------|
| Permite que um PUT autenticado + frase tente ligar o global | **SIM** |
| Liga `feature_flags` sozinha | **NÃO** |
| Liga `operationalUxEnabled` sozinha | **NÃO** |
| Habilita outro tenant | **NÃO** |
| Cria contrato / paciente / comunicação | **NÃO** |
| Altera dados clínicos | **NÃO** |

Fluxo completo ainda exige depois (fase seguinte, só com autorização):

1. env unlock = true  
2. JWT admin do tenant piloto  
3. PUT com `productionGlobalEnabled: true`  
4. `confirmationPhrase: ATIVAR_PRODUCAO_OPERATIONAL_UX`

---

## 4) Estado esperado logo após configurar a env (antes de qualquer PUT)

Continua:

```text
globalEnabled=false
tenantEnabled=true
operationalUxEnabled=false
otherTenantsEnabled=0
```

---

## 5) Instruções PARA LEIGO (Paulo) — Railway

Abra no navegador (logado na conta Railway do Love Odonto):

`https://railway.com/project/fec1bf91-53d8-4bc7-924e-2b91fbac3d1a`

### PASSO 1 — Abrir o projeto certo

**Onde clicar:**  
Entre em [railway.com](https://railway.com) → lista de projetos → projeto cujo nome contenha **kind-victory** (ou use o link acima).

**O que procurar:**  
Nome/identificador do projeto **kind-victory**.

**O que deve aparecer:**  
Tela do projeto com um ou mais serviços e um seletor de environment (ambiente).

### PASSO 2 — Selecionar o environment Production

**Onde clicar:**  
No topo/canto da tela do projeto, o seletor de environment / ambiente.

**O que procurar:**  
Texto **Production** / **production** (não Staging/Dev, se existirem).

**O que deve aparecer:**  
Environment ativo = production.  
Os serviços dessa environment ficam visíveis.

### PASSO 3 — Abrir o serviço da Admin API

**Onde clicar:**  
No card/lista de serviços, clique no serviço **appgestaoodonto**.

**O que procurar:**  
Nome **appgestaoodonto**.  
Se houver dúvida, o serviço correto é o que publica  
`appgestaoodonto-production.up.railway.app` e responde `/health` com `"service":"saas-admin-api"`.

**O que deve aparecer:**  
Painel do serviço (Deployments / Variables / Settings / Metrics — os nomes das abas podem variar um pouco).

### PASSO 4 — Abrir Variables

**Onde clicar:**  
Aba ou menu **Variables** (ou **Variáveis** / **Variables & Secrets**).

**O que procurar:**  
Lista de variáveis de ambiente já existentes do serviço.

**O que deve aparecer:**  
Tabela ou editor de pares `NOME` = `valor`.

### PASSO 5 — Criar/editar a variável

**Onde clicar:**  
Controle para adicionar variável — procure visualmente por textos como:

- **New Variable**
- **Add Variable**
- **Raw Editor**

**O que procurar / preencher exatamente:**

| Campo | Valor |
|-------|--------|
| Nome | `CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK` |
| Valor | `true` |

**O que deve aparecer:**  
A linha da variável na lista, sem espaços extras no nome.

**Não invente** o rótulo exato do botão de salvar se a UI mudar — procure botões/ações com sentido de:

- **Add** / **Save** / **Update** / **Deploy** / **Apply changes**

### PASSO 6 — Confirmar redeploy/restart

**O que procurar visualmente após salvar:**  
Railway costuma iniciar um novo deploy automaticamente ao mudar Variables. Olhe a aba **Deployments**:

- novo deployment **Building** / **Deploying** / **Success**  
- ou aviso pedindo aplicar mudanças / redeploy

Se **nada** acontecer após salvar, procure no serviço ações como **Restart** / **Redeploy** (não invento o rótulo exato — use o que existir na tela).

**Como saber que a API voltou:**  
No navegador ou terminal:

```text
https://appgestaoodonto-production.up.railway.app/health
```

Deve responder algo como `"ok": true` e `"service": "saas-admin-api"`.

### PASSO 7 — Parar (não ativar global)

**Não** abra o painel Love Odonto para digitar a frase ainda.  
**Não** peça ao agente para repetir o PUT ainda.

Avise no chat que a variável foi salva e o `/health` está OK.  
Aí a próxima fase valida só leitura:

- API online  
- GET autenticado 200  
- global=false · tenant=true · UX=false  

Só depois disso, com nova autorização, vem o retry da STEP B.

---

## 6) Outras variáveis

| Variável | Necessária agora? |
|----------|-------------------|
| `CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK=true` | **SIM** (Railway Admin API) |
| `VITE_CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK=true` | Opcional no servidor (alias). No Vercel, só afetaria UI do painel no build frontend — **não** desbloqueia o PUT da STEP B sozinha |
| Frase `ATIVAR_PRODUCAO_OPERATIONAL_UX` | Já autorizada; usada só no PUT futuro — **não** é variável Railway |

---

## HARD STOP

- Agente **não** configurou Railway  
- Agente **não** repetiu PUT  
- Estado SSOT permanece STEP A  

Aguardando Paulo configurar a env e confirmar `/health` OK.
