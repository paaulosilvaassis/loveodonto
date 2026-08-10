# PHASE_10.15 — UX + ODONTOLOGY USER EXPERIENCE

## Status

**READY_FOR_UX_IMPLEMENTATION**

Pré-requisito: `READY_FOR_INTERNAL_BETA_APPROVAL` (infra Contracts V2 validada).  
Esta fase **não** altera banco, migrations, RLS, storage, infraestrutura nem produção.

## Veredito executivo

O fluxo odontológico operacional real hoje é o **atendimento clínico** (`/atendimento-clinico/:id`) + hub `/orcamentos` + shell legado `/gestao/contratos`.  
As telas Contracts V2 (`*-v2`) são **superfície técnica/piloto**, não a jornada da clínica.

A experiência atual é funcional para gerar e assinar contratos V1, mas é **fragmentada**, com elos fracos entre orçamento → contrato → financeiro → paciente, e com risco jurídico/operacional na assinatura pública (pouca clareza de parcelas, tratamento e LGPD).

---

## 1. Mapa completo da jornada

### 1.1 Jornada feliz operacional (V1 — produção)

```text
Paciente (busca/cadastro)
  → tab Orçamentos e Contratos  OU  /orcamentos  OU  Jornada do paciente
      ↓
/atendimento-clinico/:appointmentId
  1. Planejamento
  2. Orçamento → Aprovar orçamento (+ condição de pagamento)
  3. Ir para Contrato
  4. Gerar contrato → Gerar rascunho → Finalizar
  5. Enviar para assinatura (e-mail / link)
      ↓
/assinatura/:token  (paciente)
  → Assinar documento
      ↓
Financeiro (contas a receber / financiamento)
  + /gestao/contratos/assinados (admin)
```

### 1.2 Superfícies por persona

| Persona | Onde trabalha hoje | O que falta |
|---------|-------------------|-------------|
| Recepção / comercial | Atendimento, `/orcamentos`, Pendentes | Wizard guiado; CTA “Gerar contrato” no hub |
| Dentista | Planejamento, Odontograma, Documentos/TCLE | Contratos no prontuário; vínculo visual odontograma↔contrato |
| Paciente | `/assinatura/:token` | Resumo tratamento/parcelas; PDF; LGPD explícito |
| Admin / gerente | Shell `/gestao/contratos` | Busca/filtros; auditoria única; menos tabs |

### 1.3 Rotas auditadas (SSOT código)

| Fluxo | Rotas / componentes principais |
|-------|--------------------------------|
| Comercial | `PatientsPage`, `PatientCadastroPage` + `PatientBudgetsContractsTab`, `BudgetsHubPage`, `ClinicalAppointmentPage`, `ClinicalBudgetSection`, `ClinicalContractSection`, `CrmOrcamentosPage`, `Finance*` |
| Paciente | `ContractSignPublicPage` (`/assinatura/:token`), `ContractSignPublicV2Page` (`/assinar/v2/:token`) |
| Clínico | `ClinicalAppointmentPage` (planejamento/orçamento/contrato/documentos), `DocumentsSection` (consentimentos), `OdontogramV2Page`, `PatientChartPage` |
| Admin | `ContractsShellLayout`, Dashboard/Pendentes/Assinados/Modelos/Termos/Assinaturas/Config + páginas `*-v2` |

---

## 2. Auditoria por tela / etapa

### 2.1 Fluxo comercial

#### A) Paciente — busca / cadastro / aba Orçamentos e Contratos

| Critério | Achado |
|----------|--------|
| Cliques | ~2–3 até abrir atendimento a partir da aba |
| Pontos confusos | Label “Histórico financeiro-comercial”; mistura orçamento e contrato na mesma lista |
| Melhorias visuais | Cards com status colorido + próximo passo em botão (não só texto) |
| Gargalos | “Ver contas a receber” abre financeiro genérico, sem deep-link do paciente/orçamento |
| Risco jurídico | Baixo nesta tela |
| Risco operacional | Médio — recepção perde o fio do “o que falta fazer” |

#### B) Hub `/orcamentos`

| Critério | Achado |
|----------|--------|
| Cliques | 1 (abrir) + N no atendimento |
| Pontos confusos | `nextAction` (“Gerar contrato”) **não é botão** — só texto |
| Melhorias visuais | CTA primário por estado: Aprovar / Gerar contrato / Enviar assinatura / Ver financeiro |
| Gargalos | Card aprovado sem contrato exige “Abrir orçamento” → aba Contrato |
| Risco jurídico | Baixo |
| Risco operacional | **Alto** — passo crítico escondido |

#### C) Atendimento clínico — Orçamento + Aprovação

| Critério | Achado |
|----------|--------|
| Cliques | 3–6 (condição de pagamento + aprovar) |
| Pontos confusos | Condição de pagamento vs financiamento pouco explicada para o paciente |
| Melhorias visuais | Resumo “como o paciente vai pagar” em 1 card antes de aprovar |
| Gargalos | Modal de aprovação denso |
| Risco jurídico | Médio — aprovação sem espelhamento claro do que será contratado |
| Risco operacional | Médio |

#### D) Atendimento clínico — Contrato

| Critério | Achado |
|----------|--------|
| Cliques | 2–5 até rascunho; +1–2 envio |
| Pontos confusos | Checklist TCLE manda ir à aba Documentos (vai-e-volta); jargão “contrato bloqueado” |
| Melhorias visuais | Wizard lateral: TCLE → Modelo → Prévia → Enviar |
| Gargalos | Dependência de cadastro/foro/TCLE sem deep-link único |
| Risco jurídico | **Alto** se gerar sem TCLE/clareza (já há bloqueios — bom, mas UX ruim) |
| Risco operacional | **Alto** — fluxo mais frágil da clínica |

#### E) CRM `/crm/orcamentos`

| Critério | Achado |
|----------|--------|
| Cliques | 1 ícone “Gerar contrato” (se aprovado + permissão) |
| Pontos confusos | Mundo paralelo ao clínico; permissões diferentes |
| Melhorias visuais | Unificar CTA e destino (sempre atendimento ou sempre modal único) |
| Gargalos | Dois caminhos de geração |
| Risco jurídico | Médio — contratos gerados fora do contexto clínico |
| Risco operacional | **Alto** — inconsistência de processo |

#### F) Financeiro pós-aprovação

| Critério | Achado |
|----------|--------|
| Cliques | 1–2 do hub |
| Pontos confusos | Ativação financeira na aprovação, não na assinatura (pode divergir do contrato assinado) |
| Melhorias visuais | Painel “Situação financeira do contrato” no contrato assinado |
| Gargalos | Flag futura `contract_financial_activation_on_signed_enabled` ainda OFF / sem UX |
| Risco jurídico | **Alto** se cobrar antes de assinar / sem espelho no PDF |
| Risco operacional | Médio |

---

### 2.2 Fluxo do paciente

#### A) Assinatura pública V1 — `/assinatura/:token`

| Critério | Achado |
|----------|--------|
| Cliques | 2–3 (ler HTML → nome/CPF/canvas → Assinar) |
| Pontos confusos | Sem resumo de tratamento; sem parcelas; CPF opcional na prática; sem LGPD/TCLE separado |
| Melhorias visuais | Header com clínica + “O que você está assinando” (3 bullets) + tabela de parcelas |
| Gargalos | Sem download PDF pós-assinatura; sem comprovante |
| Risco jurídico | **Crítico** — assinatura sem clareza financeira/tratamento/LGPD |
| Risco operacional | Médio — suporte (“não entendi o que assinei”) |

#### B) Assinatura pública V2 — `/assinar/v2/:token`

| Critério | Achado |
|----------|--------|
| Cliques | 5–7 etapas (view → OTP → termos → sign) |
| Pontos confusos | Copy técnica (“harness”, “evidências”, hash); termos só checkbox |
| Melhorias visuais | Linguagem humana; corpo do termo expansível; PDF; limpar assinatura |
| Gargalos | Ainda piloto/técnico; sem download |
| Risco jurídico | Alto se for a produção sem copy jurídica |
| Risco operacional | Alto até desligar jargão |

---

### 2.3 Fluxo clínico

#### A) Odontograma

| Critério | Achado |
|----------|--------|
| Cliques | Isolado em `/prontuario/.../odontograma-v2` |
| Pontos confusos | Não aparece no fluxo de contrato |
| Melhorias visuais | Snapshot “odontograma anexado ao contrato” com preview |
| Gargalos | Flag `contract_odontogram_snapshot_enabled` sem UI de vínculo |
| Risco jurídico | Médio — tratamento no contrato sem evidência visual |
| Risco operacional | Médio |

#### B) Consentimentos (Documentos / TCLE)

| Critério | Achado |
|----------|--------|
| Cliques | Ida à aba Documentos + emissão + volta ao Contrato |
| Pontos confusos | Shell “Contratos & Consentimentos” promete unidade; operação é separada |
| Melhorias visuais | Checklist único no Contrato com abrir TCLE inline |
| Gargalos | Termos do shell são read-only (seeds), não emissão |
| Risco jurídico | **Alto** se contrato assinado sem TCLE (há alerta no dashboard — bom) |
| Risco operacional | **Alto** |

#### C) Contratos no atendimento / histórico

| Critério | Achado |
|----------|--------|
| Cliques | Via seção Contrato do atendimento |
| Pontos confusos | `PatientChartPage` **não** mostra contratos; `PatientContractsPanel` órfão |
| Melhorias visuais | Aba Contratos no prontuário com status e PDF |
| Gargalos | Histórico só no cadastro/atendimento |
| Risco jurídico | Médio — rastreabilidade clínica frágil |
| Risco operacional | Médio |

---

### 2.4 Fluxo administrativo

#### A) Dashboard `/gestao/contratos`

| Critério | Achado |
|----------|--------|
| Cliques | 0 utilidade no empty state |
| Pontos confusos | Empty state sem link para `/orcamentos` ou atendimento |
| Melhorias visuais | “Próximas ações” clicáveis (pendentes, sem TCLE, sem financeiro) |
| Gargalos | KPIs sem drill-down |
| Risco jurídico | Médio (alerta sem TCLE existe, mas pouco acionável) |
| Risco operacional | Médio |

#### B) Pendentes / Assinados

| Critério | Achado |
|----------|--------|
| Cliques | 1 ação por linha |
| Pontos confusos | Sem busca por paciente/número; Pendentes sem cancelar |
| Melhorias visuais | Busca + filtros status/data/profissional; badges |
| Gargalos | Escala mal com volume |
| Risco jurídico | Médio — cancelamento só no clínico |
| Risco operacional | **Alto** |

#### C) Modelos / Termos / Assinaturas / Config

| Critério | Achado |
|----------|--------|
| Cliques | Variável |
| Pontos confusos | Termos = preview, não gestão de emissão; Assinaturas = log sem busca |
| Melhorias visuais | Separar “Biblioteca jurídica” vs “Fila operacional” |
| Gargalos | Admin antigo com filtros/audit ficou órfão após redirect |
| Risco jurídico | Médio — config LGPD existe, mas não aparece no fluxo paciente |
| Risco operacional | Médio |

#### D) Telas V2 (`modelos-v2` … `entregas-v2`)

| Critério | Achado |
|----------|--------|
| Cliques | N/A para clínica real (flags OFF / harness) |
| Pontos confusos | Podem ser confundidas com produto final se flags ligarem cedo |
| Melhorias visuais | Esconder de nav até “modo clínica”; rótulo “Beta técnico” |
| Gargalos | Até 13 tabs no shell se todas as flags ON |
| Risco jurídico | Alto se PDF/demo for usado como jurídico |
| Risco operacional | **Crítico** se misturar com V1 sem cutover |

---

## 3. Problemas encontrados (síntese)

1. **Jornada quebrada em pedaços** — orçamento, TCLE, contrato, assinatura e financeiro em superfícies diferentes.
2. **CTA fantasma** — “Gerar contrato” como texto no hub, sem botão.
3. **Assinatura pública pobre** — sem parcelas, tratamento, LGPD explícito, PDF.
4. **Duplicidade V1/V2** — risco de usar harness como produto.
5. **Sem busca/filtros** nas filas operacionais.
6. **Prontuário sem contratos**.
7. **Financeiro antecipado** à assinatura (modelo atual) sem espelho claro para o paciente.
8. **Dois geradores** (CRM vs clínico) com permissões distintas.
9. **Empty states sem navegação**.
10. **Componentes órfãos** (`PatientContractsPanel`, admin antigo).

---

## 4. Melhorias sugeridas

### 4.1 Prioridade crítica

| ID | Melhoria | Persona | Por quê |
|----|----------|---------|---------|
| C1 | Resumo paciente na assinatura pública: tratamento + parcelas + total + clínica | Paciente | Risco jurídico |
| C2 | Aceite LGPD/TCLE explícito (ou link do termo) antes de assinar | Paciente | Compliance |
| C3 | Download PDF / comprovante pós-assinatura | Paciente / Admin | Prova e suporte |
| C4 | Esconder ou rotular V2 como “Beta técnico” até cutover | Todos | Evitar uso indevido |
| C5 | CTA real “Gerar contrato” no hub `/orcamentos` quando `nextAction` indicar | Comercial | Destravar conversão |

### 4.2 Prioridade alta

| ID | Melhoria | Persona |
|----|----------|---------|
| A1 | Wizard único no atendimento: Planejar → Orçar → TCLE → Contratar → Assinar → Financeiro | Clínica |
| A2 | Busca + filtros em Pendentes/Assinados (paciente, número, status, período) | Admin |
| A3 | Checklist TCLE inline na seção Contrato (sem trocar de aba) | Clínico |
| A4 | Deep-link financeiro por paciente/orçamento/contrato | Comercial |
| A5 | Unificar entrada “Gerar contrato” (CRM = mesmo destino do clínico) | Comercial |
| A6 | Dashboard com ações clicáveis + link para `/orcamentos` | Admin |

### 4.3 Prioridade média

| ID | Melhoria |
|----|----------|
| M1 | Aba Contratos no prontuário (`PatientChartPage`) |
| M2 | Snapshot de odontograma no contrato (preview) |
| M3 | Tabela de parcelas também no PDF e na página pública |
| M4 | Orientação “Assinar agora (presencial)” vs “Enviar link” |
| M5 | Empty states com próximo passo |
| M6 | Reduzir tabs do shell (agrupar V2 sob “Laboratório”) |

### 4.4 Prioridade baixa

| ID | Melhoria |
|----|----------|
| B1 | Renomear labels (“Histórico financeiro-comercial” → “Orçamentos e contratos”) |
| B2 | Melhorar ARIA do canvas de assinatura |
| B3 | Remover ou religar componentes órfãos com propósito claro |
| B4 | Microcopy menos técnica nas telas V2 de piloto |

---

## 5. Mockups necessários

| # | Mockup | Escopo |
|---|--------|--------|
| 1 | **Assinatura pública v1.5** | Header clínica + resumo tratamento + parcelas + LGPD + canvas + PDF |
| 2 | **Wizard Contrato no atendimento** | Stepper 5 etapas com checklist |
| 3 | **Card Hub Orçamentos** | Estados: Rascunho / Aprovado / Contrato pendente / Assinado / Financeiro |
| 4 | **Fila Pendentes** | Busca, filtros, ações primárias/secundárias |
| 5 | **Prontuário — aba Contratos** | Lista + status + abrir PDF + abrir atendimento |
| 6 | **Shell Contratos** | IA reduzida: Operação \| Biblioteca \| Laboratório (V2) |

Sugestão de ferramenta: Figma (mobile + desktop para assinatura pública; desktop para shell/atendimento).

---

## 6. Contagem de cliques (jornada feliz atual vs alvo)

| Etapa | Hoje (aprox.) | Alvo UX |
|-------|---------------|---------|
| Paciente → atendimento | 2–3 | 2 |
| Orçamento → aprovado | 3–6 | 3 |
| Aprovado → rascunho contrato | 3–5 (com ida ao TCLE) | 2 (checklist inline) |
| Rascunho → enviado | 1–2 | 1 |
| Paciente assina | 2–3 (V1) / 5–7 (V2) | 3–4 com clareza |
| Ver financeiro do caso | 2 (genérico) | 1 (deep-link) |
| **Total ponta a ponta** | **~14–22** | **~11–14** |

---

## 7. Riscos (consolidado)

### Jurídicos
- Assinatura sem clareza de parcelas/tratamento/LGPD (**crítico**).
- Contrato sem TCLE (mitigado por checklist; UX ainda força desvio).
- PDF demo V2 confundido com documento jurídico.
- Financeiro ativo antes da assinatura sem transparência ao paciente.

### Operacionais
- CTA “Gerar contrato” invisível no hub.
- Filas sem busca.
- Duplicidade CRM/clínico e V1/V2.
- Excesso de abas no shell com flags.
- Prontuário sem visão de contratos.

---

## 8. Escopo explícito fora desta fase

- Não alterar migrations 028–035, RLS, bucket, schema.
- Não ativar flags em produção.
- Não cutover V1→V2.
- Não mudar IndexedDB / `generatedContracts` nesta fase de review (implementação UX virá em fase seguinte).

---

## 9. Plano recomendado de implementação UX (próxima fase)

1. **Sprint UX-A (crítico):** mockups 1 + 5 CTAs C1–C5 na assinatura pública V1 e hub orçamentos.  
2. **Sprint UX-B (alto):** wizard atendimento + busca Pendentes/Assinados + TCLE inline.  
3. **Sprint UX-C (médio):** prontuário + odontograma no contrato + deep-link financeiro.  
4. **Sprint UX-D:** IA do shell + limpeza de órfãos + polish acessibilidade.

---

## 10. Gate

```text
READY_FOR_UX_IMPLEMENTATION
```

Próxima fase sugerida: **PHASE_10.16 — UX IMPLEMENTATION (assinatura pública + hub orçamentos + fila administrativa)**  
Sem alterar infraestrutura Contracts V2.
