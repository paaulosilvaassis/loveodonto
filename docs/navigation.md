# Navegação do Sistema

## Mapa do Menu (por seção)

### A) Processos de Gestão
- Dashboard → `/gestao/dashboard` (admin, gerente, recepção, profissional, financeiro, comercial)
- Agenda da Clínica → `/gestao/agenda` (admin, gerente, recepção, profissional)
- CRM (Kanban) → `/gestao/crm` (admin, gerente, recepção, comercial)
- Convênios → `/gestao/convenios` (admin, gerente, recepção)

### B) Administrativo
- Dados da Clínica → `/admin/dados-clinica` (admin, gerente)
- Dados da Equipe (Colaboradores) → `/admin/colaboradores` (admin, gerente)
- Precificação → `/admin/precificacao` (admin, gerente)
- Base de Preços → `/admin/base-precos` (admin, gerente)
- Cadastro de Procedimentos → `/admin/procedimentos` (admin, gerente)
- Contratos → `/admin/contratos` (admin, gerente)
- Consentimentos → `/admin/consentimentos` (admin, gerente)

### C) Gestão Financeira
- Contas a Pagar → `/financeiro/contas-pagar` (admin, gerente, financeiro)
- Contas a Receber → `/financeiro/contas-receber` (admin, gerente, financeiro)
- Caixa → `/financeiro/caixa` (admin, gerente, financeiro)
- Boletos → `/financeiro/boletos` (admin, gerente, financeiro)
- Financiamento → `/financeiro/financiamento` (admin, gerente, financeiro)
- Faturamento → `/financeiro/faturamento` (admin, gerente, financeiro)
- Comissões → `/financeiro/comissoes` (admin, gerente, financeiro)
- Relatórios Financeiros → `/financeiro/relatorios` (admin, gerente, financeiro)

### D) Gestão Comercial
- Histórico de Chats → `/comercial/chats` (admin, gerente, comercial)
- Mensagens Automáticas → `/comercial/mensagens` (admin, gerente, comercial, recepção)
- Confirmação de Agendamento → `/comercial/confirmacao` (admin, gerente, comercial, recepção)
  - Lembrete → `/comercial/confirmacao/lembrete`
  - Boas-vindas → `/comercial/confirmacao/boas-vindas`
  - Broadcast → `/comercial/confirmacao/broadcast`
  - Mensagens pós-atendimento → `/comercial/confirmacao/pos-atendimento`
  - Lembrete de confirmação → `/comercial/confirmacao/lembrete-confirmacao`
  - Semestral → `/comercial/confirmacao/semestral`
  - Anual → `/comercial/confirmacao/anual`
- WhatsApp (Integrações) → `/comercial/whatsapp` (admin, gerente, comercial)
  - WhatsApp integrado com Agenda → `/comercial/whatsapp/agenda`
  - WhatsApp integrado com CRM → `/comercial/whatsapp/crm`
  - Atendimento 24/7 com IA → `/comercial/whatsapp/ia`
- Atendimento humano/IA → `/comercial/atendimento` (admin, gerente, comercial)

## Rotas legadas (redirect)
- `/dashboard` → `/gestao/dashboard`
- `/agenda` → `/gestao/agenda`
- `/pacientes` → `/pacientes/busca`
- `/financeiro` → `/financeiro/contas-receber`
- `/relatorios` → `/financeiro/relatorios`
- `/comunicacao` → `/comercial/mensagens`
- `/colaboradores` → `/admin/colaboradores`
- `/settings/clinic` → `/admin/dados-clinica`

## Regras de Acesso (RBAC)
- Admin/Gerente: acesso total.
- Recepção: agenda, CRM, mensagens/confirm.
- Financeiro: módulo financeiro + relatórios financeiros.
- Comercial: CRM, mensagens, WhatsApp e chats.
- Profissional: agenda.

## Observações
- Itens sem tela real usam placeholder “Em construção”.
- O menu é gerado por `src/navigation/menuConfig.js`.
