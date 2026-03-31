# ETAPA 3 — Arquitetura LoveOdonto (Marketing > Chat Inteligente)

## Decisões de arquitetura

- Módulo interno no app autenticado (sem login separado).
- Rota base: `/marketing/chat-inteligente`.
- Shell próprio com navegação interna por tabs e `Outlet` (React Router).
- Reuso do sistema de roles atual (`RequireRole` + `rolesAllowed` do menu).
- Backend nativo desacoplado por service layer (inicialmente mockado para evolução incremental).

## Mapa de rotas proposto

- `/marketing/chat-inteligente` -> redirect para dashboard interno
- `/marketing/chat-inteligente/dashboard`
- `/marketing/chat-inteligente/caixa-entrada`
- `/marketing/chat-inteligente/contatos`
- `/marketing/chat-inteligente/campanhas`
- `/marketing/chat-inteligente/funis`
- `/marketing/chat-inteligente/configuracoes`
- `/marketing/chat-inteligente/relatorios`

## Estrutura de pastas recomendada

```txt
src/
  pages/
    marketing/
      MarketingChatShellLayout.jsx
      chatInteligente/
        MarketingChatDashboardPage.jsx
        MarketingChatInboxPage.jsx
        MarketingChatContactsPage.jsx
        MarketingChatCampaignsPage.jsx
        MarketingChatFunnelsPage.jsx
        MarketingChatSettingsPage.jsx
        MarketingChatReportsPage.jsx
  services/
    marketingChatService.js
```

## State/store e hooks

- Fase inicial: state local por tela (`useState`, `useMemo`, `useEffect`) para filtros/paginação/loading.
- Evolução: criar store dedicada quando houver sincronização cross-page em tempo real (ex.: Zustand ou contexto leve).
- Padrão de carregamento: funções assíncronas no service simulando latência + fallback de erro.

## Services

- `marketingChatService.js` com contratos já próximos do backend final:
  - `getMarketingDashboardSnapshot`
  - `listMarketingInboxConversations`
  - `listMarketingContacts`
  - `listMarketingCampaigns`
  - `listMarketingFunnels`
  - `getMarketingSettings`
  - `getMarketingReportsSnapshot`

## Contratos/types (via JSDoc no curto prazo)

- `DashboardSnapshot`
- `ChatConversation`
- `ChatContact`
- `Campaign`
- `FunnelStage`
- `MarketingSettings`
- `ReportSnapshot`

## Banco e persistência (diretriz)

- Modelagem completa documentada em `marketing-chat-inteligente-modelagem-dados.md`.
- Todas as tabelas com `tenant_id`, `clinic_id`, auditoria e índices operacionais.

## Permissões (diretriz)

- Matriz completa documentada em `marketing-chat-inteligente-permissoes-multiclinica.md`.
- Operação (conversas/campanhas/funis) restrita a perfis autorizados.
- Financeiro e perfis clínicos com escopo reduzido (principalmente leitura de relatórios).

## Integrações futuras (sem acoplamento prematuro)

- WhatsApp provider adapter
- CRM bridge (lead/conversa/oportunidade)
- Agenda bridge (agendamentos)
- IA agent runtime (respostas e handoff)
- Event bus interno para métricas e automações

## Fases de implementação

1. Shell + rotas + menu + páginas estruturais.
2. Telas prioritárias com dados mockados, loading e empty.
3. Permissões granulares por aba/tela.
4. Persistência nativa no backend LoveOdonto.
5. Integrações externas e automações avançadas.
