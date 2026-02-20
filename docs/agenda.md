# Agenda Google-like

## Objetivo
Recriar a agenda com UX similar ao Google Calendar, priorizando velocidade, leitura rápida e ações críticas (confirmar, reagendar, cancelar) em poucos cliques.

## Arquitetura
Componentes principais em `src/components/agenda/`:
- `CalendarHeader`: navegação de datas, toggle de visão e busca.
- `FiltersBar`: filtros de sala, status e convênio.
- `AgendaSidebar`: multi-select de profissionais.
- `CalendarGrid`: grade de horários (Semana/Dia) com “now line”.
- `MonthGrid`: visão mensal com resumo de eventos.
- `EventCard`: card do agendamento.
- `CreateAppointmentPanel`: painel lateral para criar/editar.

Página:
- `src/pages/AgendaPage.jsx` centraliza estado, filtros, integração com serviços e abertura do painel.

Configuração:
- `src/utils/agendaConfig.js` define horários, duração e cores de status.

## Fluxo rápido
1. Clique em um slot vazio → abre painel com data/hora preenchidos.
2. Salvar → cria agendamento.
3. Salvar e confirmar → agenda + status confirmado + log + fila de WhatsApp.

## Integração de mensagens
Ao confirmar, se existir o template `Confirmação consulta`, o sistema:
- Enfileira mensagem em `messageQueue`.
- Registra log em `confirmationLogs` do agendamento.

## Como ajustar configurações
Em `src/utils/agendaConfig.js`:
- `time.startHour` e `time.endHour` ajustam o range do dia.
- `time.slotMinutes` define o passo do grid (ex: 15/30).
- `durations` define a lista de durações disponíveis no painel.
- `status` define cores e labels para cada status.

## Próximos passos técnicos (fase 2)
- Implementar drag & drop e resize com persistência no backend.
- Virtualização de slots/eventos quando necessário.
- Testes de interação: mover, redimensionar, conflitos e filtros.
