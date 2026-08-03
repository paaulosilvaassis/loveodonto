# Engenharia Reversa — Matriz de Paridade Funcional

## Referência auditada

- [Dashboard](https://app.chatinteligente.com.br/wiki/dashboard-home)
- [Conversas](https://app.chatinteligente.com.br/wiki/chat)
- [Contatos](https://app.chatinteligente.com.br/wiki/contatos)
- [Disparo em massa](https://app.chatinteligente.com.br/wiki/disparo-em-massa)
- [Kanban](https://app.chatinteligente.com.br/wiki/kanban)
- [Recuperação de conversas](https://app.chatinteligente.com.br/wiki/recuperacao-de-conversas)
- [Agendamento de mensagens](https://app.chatinteligente.com.br/wiki/agendamento-mensagens)
- [Agendamentos de eventos](https://app.chatinteligente.com.br/wiki/agendamentos)
- [Tags](https://app.chatinteligente.com.br/wiki/listar-tags)
- [Departamentos](https://app.chatinteligente.com.br/wiki/listar-departamentos)
- [Atendentes](https://app.chatinteligente.com.br/wiki/listar-atendentes)
- [Relatórios](https://app.chatinteligente.com.br/wiki/relatorios)
- [Integrações](https://app.chatinteligente.com.br/wiki/integracoes)
- [API/Webhook](https://app.chatinteligente.com.br/wiki/webhook-url)
- [Meus dados](https://app.chatinteligente.com.br/wiki/meus-dados)

## Legenda de paridade

- `OK` = já implementado no LoveOdonto (versão funcional inicial)
- `PARCIAL` = estrutura pronta, falta lógica/fluxo completo
- `PENDENTE` = ainda não implementado

## Módulo e submódulos

| Área | Referência | LoveOdonto (status) | Próxima ação |
|---|---|---|---|
| Shell do módulo | Header + navegação interna | `OK` | Refinar breadcrumbs contextuais por subpágina |
| Dashboard | KPIs, fila de resposta, blocos operacionais | `OK` (mock funcional) | Conectar dados reais + comparativo por período |
| Conversas | Lista + chat + painel lateral + ações em lote | `PARCIAL` | Persistir ações, anexos, agendamentos e logs |
| Contatos | lista, edição, import/export, relatório importação | `PARCIAL` | Implementar import/export e relatório de processamento |
| Campanhas | criação, tabela, progresso, pausa/retoma, clone | `PARCIAL` | CRUD completo e engine de envio |
| Funis (Kanban) | colunas, drag/drop, regras ao mover | `PARCIAL` | Drag/drop real + confirmação de transição |
| Configurações | IA, canal, base, regras | `PARCIAL` | Wizard completo + validações por provider |
| Relatórios | filtros e comparativos, impressão | `PARCIAL` | filtros avançados e impressão/export |
| Automações | recuperação de conversas, agendamento mensagens | `PENDENTE` | Criar tela dedicada de automações |
| Agendamentos de eventos | agendas, regras, calendar sync | `PENDENTE` | Criar submódulo agenda marketing |
| Tags/Departamentos/Atendentes | gestão operacional e permissões | `PENDENTE` | Submódulo gestão de atendimento |
| Integrações | WhatsApp/Instagram/Facebook/widget | `PENDENTE` | Adapter por canal + health monitor |
| API/Webhook | token, webhook URL | `PENDENTE` | tela + geração/rotação segura de token |
| Minha conta (marketing) | perfil e preferências de IA | `PENDENTE` | reaproveitar conta global + preferências do módulo |

## Paridade por capacidades críticas

| Capacidade | Status | Observação |
|---|---|---|
| Multicanal (visão unificada) | `PARCIAL` | UI pronta; falta ingestão por provider |
| Atendimento humano + IA (handoff) | `PARCIAL` | estado visual criado; falta engine de decisão |
| Campanhas e broadcast | `PARCIAL` | tabela e controles base; falta processamento assíncrono |
| CRM/Kanban integrado | `PARCIAL` | board inicial; falta movimentação e regras |
| Governança de atendimento | `PENDENTE` | tags/departamentos/atendentes ainda não subiram |
| Métricas e relatórios | `PARCIAL` | KPIs base; comparativos avançados pendentes |
| Segurança e segregação por clínica | `OK` (diretriz) | arquitetura projetada com `tenant_id` e `clinic_id` |

## Backlog imediato de engenharia reversa (ordem)

1. **Automações**: recuperação de conversas + agendamento de mensagens.
2. **Gestão de atendimento**: tags, departamentos, atendentes com permissões.
3. **Integrações**: canal WhatsApp inicial com status de conexão e reconexão.
4. **Conversas avançado**: anexos, notas internas, log de alterações, ações em lote persistidas.
5. **Relatórios avançados**: comparativo de períodos, filtros por canal/tag/departamento e export.

## Risco e mitigação de fidelidade

- Sem acesso autenticado ao sistema de referência, a fidelidade visual detalhada depende da wiki pública.
- Mitigação adotada:
  - mapear fluxo funcional completo via documentação pública,
  - implementar arquitetura modular para iteração rápida,
  - validar paridade por checklist objetivo (esta matriz).
