# ETAPA 1 — Inventário Estrutural (Referência: Chat Inteligente)

## Fonte de auditoria

- URL base: [app.chatinteligente.com.br](https://app.chatinteligente.com.br/)
- Wiki pública: [app.chatinteligente.com.br/wiki](https://app.chatinteligente.com.br/wiki)
- Conteúdo acessível sem autenticação: tela de login + central de ajuda/wiki + guias por módulo.

## Mapa provável de rotas (observável + inferido)

### Públicas

- `/` -> Login
- `/wiki` -> Central de ajuda
- `/chatbot-ia-whatsapp-inteligencia-artificial` -> Landing informativa

### Aplicação autenticada (inferido pela wiki)

- `/dashboard` (home operacional)
- `/chat` (caixa de entrada / conversas)
- `/contatos`
- `/agendamentos`
- `/kanban`
- `/disparo-em-massa`
- `/recuperacao-de-conversas`
- `/agendamento-mensagens`
- `/listar-tags`
- `/listar-departamentos`
- `/listar-atendentes`
- `/campos-personalizados`
- `/listar-respostas-rapidas`
- `/relatorios`
- `/base-conhecimento` e/ou `/listar-bases-conhecimento`
- `/integracoes`
- `/webhook-url`
- `/meus-dados`

## Navegação principal (arquitetura funcional observável)

- Dashboard
- Caixa de entrada (Conversas)
- Atendimento (Contatos, Agendamentos, Kanban)
- Automação de mensagens (Disparo em massa, Recuperação, Agendamento)
- Gestão de atendimento (Tags, Departamentos, Atendentes, Campos, Respostas rápidas, Relatórios)
- IA & Canais (Base de Conhecimento, Integrações, API/Webhook)
- Minha Conta

## Componentes visíveis e padrões de UI/UX

### Dashboard

- Seletor de período com atalhos (Hoje, Ontem, 7 dias, 30 dias, etc.)
- Cards/KPIs de resumo
- Blocos "Acontecendo agora"
- Listas com links acionáveis para abrir conversas filtradas
- Seções de próximos itens (mensagens/eventos)
- CTAs para automações e integrações

### Conversas (Caixa de entrada)

- Lista de conversas com abas/filtros (Todas, IA Ativa, IA Desativada, etc.)
- Painel de chat com histórico, envio de texto e anexo
- Estados operacionais (aberto/resolvido, IA ativa/desativada, aguardando humano)
- Painel lateral de contexto: tags, atendente, departamento, anotações, logs
- Ações em lote (alterar tags/departamento/atendente, resolver, ativar/desativar IA)
- Agendamentos por contato (compromissos e mensagens programadas)

### Kanban

- Colunas customizáveis (nome, cor, filtros)
- Drag and drop de cartões entre estágios
- Confirmação de comportamento ao mover (manter configuração vs atualizar configuração)
- Busca por contato dentro de coluna
- Configuração de alerta sonoro por coluna

### Disparo em massa

- Tabela de campanhas com colunas de operação (ID, nome, atendente, canal, data/hora, progresso, status)
- Ordenação por data/hora
- Edição inline de nome
- Ações por linha: clonar, pausar/retomar, excluir, visualizar
- Barras de progresso e erro

### Base de Conhecimento (IA)

- Fluxo step-by-step
- Formulários extensos (comportamento da IA, dados da empresa, instruções, regras)
- Upload de arquivo, links, limites de caracteres
- Ajustes assistidos por IA + comparativo antes de aplicar
- Configuração de assistente interno ou externo (OpenAI)

## Blocos funcionais identificados

- Atendimento omnichannel (WhatsApp, Instagram, Facebook, Webchat)
- Operação humana + IA com handoff
- Campanhas e automações
- CRM em formato Kanban
- Agenda e agendamentos ligados ao chat
- Governança operacional (tags/departamentos/atendentes/permissões)
- Métricas e relatórios
- Integrações e webhook/API

## Tabelas, formulários, modais, filtros e estados

- Tabelas: campanhas, relatórios, listas operacionais
- Formulários: criação/edição de campanhas, base de conhecimento, contatos, configurações
- Modais: confirmação de exclusão, movimentação no Kanban, criação rápida
- Filtros: período, status, tag, departamento, canal, atendente
- Estados vazios: mensagens orientativas (ex.: "criar primeiro disparo", "nenhuma conversa pendente")
- Estados de processamento: carregando, salvando, testando, pausado fora de horário comercial

## Lacunas de auditoria (não acessível sem login)

- Layout interno exato (spacing/token/estados detalhados por pixel)
- Ordem real das opções no menu lateral autenticado
- Microinterações avançadas (atalhos de teclado, drag/drop completo)
- Validações de backend e payload real das APIs privadas
- Regras internas de permissão por plano/feature flag

## Estratégia para lacunas

- Replicar a estrutura por equivalência funcional usando a wiki como fonte de verdade pública.
- Implantar placeholders funcionais e incrementais para páginas ainda não observadas.
- Organizar o módulo no LoveOdonto com shell interno, navegação por abas e serviços desacoplados.
- Preservar UX SaaS premium e sem cópia literal de branding proprietário.
