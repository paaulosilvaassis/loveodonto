# Love Odonto V2 — Constituição Funcional (Master Business Rules)

**Documento:** `docs/constitution/LOVE_ODONTO_V2_MASTER_BUSINESS_RULES.md`  
**Versão:** 1.0.0  
**Data:** 2026-06-29  
**Status:** Oficial — fonte única das regras de negócio do Love Odonto V2.  
**Complemento de:** [`LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md`](./LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md) (Constituição Técnica) · [`LOVE_ODONTO_V2_MASTER_QA.md`](./LOVE_ODONTO_V2_MASTER_QA.md) (Garantia de Qualidade)

**Regra de ouro:** nenhuma implementação futura pode contrariar este documento sem **revisão formal** registrada na Constituição Técnica. Em conflito entre código legado e este documento, **este documento prevalece** até correção ou revisão.

**Escopo deste documento:** regras funcionais e de negócio. **Não** descreve telas, componentes React, código ou implementação técnica.

---

## Índice

1. [Filosofia do Produto](#1-filosofia-do-produto)
2. [Jornada Oficial do Paciente](#2-jornada-oficial-do-paciente)
3. [Estados Oficiais do Paciente](#3-estados-oficiais-do-paciente)
4. [Agenda](#4-agenda)
5. [Atendimento Clínico](#5-atendimento-clínico)
6. [CRM Comercial](#6-crm-comercial)
7. [Orçamentos](#7-orçamentos)
8. [Contratos](#8-contratos)
9. [Financeiro](#9-financeiro)
10. [Prontuário](#10-prontuário)
11. [RH](#11-rh)
12. [Permissões](#12-permissões)
13. [Administração](#13-administração)
14. [Relatórios](#14-relatórios)
15. [Inteligência Artificial](#15-inteligência-artificial)
16. [Integrações](#16-integrações)
17. [Auditoria](#17-auditoria)
18. [Regras Proibidas](#18-regras-proibidas)
19. [Roadmap Funcional](#19-roadmap-funcional)
20. [Checklist Obrigatório](#20-checklist-obrigatório)

**Convenção de identificação de regras:** `RN-{MÓDULO}-{NNN}` (ex.: `RN-AGD-003`).

---

## 1. Filosofia do Produto

### 1.1 Objetivo

O Love Odonto V2 é um **ERP odontológico corporativo multi-clínica (SaaS)** que unifica, em uma única plataforma:

- Relacionamento comercial e captação (CRM, marketing conversacional)
- Operação clínica (agenda, prontuário, odontograma, atendimento)
- Gestão administrativa (RH, usuários, permissões, configurações)
- Gestão financeira (receber, pagar, caixa, boletos, financiamentos, comissões)
- Governança jurídica (contratos, consentimentos, assinaturas, LGPD)
- Inteligência operacional (dashboards, KPIs, IA assistiva)

O objetivo de negócio é permitir que clínicas odontológicas operem com **rastreabilidade ponta a ponta** — do primeiro contato do lead até a alta clínica e relacionamento pós-tratamento — com **isolamento absoluto entre clínicas (tenants)** e conformidade regulatória.

### 1.2 Missão

Entregar software de gestão odontológica **confiável, auditável e escalável**, onde cada decisão clínica, comercial e financeira fica registrada, vinculada ao tenant correto e acessível apenas a quem tem permissão explícita.

### 1.3 Escopo funcional

| Incluído | Excluído (roadmap) |
|----------|-------------------|
| App clínica (equipe da clínica) | Portal do paciente (futuro) |
| Console SaaS (operadores plataforma) | App mobile nativo (futuro) |
| Admin API (regras sensíveis) | Teleodontologia completa (futuro) |
| Multi-tenant, RBAC, auditoria | BI avançado corporativo (futuro) |
| Domínios: agenda, pacientes, prontuário, CRM, financeiro, contratos, RH | Laboratórios, estoque avançado (futuro) |

### 1.4 Valores operacionais

| Valor | Regra de negócio derivada |
|-------|---------------------------|
| **Integridade** | Nenhum dado crítico sem `tenant_id`; nenhuma ação destrutiva sem auditoria |
| **Fail closed** | Ausência de permissão, tenant ou vínculo → bloqueio, nunca fallback silencioso |
| **Rastreabilidade** | Toda transição de estado relevante gera evento auditável |
| **Preservação clínica** | Prontuário e evoluções não são excluídos fisicamente — arquivamento lógico |
| **Preservação jurídica** | Contratos assinados não são editáveis — substituição por nova versão |
| **Simplicidade operacional** | Fluxos críticos (confirmar agenda, aprovar orçamento, assinar contrato) em poucos passos |
| **Conformidade LGPD** | Dados sensíveis segregados; acesso mínimo necessário; consentimento documentado |

### 1.5 Público

| Persona | Papel no sistema | Responsabilidade principal |
|---------|------------------|----------------------------|
| **Master / Owner** | Proprietário ou sócio gestor | Governança total da clínica |
| **Administrador (admin)** | Gestor operacional | Configuração, usuários, RH |
| **Gerente** | Coordenação | Equipe, operação, relatórios |
| **Recepção / Atendimento** | Front desk | Agenda, check-in, cadastro paciente |
| **Profissional / Dentista** | Corpo clínico | Atendimento, prontuário, odontograma |
| **Comercial** | Vendas e CRM | Leads, pipeline, follow-up |
| **Financeiro** | Backoffice financeiro | Caixa, receber, pagar, boletos |
| **Operador plataforma** | Console SaaS | Tenants, billing, suporte (fora do tenant clínico) |

### 1.6 Modelo SaaS

| Conceito | Definição de negócio |
|----------|---------------------|
| **Tenant** | Clínica assinante — unidade de isolamento de dados |
| **Membership** | Vínculo usuário ↔ tenant (`tenant_users`) |
| **Módulo** | Funcionalidade contratada (agenda, financeiro, CRM, IA…) |
| **Plano / Assinatura** | Conjunto de módulos e limites por tenant |
| **Staging** | Ambiente de validação (`tckdjyunwmdpqmewrwvt`) — dados anonimizados |
| **Produção** | Ambiente real (`uoepkwhqztmsjnzirpev`) — clínicas reais |

**RN-SAA-001:** Todo dado operacional pertence a exatamente um tenant. Operações cross-tenant são **proibidas**.

**RN-SAA-002:** Provisionamento de tenant, alteração de plano e billing são responsabilidade do **Console SaaS**, não do app clínica.

**RN-SAA-003:** Autenticação é centralizada via Supabase Auth; autorização é por RBAC no tenant ativo.

---

## 2. Jornada Oficial do Paciente

Fluxo corporativo ponta a ponta. Cada etapa indica **executor**, **módulos** e **dados gerados**.

```
Lead → Primeiro contato → Agendamento → Confirmação → Recepção → Sala de espera
  → Consultório → Avaliação → Odontograma → Plano de tratamento → Orçamento
  → Negociação → Contrato → Financeiro → Tratamento → Pós-atendimento → Alta
  → Relacionamento
```

### 2.1 Lead

| Atributo | Valor |
|----------|-------|
| **Executor** | Comercial, Recepção, Marketing (IA/campanha) |
| **Módulos** | CRM Comercial, Chat Inteligente, Captação |
| **Dados gerados** | Registro de lead (`name`, `phone`, `source`, `stageKey`, `assignedToUserId`, `tags`) |
| **Regras** | RN-JRN-001: Todo lead nasce com origem (`source`) obrigatória. RN-JRN-002: Lead pertence ao tenant da sessão. RN-JRN-003: Criação gera evento `status_change` na timeline. |

### 2.2 Primeiro contato

| Atributo | Valor |
|----------|-------|
| **Executor** | Comercial, Recepção |
| **Módulos** | CRM, WhatsApp, Chat Inteligente |
| **Dados gerados** | Evento `contact`, log de mensagem (`crmMessageLogs`), atualização `lastContactAt` |
| **Regras** | RN-JRN-004: Toda mensagem enviada deve ser registrada (canal, preview, template). RN-JRN-005: Contato pode avançar estágio do pipeline. |

### 2.3 Agendamento

| Atributo | Valor |
|----------|-------|
| **Executor** | Recepção, Comercial |
| **Módulos** | Agenda, CRM (estágio "Avaliação Agendada") |
| **Dados gerados** | `appointment` (data, hora, profissional, paciente ou lead, status `agendado`) |
| **Regras** | RN-JRN-006: Agendamento exige profissional com `agenda_enabled=true` ou slot válido. RN-JRN-007: Lead pode ser agendado antes de conversão em paciente (vínculo posterior). |

### 2.4 Confirmação

| Atributo | Valor |
|----------|-------|
| **Executor** | Sistema (automático), Recepção, Comercial |
| **Módulos** | Agenda, Mensagens Automáticas, Confirmação de Agendamento |
| **Dados gerados** | Status `confirmado` ou `em_confirmacao`, log confirmação, fila WhatsApp |
| **Regras** | RN-JRN-008: Confirmação dispara template configurado se existir. RN-JRN-009: Status `confirmado` indica expectativa de comparecimento. |

### 2.5 Recepção

| Atributo | Valor |
|----------|-------|
| **Executor** | Recepção |
| **Módulos** | Agenda, Cadastro Paciente, Fluxo do Paciente |
| **Dados gerados** | Check-in, status `chegou`, cadastro/atualização paciente |
| **Regras** | RN-JRN-010: Check-in só para agendamentos do dia ou janela configurada. RN-JRN-011: Conversão lead→paciente pode ocorrer na recepção. |

### 2.6 Sala de espera

| Atributo | Valor |
|----------|-------|
| **Executor** | Recepção |
| **Módulos** | Jornada do Paciente, Sala de Espera |
| **Dados gerados** | Status `em_espera`, timestamp chegada, ordem de fila |
| **Regras** | RN-JRN-012: Paciente em espera aparece no painel operacional. RN-JRN-013: Atraso (`atrasado`) calculado vs horário agendado. |

### 2.7 Consultório

| Atributo | Valor |
|----------|-------|
| **Executor** | Recepção (chamada), Profissional (atendimento) |
| **Módulos** | Sala de Espera, Atendimento Clínico |
| **Dados gerados** | Status `chamado`, `em_atendimento` |
| **Regras** | RN-JRN-014: Chamada ao consultório altera status do agendamento. RN-JRN-015: Apenas profissional designado ou substituto autorizado inicia atendimento clínico. |

### 2.8 Avaliação

| Atributo | Valor |
|----------|-------|
| **Executor** | Profissional |
| **Módulos** | Prontuário, Atendimento Clínico |
| **Dados gerados** | Sessão clínica, anamnese, dados clínicos, eventos |
| **Regras** | RN-JRN-016: Avaliação inicial registra profissional responsável e timestamp. RN-JRN-017: Anamnese incompleta pode bloquear procedimentos invasivos (configurável). |

### 2.9 Odontograma

| Atributo | Valor |
|----------|-------|
| **Executor** | Profissional |
| **Módulos** | Prontuário, Odontograma |
| **Dados gerados** | Mapa dentário FDI, condições, faces, histórico (`patientOdontogramHistory`) |
| **Regras** | RN-JRN-018: Alterações no odontograma geram entrada de histórico. RN-JRN-019: Odontograma vinculado ao paciente e tenant. |

### 2.10 Plano de tratamento

| Atributo | Valor |
|----------|-------|
| **Executor** | Profissional, Gerente (aprovação se exigida) |
| **Módulos** | Prontuário, Planejamento |
| **Dados gerados** | Plano clínico, procedimentos planejados, priorização |
| **Regras** | RN-JRN-020: Plano pode originar orçamento formal. RN-JRN-021: Aprovação de plano segue permissão `prontuario_planejamento:approve`. |

### 2.11 Orçamento

| Atributo | Valor |
|----------|-------|
| **Executor** | Profissional, Comercial, Gerente |
| **Módulos** | Orçamentos Clínicos, CRM Orçamentos |
| **Dados gerados** | Orçamento versionado, itens, valores, validade, responsável |
| **Regras** | Ver seção 7. RN-JRN-022: Orçamento vinculado a paciente (ou lead em negociação). |

### 2.12 Negociação

| Atributo | Valor |
|----------|-------|
| **Executor** | Comercial, Gerente |
| **Módulos** | CRM, Orçamentos |
| **Dados gerados** | Status `NEGOCIACAO`, eventos CRM, follow-ups |
| **Regras** | RN-JRN-023: Descontos acima do limite exigem permissão de aprovação. RN-JRN-024: Negociação registrada na timeline do lead/paciente. |

### 2.13 Contrato

| Atributo | Valor |
|----------|-------|
| **Executor** | Recepção, Comercial, Sistema |
| **Módulos** | Contratos, Orçamentos |
| **Dados gerados** | Contrato gerado, PDF, fluxo assinatura, consentimentos |
| **Regras** | Ver seção 8. RN-JRN-025: Contrato exige orçamento `APROVADO` ou equivalente. |

### 2.14 Financeiro

| Atributo | Valor |
|----------|-------|
| **Executor** | Financeiro, Recepção (entrada), Sistema (parcelas) |
| **Módulos** | Contas a Receber, Caixa, Boletos, Financiamentos |
| **Dados gerados** | Lançamentos, parcelas, boletos, movimentação caixa |
| **Regras** | Ver seção 9. RN-JRN-026: Produção contratada ≠ recebimento em caixa (competência vs caixa). |

### 2.15 Tratamento

| Atributo | Valor |
|----------|-------|
| **Executor** | Profissional, Equipe clínica |
| **Módulos** | Prontuário, Procedimentos, Agenda (retornos) |
| **Dados gerados** | Evoluções, procedimentos concluídos, sessões clínicas |
| **Regras** | RN-JRN-027: Procedimento só concluído com permissão e registro clínico. RN-JRN-028: Tratamento ativo altera estado do paciente para `em_tratamento`. |

### 2.16 Pós-atendimento

| Atributo | Valor |
|----------|-------|
| **Executor** | Sistema, Comercial |
| **Módulos** | Mensagens Automáticas, CRM Follow-up |
| **Dados gerados** | Mensagem pós-consulta, pesquisa satisfação, tarefa retorno |
| **Regras** | RN-JRN-029: Disparo pós-atendimento respeita opt-out e LGPD. RN-JRN-030: Agendamento de retorno pode ser criado automaticamente. |

### 2.17 Alta

| Atributo | Valor |
|----------|-------|
| **Executor** | Profissional, Gerente |
| **Módulos** | Prontuário, Pacientes |
| **Dados gerados** | Estado `alta`, resumo tratamento, documentos finais |
| **Regras** | RN-JRN-031: Alta clínica não exclui prontuário — arquiva tratamento ativo. RN-JRN-032: Pendências financeiras podem bloquear alta administrativa (configurável). |

### 2.18 Relacionamento

| Atributo | Valor |
|----------|-------|
| **Executor** | Comercial, Marketing |
| **Módulos** | CRM, Campanhas, Confirmação Semestral/Anual |
| **Dados gerados** | Campanhas recall, leads reativados, agendamentos preventivos |
| **Regras** | RN-JRN-033: Paciente `inativo` pode ser reativado por campanha ou novo agendamento. RN-JRN-034: Relacionamento respeita preferências de contato. |

---

## 3. Estados Oficiais do Paciente

### 3.1 Estados do ciclo de vida

| Estado | Descrição | Domínio principal |
|--------|-----------|-------------------|
| **lead** | Contato comercial sem cadastro clínico completo | CRM |
| **prospecto** | Lead qualificado em negociação ativa | CRM |
| **novo** | Paciente cadastrado, sem atendimento clínico | Pacientes |
| **em_avaliacao** | Em consulta de avaliação / diagnóstico | Atendimento |
| **em_tratamento** | Plano/orçamento aprovado, tratamento em curso | Prontuário |
| **em_manutencao** | Tratamento principal concluído, acompanhamento periódico | Prontuário |
| **alta** | Tratamento encerrado formalmente | Prontuário |
| **inativo** | Sem interação acima do prazo configurado | CRM / Pacientes |
| **arquivado** | Registro preservado, fora de operação ativa | Pacientes |

### 3.2 Estados CRM (pipeline — complementares)

Estágios oficiais do pipeline comercial:

1. Novo Lead  
2. Contato Realizado  
3. Avaliação Agendada  
4. Avaliação Realizada  
5. Orçamento Apresentado  
6. Em Negociação  
7. Aprovado  
8. Em Tratamento  
9. Finalizado  
10. Perdido  

**RN-EST-001:** Lead convertido em paciente gera evento `converted_to_patient` e vincula `patientId`.

**RN-EST-002:** Estágio `Perdido` exige motivo de perda (categoria configurável).

**RN-EST-003:** Estágio `Aprovado` no CRM implica orçamento com status `APROVADO` ou equivalente.

### 3.3 Matriz de transição (paciente)

| De → Para | Condição | Quem autoriza |
|-----------|----------|---------------|
| lead → prospecto | Qualificação / contato efetivo | Comercial |
| prospecto → novo | Conversão + cadastro completo | Recepção / Comercial |
| novo → em_avaliacao | Primeiro atendimento iniciado | Profissional |
| em_avaliacao → em_tratamento | Orçamento aprovado ou plano aceito | Profissional / Gerente |
| em_tratamento → em_manutencao | Procedimentos principais concluídos | Profissional |
| em_tratamento → alta | Encerramento formal | Profissional |
| qualquer → inativo | Inatividade > N dias (configurável) | Sistema |
| qualquer → arquivado | Solicitação administrativa + auditoria | Master / Admin |
| inativo → novo/em_tratamento | Reagendamento ou campanha | Recepção / Comercial |

**RN-EST-004:** Transição para `arquivado` **não** exclui dados — impede apenas operação corrente.

**RN-EST-005:** Paciente `arquivado` só pode ser reativado por Master, Admin ou Gerente com permissão explícita.

---

## 4. Agenda

### 4.1 Tipos de agendamento

| Tipo | Descrição | Duração típica |
|------|-----------|----------------|
| **Consulta / Avaliação** | Primeira consulta ou retorno diagnóstico | 30–60 min |
| **Procedimento** | Execução clínica agendada | Conforme procedimento |
| **Retorno** | Controle pós-procedimento | 15–30 min |
| **Urgência / Encaixe** | Slot emergencial | Variável |
| **Bloqueio** | Indisponibilidade profissional/sala | Conforme bloqueio |

**RN-AGD-001:** Todo agendamento pertence a um tenant, um profissional (ou recurso) e possui `start`/`end` ou duração derivada.

**RN-AGD-002:** Encaixe pode ignorar grade padrão apenas com permissão `agenda:create` e registro de motivo.

### 4.2 Status oficiais

| Status | Label operacional | Significado |
|--------|-------------------|-------------|
| `agendado` | Agendado | Reserva criada, não confirmada |
| `em_confirmacao` | Em Confirmação | Tentativa de confirmação em curso |
| `confirmado` | Confirmado | Paciente confirmou presença |
| `chegou` | Chegou | Check-in na recepção |
| `em_espera` | Em Espera | Aguardando chamada |
| `atrasado` | Atrasado | Passou horário sem check-in |
| `chamado` | Chamado | Direcionado ao consultório |
| `em_atendimento` | Em Atendimento | Atendimento clínico aberto |
| `finalizado` | Finalizado | Atendimento encerrado na operação |
| `atendido` | Concluído | Equivalente operacional a concluído |
| `cancelado` | Desmarcou | Cancelado antes do atendimento |
| `faltou` | Falta | Não compareceu |
| `reagendar` | Reagendar | Pendente remarcação |

### 4.3 Transições de status permitidas

```
agendado → em_confirmacao → confirmado
agendado → cancelado | reagendar
confirmado → chegou → em_espera → chamado → em_atendimento → finalizado/atendido
confirmado → faltou (após tolerância)
confirmado → cancelado | reagendar
em_atendimento → finalizado | atendido
qualquer (pré-atendimento) → cancelado (com permissão agenda:cancel)
```

**RN-AGD-003:** Status terminal (`finalizado`, `atendido`, `faltou`, `cancelado`) não retorna a `agendado` — exige **novo agendamento** ou **reagendamento** explícito.

**RN-AGD-004:** Marcar `faltou` após horário + tolerância configurável.

### 4.4 Confirmação

**RN-AGD-005:** Ação "Salvar e confirmar" define status `confirmado` e enfileira mensagem se template existir.

**RN-AGD-006:** Confirmação registrada em log do agendamento (`confirmationLogs`).

**RN-AGD-007:** Reconfirmação (lembrete) não altera status se já `confirmado`, salvo política de re-validação.

### 4.5 Falta, cancelamento e reagendamento

| Ação | Regra | Permissão |
|------|-------|-----------|
| **Cancelamento** | Motivo recomendado; libera slot | `agenda:cancel` |
| **Falta** | Após tolerância; impacta indicadores | `agenda:edit` |
| **Reagendamento** | Novo slot; histórico preservado | `agenda:edit` ou `agenda:create` |

**RN-AGD-008:** Cancelamento de consulta confirmada pode disparar template de cancelamento (se configurado).

**RN-AGD-009:** Reagendamento mantém vínculo paciente/profissional salvo alteração explícita.

### 4.6 Sala de espera e chamada

**RN-AGD-010:** Check-in (`chegou`/`em_espera`) exige permissão `atendimento_sala_espera:create` ou equivalente.

**RN-AGD-011:** Chamada (`chamado`) visível no painel Jornada do Paciente.

**RN-AGD-012:** Finalização operacional (`finalizado`) distingue-se de conclusão clínica no prontuário.

### 4.7 Bloqueios

**RN-AGD-013:** Bloqueio de agenda impede agendamentos sobrepostos ao profissional/recurso.

**RN-AGD-014:** Bloqueio recorrente (escala/férias) segue regras RH quando integrado.

### 4.8 Permissões

| Ação | Permissão canônica |
|------|-------------------|
| Ver agenda | `agenda:view` |
| Criar | `agenda:create` |
| Editar | `agenda:edit` |
| Cancelar | `agenda:cancel` |
| Confirmar | `agenda:confirm` |
| Sala de espera | `atendimento_sala_espera:*` |

### 4.9 Produção clínica e indicadores

| Indicador | Cálculo |
|-----------|---------|
| Taxa confirmação | confirmados / agendados (período) |
| Taxa comparecimento | atendidos / confirmados |
| Taxa falta | faltou / confirmados |
| Tempo espera médio | média(`chamado` − `chegou`) |
| Ocupação agenda | slots ocupados / slots disponíveis |
| Produção por profissional | procedimentos concluídos × valor (integração financeiro) |

**RN-AGD-015:** Indicadores calculados sempre filtrados por `tenant_id` e período.

---

## 5. Atendimento Clínico

### 5.1 Fluxo oficial

```
Abertura sessão → Anamnese → Exame clínico → Odontograma → Diagnóstico
  → Plano → (Orçamento) → Execução procedimentos → Prescrição / Documentos
  → Consentimentos → Finalização → Auditoria
```

### 5.2 Anamnese

**RN-ATD-001:** Anamnese clínica utiliza respostas padronizadas (`Sim` / `Não` / `Não respondido`) + detalhes obrigatórios quando `Sim`.

**RN-ATD-002:** Anamnese ATM segue mesmo padrão, domínio separado.

**RN-ATD-003:** Respostas positivas críticas (ex.: alergias, anticoagulantes) devem gerar alerta visível no atendimento.

### 5.3 Odontograma, fotos e exames

**RN-ATD-004:** Odontograma usa notação FDI; condições com faces (O/M/D/V/L) quando aplicável.

**RN-ATD-005:** Fotos clínicas armazenadas em Storage (V2) — não base64 persistente.

**RN-ATD-006:** Exames (radiografias) vinculados ao paciente com metadados (data, tipo, profissional).

### 5.4 Diagnóstico e plano

**RN-ATD-007:** Diagnóstico registrado por profissional identificado (`collaborator_uuid` / legado).

**RN-ATD-008:** Plano de tratamento pode conter múltiplos procedimentos com prioridade e dependências.

### 5.5 Prescrição, atestado e receita

**RN-ATD-009:** Prescrição e receita exigem profissional com registro conselho quando aplicável (CRO).

**RN-ATD-010:** Atestado inclui CID quando exigido pela clínica; impressão auditada.

### 5.6 Consentimentos e assinaturas

**RN-ATD-011:** Procedimentos invasivos exigem consentimento informado assinado (configurável por tipo).

**RN-ATD-012:** Menor de idade exige assinatura responsável (`guardian`) quando `guardianSignatureForMinors=true`.

### 5.7 Finalização e auditoria

**RN-ATD-013:** Finalização de atendimento registra timestamp, profissional e vínculo com agendamento.

**RN-ATD-014:** Evoluções clínicas **não são fisicamente excluídas** — correção via nova evolução ou retificação auditada.

**RN-ATD-015:** Acesso a documentos confidenciais exige permissão específica e gera auditoria `VIEW`.

---

## 6. CRM Comercial

### 6.1 Pipeline

**RN-CRM-001:** Cada lead ocupa exatamente um estágio (`stageKey`) por vez.

**RN-CRM-002:** Mudança de estágio via `move_stage` gera evento `status_change` obrigatório.

**RN-CRM-003:** Estágios são ordenados; estágios customizados por tenant (futuro Supabase) não quebram ordem sem configuração.

### 6.2 Leads e origem

| Origem (`source`) | Descrição |
|-------------------|-----------|
| whatsapp | WhatsApp |
| instagram | Instagram |
| site | Site |
| google_ads | Google Ads |
| indicacao | Indicação |
| telefone | Telefone |
| walk_in | Presencial |
| manual | Manual |

**RN-CRM-004:** Lead exige nome e telefone (mínimo operacional).

**RN-CRM-005:** Responsável (`assignedToUserId`) deve ser usuário ativo do tenant.

### 6.3 Campanhas e follow-up

**RN-CRM-006:** Follow-up possui `dueAt`; conclusão registra `doneAt`.

**RN-CRM-007:** Automações (gatilho → condição → ação) só executam se `active=true`.

**RN-CRM-008:** Campanhas broadcast respeitam janela de envio e opt-out.

### 6.4 Perda, recuperação e conversão

**RN-CRM-009:** Lead `Perdido` pode ser recuperado manualmente para estágio inicial ou negociação.

**RN-CRM-010:** Conversão gera paciente e vincula orçamentos existentes via `crmBudgetLinks`.

**RN-CRM-011:** KPI conversão = leads convertidos / leads qualificados (período).

### 6.5 KPIs oficiais CRM

| KPI | Fórmula | Periodicidade |
|-----|---------|---------------|
| Leads novos | count(leads created) | Diário / Semanal |
| Taxa conversão | convertidos / total leads | Mensal |
| Tempo médio funil | média(data conversão − data criação) | Mensal |
| Orçamentos apresentados | count(stage ≥ orçamento) | Semanal |
| Ticket médio | sum(valor aprovado) / count(aprovados) | Mensal |
| Perdas por motivo | group by motivo_perda | Mensal |

---

## 7. Orçamentos

### 7.1 Estados oficiais

| Status | Descrição | Editável |
|--------|-----------|----------|
| `RASCUNHO` | Em elaboração | Sim |
| `ENVIADO` | Enviado ao paciente | Sim |
| `NEGOCIACAO` | Em negociação comercial | Sim |
| `APROVADO` | Aceito pelo paciente/clínica | Não (estrutural) |
| `CONTRATO_GERADO` | Contrato vinculado | Não |
| `HISTORICO` | Versão anterior arquivada | Não |
| `REPROVADO` | Recusado | Não |
| `CANCELADO` | Cancelado | Não |

**RN-ORC-001:** Apenas `RASCUNHO`, `ENVIADO`, `NEGOCIACAO` permitem edição estrutural de itens.

**RN-ORC-002:** Aprovação exige permissão `prontuario_orcamentos:approve`.

**RN-ORC-003:** Orçamento aprovado gera snapshot imutável para contrato e financeiro.

### 7.2 Versionamento e duplicação

**RN-ORC-004:** Revisão de orçamento aprovado cria **nova versão**; anterior → `HISTORICO`.

**RN-ORC-005:** Duplicação gera novo orçamento `RASCUNHO` copiando itens.

**RN-ORC-006:** Histórico de versões preservado por paciente/atendimento.

### 7.3 Descontos e validade

**RN-ORC-007:** Desconto por item ou global registrado com percentual/valor e autor (se acima do limite).

**RN-ORC-008:** Validade do orçamento configurável; expirado exige renovação ou reaprovação.

### 7.4 Itens e procedimentos

**RN-ORC-009:** Item referencia procedimento da base de preços (`admin_base_precos_procedimentos`) ou manual justificado.

**RN-ORC-010:** Valor unitário, quantidade, dente/região (quando odontológico) obrigatórios por item clínico.

**RN-ORC-011:** Sincronização odontograma → orçamento reflete dentes/procedimentos marcados.

### 7.5 Integrações

**RN-ORC-012:** Orçamento `APROVADO` habilita geração de contrato (`admin_contratos:generate`).

**RN-ORC-013:** Orçamento aprovado alimenta contas a receber / financiamento conforme forma de pagamento.

**RN-ORC-014:** Cancelamento de orçamento aprovado exige permissão elevada e não cancela contrato assinado automaticamente.

---

## 8. Contratos

### 8.1 Tipos / categorias oficiais

| Categoria | Uso |
|-----------|-----|
| Prestação de Serviços | Contrato principal tratamento |
| Consentimento Informado | Procedimentos específicos |
| Ciência de Riscos | Procedimentos de risco |
| Autorização de Tratamento | Autorização geral |
| Menor de Idade | Responsável legal |
| Uso de Imagem | Marketing / documentação |
| LGPD | Tratamento de dados |
| Garantia e Manutenção | Pós-tratamento |
| Desistência / Interrupção | Interrupção voluntária |
| Pós-operatório | Retornos e cuidados |

### 8.2 Estados oficiais

| Status | Descrição |
|--------|-----------|
| `draft` | Rascunho |
| `generated` | Documento gerado |
| `sent` | Enviado para assinatura |
| `viewed` | Visualizado pelo signatário |
| `signed_by_patient` | Assinado paciente |
| `signed_by_clinic` | Assinado clínica |
| `completed` / `signed` | Totalmente assinado |
| `refused` | Recusado |
| `canceled` | Cancelado |
| `expired` | Link expirado |
| `replaced` | Substituído por nova versão |
| `vigente` | Contrato ativo |
| `rescindido` | Rescindido formalmente |

### 8.3 Fluxo de assinatura

```
draft → generated → sent → viewed → signed_by_patient → signed_by_clinic → completed
                                    ↘ refused / expired / canceled
```

**RN-CTR-001:** Contrato assinado (`signed`, `completed`) **não é editável** — apenas substituído (`replaced`).

**RN-CTR-002:** Variáveis do contrato resolvidas a partir de paciente, clínica, orçamento e profissional.

**RN-CTR-003:** Link de assinatura expira conforme `signLinkExpiryDays` (7, 15 ou 30 dias).

**RN-CTR-004:** Valores altos (`highValueThreshold`) ou financiamento podem exigir assinatura avançada/qualificada.

**RN-CTR-005:** CPF e e-mail obrigatórios para assinatura quando configurado.

### 8.4 Jurídico, Storage e auditoria

**RN-CTR-006:** PDF final armazenado em Storage; metadados no registro canônico.

**RN-CTR-007:** Webhook de provedor externo (`clicksign`, `d4sign`, etc.) atualiza status — nunca confiar só no frontend.

**RN-CTR-008:** Toda transição de status gera trilha auditável (`view_audit` disponível para Master/Admin).

**RN-CTR-009:** Cláusulas padrão do sistema editáveis apenas com `admin_contratos:edit_system_clause`.

---

## 9. Financeiro

### 9.1 Contas a receber

**RN-FIN-001:** Recebível vinculado a paciente, orçamento/contrato e tenant.

**RN-FIN-002:** Baixa parcial permitida; saldo remanescente rastreado.

**RN-FIN-003:** Cancelamento de recebível exige permissão `financeiro_contas_receber:delete` ou `reverse` conforme política.

### 9.2 Contas a pagar

**RN-FIN-004:** Despesa vinculada a fornecedor quando cadastrado.

**RN-FIN-005:** Pagamento registra data, forma e comprovante (Storage).

### 9.3 Fluxo de caixa

**RN-FIN-006:** Caixa opera em sessões — abertura (`open`) e fechamento (`close`) auditados.

**RN-FIN-007:** Lançamento (`launch`) só em caixa aberto.

**RN-FIN-008:** Estorno (`reverse`) gera contra-lançamento — não apaga histórico.

### 9.4 Boletos, PIX e cartão

**RN-FIN-009:** Emissão boleto (`issue`) integrada via gateway/API — status sincronizado por webhook.

**RN-FIN-010:** PIX e cartão registram NSU/referência externa.

**RN-FIN-011:** Cancelamento boleto (`cancel`) só se não liquidado.

### 9.5 Parcelas e financiamentos

**RN-FIN-012:** Financiamento gera cronograma de parcelas com juros/multa configuráveis.

**RN-FIN-013:** Aprovação financiamento exige `financeiro_financiamentos:approve`.

**RN-FIN-014:** Inadimplência altera status parcela e pode bloquear agendamento (configurável).

### 9.6 Comissões

**RN-FIN-015:** Comissão calculada sobre produção contratada ou recebida — política por clínica.

**RN-FIN-016:** Comissão vinculada a `collaborator_uuid` (V2).

**RN-FIN-017:** Aprovação pagamento comissão auditada.

### 9.7 Estornos, renegociações e cancelamentos

**RN-FIN-018:** Estorno financeiro exige motivo e permissão `financeiro_caixa:reverse`.

**RN-FIN-019:** Renegociação gera novo cronograma; original preservado em histórico.

**RN-FIN-020:** Cancelamento financeiro não remove registro — status `cancelado`.

### 9.8 DRE e KPIs

| KPI | Definição |
|-----|-----------|
| Faturamento (competência) | produção contratada no período |
| Recebimento (caixa) | entradas efetivas no caixa |
| Inadimplência | parcelas vencidas / total a receber |
| Ticket médio | receita / pacientes pagantes |
| Margem | receita − custos variáveis (quando lançados) |
| Liquidez | saldo caixa + recebíveis curto prazo − pagáveis |

**RN-FIN-021:** DRE exportável (`financeiro_dre:export`) — competência e caixa claramente separados.

---

## 10. Prontuário

### 10.1 Domínios clínicos

| Domínio | Regra de retenção |
|---------|-------------------|
| Anamnese | Permanente; retificação auditada |
| Odontograma | Histórico versionado |
| Evolução clínica | Imutável lógica; retificação |
| Radiografias / fotos | Storage; metadados no prontuário |
| Documentos | Categorizados; validade opcional |
| Receitas / Atestados | Numeração/controle por emissão |
| CID | Quando aplicável; acesso restrito |

### 10.2 LGPD

**RN-PRO-001:** Dados sensíveis de saúde — acesso mínimo necessário (RBAC).

**RN-PRO-002:** Documentos confidenciais — apenas Admin e Profissional (padrão).

**RN-PRO-003:** Exportação de prontuário exige permissão e auditoria.

**RN-PRO-004:** Direito do titular (acesso, correção) atendido via processo administrativo documentado.

### 10.3 Assinaturas clínicas

**RN-PRO-005:** Assinatura digital em documentos clínicos segue mesmo rigor jurídico de contratos quando exigido.

### 10.4 Auditoria clínica

**RN-PRO-006:** Toda visualização/alteração em prontuário gera log (`VIEW`, `UPDATE`, `UPLOAD`).

**RN-PRO-007:** Exclusão de evolução ou odontograma **proibida** — usar retificação ou arquivamento lógico.

---

## 11. RH

### 11.1 Colaborador

| Atributo | Regra |
|----------|-------|
| Identificação | UUID canônico + `legacy_id` text (transição) |
| Tenant | Obrigatório |
| Status | `ativo` / inativo via soft delete (`deleted_at`) |
| Categorias RH | Diretoria, Corpo Clínico, Recepção, Financeiro, etc. |
| Conselho | CRO (ou equivalente) para profissionais clínicos |
| Agenda | `agenda_enabled` define se aparece na agenda |
| Foto | URL Storage HTTPS — proibido base64 |

**RN-RH-001:** Colaborador pertence a um único tenant.

**RN-RH-002:** E-mail único por tenant para matching backfill/link.

**RN-RH-003:** Soft delete preserva histórico; FK `on delete set null` em `collaborator_uuid`.

### 11.2 Usuário e vínculos

| Conceito | Regra |
|----------|-------|
| Colaborador | Pessoa / ficha RH |
| Usuário | Acesso ao sistema (`tenant_users`) |
| Vínculo formal | `collaborator_uuid` → `collaborators.id` |
| Legado | `collaborator_id` text preservado na transição |

**RN-RH-004:** Colaborador pode existir **sem** usuário (RH sem acesso ao sistema).

**RN-RH-005:** Usuário com acesso clínico deve vincular-se a colaborador (UUID ou processo de link).

**RN-RH-006:** Link por `legacy_id` prioritário; fallback e-mail único; ambíguo → resolução manual.

**RN-RH-007:** `has_system_access=false` bloqueia login independente de role.

### 11.3 Especialidades, escalas e produção

**RN-RH-008:** Especialidades clínicas em array (`especialidades`) — ex.: Implantodontia.

**RN-RH-009:** Escalas de trabalho definem disponibilidade na agenda (integração futura Supabase).

**RN-RH-010:** Produção clínica atribuída ao profissional via `collaborator_uuid` em procedimentos/comissões.

### 11.4 Equipe

**RN-RH-011:** Gestão de equipe (`equipe:*`) separada de usuários (`configuracoes_usuarios_acessos:*`).

**RN-RH-012:** Desativação colaborador (`deactivate`) não remove usuário automaticamente — fluxos independentes.

---

## 12. Permissões

### 12.1 Modelo RBAC

```
permission_catalog (184 permissões globais)
    ↓
role_permission_defaults (175 mapeamentos)
    ↓
tenant_users + overrides customizados
    ↓
can(module, action) → allow / deny (default deny)
```

**RN-PER-001:** Default deny — permissão explícita necessária.

**RN-PER-002:** Master, Admin, Owner — bypass total (exceto `has_system_access=false`).

**RN-PER-003:** Formato ID: `perm-{module_key}-{action_key}`.

### 12.2 Roles oficiais

| Role | Escopo típico |
|------|---------------|
| `master` | Governança total tenant |
| `admin` | Administrador (equivalente bypass) |
| `gerente` | Operacional amplo (defaults administrativo) |
| `administrativo` | Backoffice clínico-admin |
| `recepcao` / `atendimento` | Front desk |
| `profissional` / `dentista` | Clínico |
| `comercial` | CRM e vendas |
| `financeiro` | Financeiro |

### 12.3 Matriz de ações críticas

| Ação | Permissão mínima | Roles típicos |
|------|------------------|---------------|
| Excluir paciente | `patients:delete` | Master, Admin, Gerente |
| Excluir orçamento | `prontuario_orcamentos:delete` | Master, Admin (não aprovado) |
| Cancelar contrato | `admin_contratos:cancel` | Master, Admin, Gerente |
| Editar prontuário | `prontuario_atendimento:edit` | Profissional, Admin |
| Cancelar pagamento / estornar | `financeiro_caixa:reverse` | Financeiro, Admin |
| Editar financeiro | `financeiro_*:edit` | Financeiro, Admin |
| Excluir odontograma | **Proibido** — retificação | Profissional |
| Excluir evolução | **Proibido** — retificação | Profissional |
| Editar agenda | `agenda:edit` | Recepção, Admin, Gerente |
| Editar permissões | `configuracoes_usuarios_acessos:edit` + `canManageAccess` | Master, Admin |
| Excluir colaborador | `equipe:delete` | Master, Admin |
| Excluir usuário | `configuracoes_usuarios_acessos:deactivate` | Master, Admin |
| Criar tenant | Console platform | Operador plataforma |
| Excluir tenant | Console platform | Operador plataforma (janela) |
| Aprovar orçamento | `prontuario_orcamentos:approve` | Gerente, Admin, Profissional* |
| Assinar contrato (clínica) | `admin_contratos:sign` | Admin, Gerente |
| Ver auditoria | `sistema_logs_auditoria:view` | Master, Admin |
| Importar base preços | `admin_base_precos_procedimentos:import` | Admin, Gerente |
| Configurar WhatsApp | `sistema_whatsapp:configure` | Admin, Gerente |
| Gerenciar IA | `comercial` + config integrações | Admin, Gerente, Comercial |

\* Conforme política da clínica — default deny se não explicitado no override.

**RN-PER-004:** UI nunca é única camada de segurança — RLS + API reforçam.

**RN-PER-005:** Alteração RBAC gera `identity_events` e invalida cache permissões.

---

## 13. Administração

### 13.1 Clínicas e tenant

**RN-ADM-001:** Um tenant = uma clínica assinante (filiais = sub-unidades futuras com mesmo tenant ou filho — a definir).

**RN-ADM-002:** Dados cadastrais (`clinic_profiles`) incluem razão social, CNPJ, endereço, responsável técnico.

**RN-ADM-003:** Logo via Storage bucket `clinic-logos` — path `{tenant_id}/...`.

### 13.2 Configurações

**RN-ADM-004:** Base de preços por tenant — tabelas múltiplas permitidas.

**RN-ADM-005:** Tipos de tratamento configuram categorias exibidas no orçamento.

**RN-ADM-006:** Guia clínico e biblioteca de imagens — assets por tenant.

### 13.3 Planos e módulos

**RN-ADM-007:** Módulo desabilitado no plano → funcionalidade indisponível (fail closed).

**RN-ADM-008:** Limites (usuários, storage, IA) enforced por `tenant_limits`.

### 13.4 Uploads e assets

**RN-ADM-009:** Validar MIME e tamanho em todo upload.

**RN-ADM-010:** Path convention Storage: `{tenant_id}/{entity_type}/{entity_id}/{filename}`.

---

## 14. Relatórios

### 14.1 Princípios

**RN-REL-001:** Todo KPI declarado indica origem de dados, filtro tenant e periodicidade.

**RN-REL-002:** Exportação exige permissão `export` do módulo correspondente.

**RN-REL-003:** Relatórios financeiros distinguem competência vs caixa.

### 14.2 Catálogo de KPIs principais

| KPI | Módulo | Origem dados | Periodicidade | Responsável |
|-----|--------|--------------|---------------|-------------|
| Dashboard operacional | Dashboard | agenda + pacientes + financeiro | Tempo real / diário | Gerente |
| Taxa ocupação agenda | Agenda | appointments | Semanal | Gerente |
| Funil CRM | CRM | crmLeads + stages | Semanal | Comercial |
| Conversão lead→paciente | CRM | events converted | Mensal | Comercial |
| Orçamentos apresentados/aprovados | Orçamentos | budgets | Mensal | Comercial |
| Faturamento vs caixa | Financeiro | transactions + AR | Mensal | Financeiro |
| Inadimplência | Financeiro | parcelas vencidas | Semanal | Financeiro |
| Comissões devidas | Financeiro | commissions | Mensal | Financeiro |
| Contratos pendentes assinatura | Contratos | generatedContracts | Diário | Recepção |
| Produção por profissional | Clínico + Fin | procedimentos + comissões | Mensal | Gerente |
| NPS / satisfação | Comercial | pesquisas pós-atendimento | Mensal | Comercial |
| IA — tempo resposta | IA | marketingChat metrics | Diário | Comercial |

---

## 15. Inteligência Artificial

### 15.1 Escopo

**RN-IA-001:** IA opera **dentro do tenant** — sem cruzamento de dados entre clínicas.

**RN-IA-002:** IA assistiva — não substitui decisão clínica nem diagnóstico definitivo.

**RN-IA-003:** Transbordo humano obrigatório quando solicitado ou detectada insatisfação/alta complexidade.

### 15.2 Limites

**RN-IA-004:** IA não executa ações financeiras destrutivas (estorno, cancelamento pagamento).

**RN-IA-005:** IA não altera prontuário clínico sem confirmação humana autenticada.

**RN-IA-006:** IA não expõe dados de outros pacientes na conversa.

### 15.3 Base de conhecimento e memória

**RN-IA-007:** Base de conhecimento configurável por tenant (FAQ, serviços, horários).

**RN-IA-008:** Memória conversacional limitada por sessão/contato — não substitui prontuário.

**RN-IA-009:** Treinamento/fine-tuning somente com dados anonimizados e autorização explícita.

### 15.4 Encaminhamento

**RN-IA-010:** Handoff registra evento `conversation_status_changed` e atribui atendente humano.

---

## 16. Integrações

| Integração | Uso | Regra |
|------------|-----|-------|
| **WhatsApp** | Confirmação, CRM, IA | Opt-in; log obrigatório; `sistema_whatsapp:connect` |
| **E-mail** | Convites, contratos, notificações | Templates tenant-scoped |
| **SMS** | Token assinatura (opcional) | Consentimento |
| **Meta / Google** | Ads, leads | Origem CRM rastreada |
| **N8N** | Automações externas | Webhooks autenticados |
| **Admin API** | Orquestração oficial | JWT + tenant validation |
| **Webhooks** | Assinatura, pagamento | Idempotência + verificação assinatura |

**RN-INT-001:** Integrações nunca bypassam RLS — usam service role server-side ou token tenant-scoped.

**RN-INT-002:** Credenciais de integração por tenant — nunca globais compartilhadas.

**RN-INT-003:** Falha integração → retry documentado; não perda silenciosa de evento crítico.

---

## 17. Auditoria

### 17.1 Princípio

**Toda ação importante gera auditoria.**

### 17.2 Campos obrigatórios

| Campo | Descrição |
|-------|-----------|
| **Quem** | `user_id`, `collaborator_uuid`, e-mail |
| **Quando** | `timestamp` UTC |
| **Tenant** | `tenant_id` |
| **IP** | Quando disponível (server-side) |
| **Ação** | Tipo normalizado (`CREATE`, `UPDATE`, `DELETE`, `VIEW`, `LOGIN`, …) |
| **Entidade** | Tipo + ID |
| **Antes** | Snapshot anterior (quando mutação) |
| **Depois** | Snapshot posterior |
| **Origem** | `ui`, `api`, `webhook`, `script`, `system` |

### 17.3 Fontes oficiais

| Fonte | Escopo |
|-------|--------|
| `identity_events` | Acesso, convites, link RH, RBAC |
| `audit_logs` | Platform / admin |
| `crmLeadEvents` | Pipeline comercial |
| `accessAuditLogs` | Prontuário (migrar Supabase) |
| `scripts/reports/*.json` | Backfill, migrations, rollback |
| Logs estabilidade | Auth, tenant-context (dev/staging) |

**RN-AUD-001:** Scripts de dados (`backfill`, `seed`) geram relatório JSON timestampado obrigatório.

**RN-AUD-002:** Proibido logar PII, tokens ou service role em produção.

**RN-AUD-003:** Retenção mínima auditoria clínica e financeira conforme política legal (mín. 5 anos recomendado para prontuário).

---

## 18. Regras Proibidas

As seguintes práticas são **explicitamente proibidas** em Love Odonto V2:

| # | Proibição |
|---|-----------|
| ❌ 1 | Usar `tenant-1`, `primeira clínica` ou qualquer tenant inferido/default |
| ❌ 2 | Fallback automático de tenant quando sessão ambígua |
| ❌ 3 | Mock data ou usuários fake em produção/staging real |
| ❌ 4 | Seed não autorizado em produção |
| ❌ 5 | Dados críticos sem `tenant_id` |
| ❌ 6 | IndexedDB como **autoridade** em domínio migrado para Supabase |
| ❌ 7 | Base64 persistente para fotos, logos ou PDFs |
| ❌ 8 | Bypass de RLS via client anon ou queries sem filtro tenant |
| ❌ 9 | Permissões hardcoded fixas na UI sem catálogo oficial |
| ❌ 10 | Usuários órfãos (membership sem tenant válido) |
| ❌ 11 | `collaborator_uuid` apontando para colaborador inexistente ou outro tenant |
| ❌ 12 | Gravação direta em Supabase/IDB bypassando Admin API onde API é mandatória |
| ❌ 13 | Exclusão física de prontuário, evolução ou lançamento financeiro auditado |
| ❌ 14 | Edição de contrato após assinatura completa |
| ❌ 15 | Cross-tenant read/write silencioso |
| ❌ 16 | Deploy structural em produção sem validação staging |
| ❌ 17 | Migration 018 FK antes de backfill RH + órfãos = 0 |
| ❌ 18 | Commit de secrets ou service role em repositório |
| ❌ 19 | IA tomando decisão clínica autônoma |
| ❌ 20 | Exportação massiva de dados sem auditoria e permissão |

---

## 19. Roadmap Funcional

Itens **fora do escopo V2 atual** — planejados formalmente:

| Módulo | Descrição | Dependência |
|--------|-----------|-------------|
| **Convênios** | TISS, guias, glosas, faturamento convênio | Pacientes + Financeiro Supabase |
| **Laboratórios** | Pedidos prostéticos, rastreio | Prontuário |
| **Estoque** | Materiais, movimentações, consumo por procedimento | Procedimentos + Financeiro |
| **Teleodontologia** | Consulta remota, gravação consentida | Prontuário + Storage |
| **Portal do Paciente** | Agendamento, documentos, pagamentos | Auth paciente + API pública |
| **Portal do Dentista** | Produção, comissões, agenda pessoal | RH UUID + Mobile |
| **Portal Comercial** | Pipeline externo, metas | CRM Supabase |
| **Portal Financeiro** | Extrato, boletos, renegociação | Financeiro Supabase |
| **IA Clínica** | Sugestão plano (assistiva, não diagnóstica) | Prontuário + governança |
| **Aplicativo Mobile** | Agenda, check-in, push | API + offline queue |
| **Business Intelligence** | Data warehouse, dashboards corporativos | SSOT completo Supabase |

**RN-ROAD-001:** Nenhum item de roadmap entra em produção sem regra de negócio documentada neste manual (addendum versionado).

---

## 20. Checklist Obrigatório

Toda **nova funcionalidade** deve responder **Sim** ou **N/A justificado** antes de merge/deploy:

| # | Pergunta | Bloqueante |
|---|----------|------------|
| 1 | Existe `tenant_id` em todo dado crítico? | ✅ |
| 2 | Existe auditoria para ações sensíveis? | ✅ |
| 3 | Existe RLS (se persistência Supabase)? | ✅ |
| 4 | Existe teste (unitário e/ou caso QA)? | ✅ |
| 5 | Existe rollback documentado? | ✅ |
| 6 | Existe migration (se DDL)? | Se aplicável |
| 7 | Existe documentação (este manual ou addendum)? | ✅ |
| 8 | Existe regra de negócio explícita (RN-*)? | ✅ |
| 9 | Existe impacto em outro módulo mapeado? | ✅ |
| 10 | Existe impacto financeiro avaliado? | Se aplicável |
| 11 | Existe impacto clínico avaliado? | Se aplicável |
| 12 | Existe impacto jurídico avaliado? | Se aplicável |
| 13 | Existe impacto LGPD avaliado? | Se aplicável |

**RN-CHK-001:** Funcionalidade sem resposta documentada às perguntas 1, 2, 8 → **não deployável**.

**RN-CHK-002:** Addendum a este documento exige incremento de versão (ex.: 1.1.0) e referência no PR.

---

## Controle de revisão

| Versão | Data | Alteração |
|--------|------|-----------|
| 1.0.0 | 2026-06-29 | Versão inicial — Constituição Funcional V2 |

**Documentos relacionados**

- [`LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md`](./LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md)
- [`LOVE_ODONTO_V2_MASTER_QA.md`](./LOVE_ODONTO_V2_MASTER_QA.md)
- [`architecture-audit-love-odonto-v2.md`](../reports/architecture-audit-love-odonto-v2.md)
- [`agenda.md`](../modules/agenda.md) · [`CRM.md`](../modules/CRM.md) · [`prontuario.md`](../modules/prontuario.md)
- [`STABILITY_CHECKLIST.md`](../playbooks/STABILITY_CHECKLIST.md)

---

## Apêndice A — Contagem de regras documentadas

| Módulo | Prefixo RN | Quantidade |
|--------|------------|------------|
| SaaS / Filosofia | RN-SAA | 3 |
| Jornada | RN-JRN | 34 |
| Estados | RN-EST | 5 |
| Agenda | RN-AGD | 15 |
| Atendimento | RN-ATD | 15 |
| CRM | RN-CRM | 11 |
| Orçamentos | RN-ORC | 14 |
| Contratos | RN-CTR | 9 |
| Financeiro | RN-FIN | 21 |
| Prontuário | RN-PRO | 7 |
| RH | RN-RH | 12 |
| Permissões | RN-PER | 5 |
| Administração | RN-ADM | 10 |
| Relatórios | RN-REL | 3 |
| IA | RN-IA | 10 |
| Integrações | RN-INT | 3 |
| Auditoria | RN-AUD | 3 |
| Roadmap | RN-ROAD | 1 |
| Checklist | RN-CHK | 2 |
| **Total explícito** | | **~183 RN-*** |

*(Contagem inclui regras numeradas; matrizes e tabelas normativas complementares.)*

---

## Apêndice B — Pendências identificadas

| ID | Pendência | Prioridade |
|----|-----------|------------|
| P-BR-01 | Formalizar estados paciente `active/inactive` legado vs ciclo V2 | Alta |
| P-BR-02 | Regras convênio TISS (módulo roadmap) | Média |
| P-BR-03 | Limites desconto orçamento por role (valores numéricos) | Alta |
| P-BR-04 | Política filiais multi-unidade mesmo tenant | Média |
| P-BR-05 | Overrides RBAC em tabela relacional tenant-scoped (Fase 2) | Alta |
| P-BR-06 | Regras offline/outbox quando implementado | Média |
| P-BR-07 | Retenção legal auditoria por jurisdição | Média |
| P-BR-08 | Homologação formal casos QA contra RN-* | Alta |

---

## Apêndice C — Próximos documentos recomendados

| Documento | Propósito |
|-----------|-----------|
| `LOVE_ODONTO_V2_MASTER_DATA_DICTIONARY.md` | Dicionário de dados e entidades |
| `LOVE_ODONTO_V2_MASTER_INTEGRATION.md` | Contratos API/webhooks detalhados |
| `LOVE_ODONTO_V2_MASTER_LGPD.md` | Política dados pessoais e saúde |
| Addendum Convênios | Quando módulo TISS iniciar |
| Addendum Offline | Quando fila outbox for implementada |
