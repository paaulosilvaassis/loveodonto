# Módulo de Precificação Nativo – LoveOdonto

## Resumo

A precificação deixou de ser um app externo (iframe/Next.js) e passou a ser um **módulo nativo** do LoveOdonto: mesmo login, mesma base de dados, mesmo layout (sidebar, header, tema) e mesma navegação.

---

## 1. Rotas

### Antes
- `/admin/precificacao` → página que carregava um **iframe** apontando para app externo (ex.: `http://localhost:3000?embed=loveodonto`).
- `/gestao-comercial/base-de-preco/precificar` → mesma página com iframe.
- Comunicação via `postMessage` e variáveis de ambiente `VITE_PRICING_APP_URL` e `VITE_PRICING_EMBED_TOKEN`.

### Depois
- **`/admin/precificacao`** → componente **PrecificacaoPage** (módulo nativo), dentro do Layout do LoveOdonto.
- **`/gestao-comercial/base-de-preco/precificar`** → também **PrecificacaoPage**.
- **`/admin/base-precos/precificar`** → redireciona para `/admin/precificacao`.
- Não há mais iframe, URL externa nem segundo app.

---

## 2. Layout compartilhado

- Todas as telas de precificação são renderizadas **dentro do Layout** do LoveOdonto (`src/components/Layout.jsx`):
  - Sidebar com categorias e itens de menu (incluindo "Precificação" em Administração).
  - Topbar com botão Voltar, nome do usuário e "Paciente +".
  - Conteúdo em `<main className="page">` com os tabs do módulo.
- Componentes de UI usados: **Card**, **SectionCard**, **Input**, **Tabs**, **Button** (classes `button primary/secondary`) do design system do projeto.
- Estilos: `index.css` e classes existentes (`.page-section`, `.section-title`, `.form-row`, `.table`, etc.).

---

## 3. Auth, permissões e contexto

- **Auth**: apenas a do LoveOdonto (`AuthContext`, `RequireAuth`, `RequireRole`). Não existe auth própria da precificação.
- **Permissões**: rota `/admin/precificacao` (e `/gestao-comercial/base-de-preco`) usa `withRole` com `routeAccessMap()` (ex.: `admin`, `gerente`), definido em `menuConfig.js`.
- **Multi-clínica**: dados de precificação vêm de `getClinic().pricing` (persistido em `db.clinicPricing` no mesmo banco local da clínica). Tudo filtrado pelo contexto da clínica atual (single-tenant no schema atual).

---

## 4. Dados (schema único)

- **Onde fica**: `db.clinicPricing` (já existia em `src/db/schema.js`), atualizado via **updateClinicPricing(user, payload)** em `clinicService.js`.
- **Estrutura** (compatível com o antigo app de precificação):
  - `profile`: name, city, state, chairs, daysPerWeek, hoursPerDay, etc.
  - `fixedCosts`: adminExpenses[], customCosts[].
  - `team`: employees[], partnerDentists[], partners[] (pró-labore).
  - `goals`: proLabore, profitMargin.
  - `equipment`: [].
  - `productivity`: hoursPerDay, daysPerMonth, effectiveHours, chairs.
  - `taxConfig`: regime, state, rates, calculationMethod.
  - `updatedAt`, `updatedBy`.
- **Tratamentos** da sessão de precificação (lista de procedimentos para calcular preço) ficam em estado React na **PrecificacaoPage**; não são persistidos em `clinicPricing`. Persistência futura pode ser em `clinicPricing.treatments` ou em tabela separada.
- **Tabelas de preço** (Base de Preço): continuam em **priceTables** e **priceTableProcedures** (já existentes). O módulo de precificação calcula “preço sugerido” por custo + margem; a Base de Preço é usada para listar tabelas e procedimentos com preço definido (ex.: orçamento).

---

## 5. Orçamento consumindo a Precificação

- **budgetsService** (Supabase): `createBudget` já aceita **price_table_id** (tabela de preços do LoveOdonto).
- **priceBaseService**:
  - **getSuggestedPriceFromTable(priceTableId, procedureIdOrCode)** – retorna preço sugerido para um procedimento na tabela (para autopreenchimento no orçamento).
  - **listProcedures({ priceTableId })**, **getEffectivePrice(procedureId, priceTableId)** – usados para listar procedimentos e obter preço efetivo.
- **CrmOrcamentosPage**: placeholder atualizado com comentário de que o orçamento deve usar uma Tabela de Preço e **getSuggestedPriceFromTable** ao adicionar procedimento; quando a tela de orçamento for implementada, deve:
  - permitir escolher uma Tabela de Preço (price_table_id);
  - ao adicionar procedimento, sugerir preço com **getSuggestedPriceFromTable(priceTableId, procedureIdOrCode)**;
  - permitir override manual e registrar origem (auto/manual) e auditoria.

---

## 6. Arquivos alterados / criados

### Removidos
- `src/pages/PriceBasePrecificacaoEmbedPage.jsx` (página do iframe removida).

### Criados
- `src/lib/precificacaoCalculations.js` – cálculos (custos, margem, preço por tratamento, impostos).
- `src/pages/precificacao/PrecificacaoPage.jsx` – página principal do módulo (tabs e persistência).
- `src/pages/precificacao/tabs/PrecificacaoOverviewTab.jsx` – visão geral (custos, equipe, margem).
- `src/pages/precificacao/tabs/PrecificacaoFixedCostsTab.jsx` – custos fixos e despesas administrativas.
- `src/pages/precificacao/tabs/PrecificacaoTeamTab.jsx` – equipe e pró-labore.
- `src/pages/precificacao/tabs/PrecificacaoGoalsTab.jsx` – metas, margem, perfil e produtividade.
- `src/pages/precificacao/tabs/PrecificacaoTreatmentsTab.jsx` – cadastro de tratamentos (sessão).
- `src/pages/precificacao/tabs/PrecificacaoResultsTab.jsx` – precificação (preços sugeridos por tratamento).
- `docs/PRECIFICACAO-NATIVO.md` – esta documentação.

### Alterados
- `src/App.jsx` – rotas `/admin/precificacao` e `/gestao-comercial/base-de-preco/precificar` passam a usar **PrecificacaoPage**; removido import de PriceBasePrecificacaoEmbedPage.
- `src/services/priceBaseService.js` – adicionada **getSuggestedPriceFromTable(priceTableId, procedureIdOrCode)** para uso no orçamento.
- `src/pages/crm/CrmOrcamentosPage.jsx` – descrição e comentários sobre uso de Tabela de Preço e **getSuggestedPriceFromTable**.

---

## 7. Critérios de aceite

- Não existe mais URL externa nem iframe para precificação.
- Precificação aparece como menu interno (Administração > Precificação e Base de Preço > Precificar).
- Usuário loga uma vez e acessa a precificação sem novo login.
- Dados de precificação ficam no mesmo banco/schema (clinicPricing no DB local).
- Orçamento está preparado para usar tabela de preços (price_table_id + getSuggestedPriceFromTable) quando a tela de orçamento for implementada.

---

## 8. Build

O comando `npm run build` pode falhar por erro de TypeScript já existente em `src/lib/supabaseClient.ts` (ImportMeta.env). O módulo de precificação é todo em JS/JSX e não introduz novos erros de tipo. Para validar apenas o bundle do Vite: `npx vite build` (sem `tsc -b`).
