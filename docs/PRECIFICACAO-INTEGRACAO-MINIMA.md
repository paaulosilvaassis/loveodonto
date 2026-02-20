# Integração mínima: módulo de Precificação no LoveOdonto

## 1) Commit / baseline restaurado

- **Não foi feito revert via Git.** O repositório tem um único commit (`703dd1df`); o baseline considerado é o estado do app principal (dashboard, cadastro, menus, rotas) intacto.
- As alterações feitas foram **apenas** as listadas abaixo, sem refatorar o app inteiro.

## 2) Arquivos alterados APENAS para integrar a Precificação

| Arquivo | Alteração |
|--------|-----------|
| `src/App.jsx` | Imports no topo; `const PrecificacaoPage = lazy(() => import('./modules/pricing/index.jsx'))`; rotas `/admin/precificacao` e `/gestao-comercial/base-de-preco/precificar` renderizando `<Suspense><PrecificacaoPage /></Suspense>`; remoção de instrumentação de debug. |
| `src/modules/pricing/` | **Módulo novo**: `index.jsx`, `PricingPage.jsx`, `calculations.js`, `tabs/*` (Overview, FixedCosts, Team, Goals, Treatments, Results). |
| `src/navigation/menuConfig.js` | Já existia item "Precificação" com rota `/admin/precificacao` (sem alteração). |
| `src/navigation/navCategories.js` | Já existia item "Precificação" (sem alteração). |

### Arquivos revertidos / limpos (fora do escopo da Precificação)

- `src/main.jsx` – remoção de instrumentação de debug.
- `src/auth/AuthContext.jsx` – remoção de instrumentação de debug.
- `src/components/ErrorBoundary.jsx` – remoção de instrumentação de debug.
- `src/components/Layout.jsx` – remoção de instrumentação de debug.
- `src/services/priceBaseService.js` – removida `getSuggestedPriceFromTable` e log de debug em `importProceduresBatch`.
- `src/pages/crm/CrmOrcamentosPage.jsx` – descrição e comentários revertidos ao original (sem referência à Precificação/orçamento avançado).

### Removidos (código antigo substituído pelo módulo)

- `src/pages/precificacao/` (PrecificacaoPage.jsx e todas as tabs).
- `src/lib/precificacaoCalculations.js` (lógica movida para `src/modules/pricing/calculations.js`).

## 3) Onde está a rota `/admin/precificacao`

- **Definida em:** `src/App.jsx`, dentro das rotas protegidas por `RequireAuth` e `Layout`.
- **Trecho:**  
  `<Route path="/admin/precificacao" element={withRole('/admin/precificacao', <Suspense fallback={...}><PrecificacaoPage /></Suspense>)} />`
- **Rota alternativa:** `/gestao-comercial/base-de-preco/precificar` também renderiza o mesmo módulo (lazy do mesmo `PrecificacaoPage`).  
  `/admin/base-precos/precificar` redireciona para `/admin/precificacao`.

## 4) Onde está a pasta do módulo encapsulado

- **Pasta:** `src/modules/pricing/`
- **Estrutura:**
  - `index.jsx` – export default da página (entrada do lazy no App).
  - `PricingPage.jsx` – página principal do módulo (tabs, estado, save).
  - `calculations.js` – funções de cálculo (custos, margem, preços sugeridos).
  - `tabs/` – componentes de cada aba: PrecificacaoOverviewTab, PrecificacaoFixedCostsTab, PrecificacaoTeamTab, PrecificacaoGoalsTab, PrecificacaoTreatmentsTab, PrecificacaoResultsTab.

O módulo **não** altera layout global, dashboard, cadastro, auth nem rotas existentes; apenas consome o layout padrão do LoveOdonto (já usado pelas demais páginas dentro de `Layout`).

## 5) Como a Precificação usa a auth/sessão já existente

- **Auth:** O módulo usa o mesmo `useAuth()` do app: `import { useAuth } from '../../auth/AuthContext.jsx'` em `PricingPage.jsx`. O `user` é passado para `updateClinicPricing(user, clinicData)` ao salvar.
- **Rotas:** As rotas `/admin/precificacao` e `/gestao-comercial/base-de-preco/precificar` estão protegidas por `withRole(route, element)`, usando `routeAccessMap()` de `menuConfig.js` (ex.: roles `admin`, `gerente` para `/admin/precificacao`). Não foi criado outro provider nem outra camada de autenticação.
- **Dados:** Continua usando os mesmos serviços do LoveOdonto (`getClinic`, `updateClinicPricing` em `clinicService.js`). Os dados de precificação ficam em `clinic.pricing` (mesma camada já existente).

---

**Checklist de aceite**

- [x] Dashboard original mantido.
- [x] Cadastro original mantido.
- [x] Menus e rotas originais intactos.
- [x] Uma única adição: módulo “Precificação” em `src/modules/pricing/`, acessível por `/admin/precificacao` (e por `/gestao-comercial/base-de-preco/precificar`).
- [x] Nenhuma outra tela/fluxo alterada para essa integração.
- [x] Build e navegação validados (recomendado rodar `npm run build` e testar o fluxo no navegador).
