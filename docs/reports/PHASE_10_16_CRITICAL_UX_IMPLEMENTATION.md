# PHASE_10.16 — CRITICAL UX IMPLEMENTATION (C1–C5)

## Status

**READY_FOR_INTERNAL_UX_BETA**

## Baseline

| Item | Valor |
|------|--------|
| Pré-requisito | PHASE_10.15 `READY_FOR_UX_IMPLEMENTATION` |
| Report 10.15 commit | `d9d93b3` — `docs(contracts-v2): add odontological ux review` |
| Fluxo operacional real | Atendimento clínico + `/orcamentos` + shell V1 |
| Harness `*-v2` | Superfície técnica isolada (não jornada operacional) |
| Produção / flags | Sem deploy; sem ativação de feature flags de produção |
| Infra | Sem migrations, RLS, schema, bucket, storage foundation, ledger |

## Commit do relatório 10.15

```
d9d93b3 docs(contracts-v2): add odontological ux review
```

Arquivo: `docs/reports/PHASE_10_15_UX_ODONTOLOGY_REVIEW.md` (somente docs).

---

## Telas / arquivos alterados (principais)

| Área | Arquivos |
|------|----------|
| C3 Harness | `contracts-v2-technical-harness.ts`, `contractsShellConfig.js`, `ContractsShellLayout.jsx`, `ProtectedApp.jsx` |
| C2 Hub CTA | `BudgetHubCard.jsx`, `BudgetHubListView.jsx`, `BudgetsHubPage.jsx`, `clinicalBudgetHubService.js` |
| C5 Wizard + package | `OperationalContractWizard.jsx`, `operationalContractWizardService.js`, `operationalContractUi.js` |
| C4 Fila | `ContractsFilaPage.jsx`, `operationalContractQueueService.js` |
| C1 Assinatura pública | `ContractSignPublicPage.jsx`, `ContractSignPublicV2Page.jsx`, `publicSigningSummary.js`, `PublicSigningSummarySections.jsx`, `publicSignaturesV2Service.js`, `publicSignaturesV2Api.js` |
| CSS | `src/index.css` |
| Testes | `phase1016CriticalUxImplementation.test.js`, script `test:supabase:phase1016` |

---

## Fluxo antes / depois

### Antes

```text
/orcamentos → texto “Gerar contrato” (sem CTA)
  → abrir atendimento → aba Contratos → Gerar
TCLE / contrato em abas distintas
Assinatura pública: HTML + nome/CPF (sem resumo/parcelas/LGPD/PDF claro)
Fila admin: Pendentes/Assinados sem busca unificada
*-v2: visível se flags operacionais ligadas
```

### Depois

```text
/orcamentos → [Gerar contrato] / [Continuar] / [Ver contrato]
  → Wizard operacional (7 etapas) + pacote documental
Assinatura pública: Resumo → Documento → Privacidade → Assinar
Fila única /gestao/contratos/fila com busca/filtros/atalhos/CTAs
*-v2: somente TECHNICAL_HARNESS (env autorizado + flag técnica + admin/master)
```

---

## C1 — Assinatura pública compreensível

- Seções: **Resumo do seu tratamento**, **Condições financeiras**, **Privacidade e consentimentos**
- Valores exclusivamente do snapshot congelado (sem recálculo)
- Consentimentos obrigatórios/opcionais separados; **nenhuma pré-marcação**
- CTA **Visualizar documento completo** (PDF/HTML autorizado)
- Evidence report bloqueado no endpoint/document path
- Tipografia maior, etapas visíveis, mobile-first (`ctr-public-sign--v2ux`)
- V1 (`/assinatura/:token`) e V2 (`/assinar/v2/:token`) cobertos

## C2 — CTA real em `/orcamentos`

- Texto “Gerar contrato” virou botão funcional
- Validação: paciente, orçamento, tratamento, financeiro, duplicidade
- Estados: Gerar / Continuar / Ver + chip de status UX
- Abre `OperationalContractWizard` (não rotas `*-v2`)

## C3 — Isolamento do harness V2

- Guard: `isContractsV2TechnicalHarnessEnabled()`
- Exige: não-produção + ambiente autorizado/local/teste + `VITE_CONTRACTS_V2_TECHNICAL_HARNESS_ENABLED` + role `admin`/`master`
- Flags operacionais comuns **não** liberam nav/rotas `*-v2`
- Produção: sempre `false`
- Staging piloto operacional: usuário comum continua sem harness

## C4 — Fila administrativa

- Rota operacional: `/gestao/contratos/fila`
- Busca: paciente, número, orçamento, telefone, profissional
- Filtros: status, período, profissional, unidade, tipo, origem, pendência
- Atalhos: Todos / Rascunhos / Aguardando / Parcial / Assinados / Com problema
- CTAs contextuais por status UX
- Status **Com pendência** derivado na UI (sem novo enum de banco)

## C5 — Pacote documental (UX unificada)

- Conceito: **Pacote documental do tratamento**
- Wizard: Dados → Tratamento → Financeiro → Documentos → Signatários → Revisão → Assinatura
- Na etapa Documentos: Contrato + TCLE + LGPD + anexos/opcionais na mesma tela
- Cada item mantém `documentType`, versão, hash e aceite próprios
- Progresso persistido localmente (`operationalContractWizardProgress`)

---

## Wizard operacional

- Componente: `OperationalContractWizard`
- Entrada: CTA de `/orcamentos`
- Salva progresso, readiness por etapa, bloqueia avanço sem requisito
- Integra `GenerateContractModal` V1 na etapa Documentos
- Não usa páginas técnicas `*-v2`

## Status UX padronizados

Rascunho · Em revisão · Pronto para assinatura · Aguardando assinatura · Parcialmente assinado · Assinado · Cancelado · Com pendência

---

## Testes

Script: `npm run test:supabase:phase1016`  
Arquivo: `src/__tests__/phase1016CriticalUxImplementation.test.js`

Cobertura: CTA hub, duplicação, wizard/progresso, package TCLE+contrato, resumo público (tratamento/parcelas/LGPD/PDF/evidence), harness prod/operacional, busca/filtros/CTAs, mobile CSS, regressão V1/hub.

**Resultado:** 22/22 passed · **Build:** OK

## Validação manual (roteiro)

| Cenário | Foco | Registrar |
|---------|------|-----------|
| A | Orçamento aprovado sem contrato → Gerar | cliques, confusão, tempo, próxima ação |
| B | Contrato rascunho → Continuar | idem |
| C | Enviado aguardando assinatura | idem |
| D | Dois signatários, um assinou | parcial + CTA |
| E | Assinado → Ver/Baixar | idem |
| F | Package Contrato+TCLE+LGPD | checklist na etapa Documentos |
| G | Link no celular | tipografia, etapas, PDF, LGPD |

## Redução de cliques (meta)

| Fluxo | Antes (aprox.) | Depois (alvo) |
|-------|----------------|---------------|
| Orçamento → envio assinatura | 10–14 | **7–9** ações significativas |
| Paciente | HTML → assinar (sem contexto) | abrir → entender → visualizar → autenticar/aceitar → assinar (mesma página) |

## Regressões

- `/orcamentos` preservado (cards/lista/KPIs/criação)
- Shell V1 (Pendentes/Assinados/Modelos/Termos/Assinaturas/Config) preservado
- Sem dual-write financeiro novo
- Sem cutover V2 operacional

## Screenshots recomendados

1. Card `/orcamentos` com botão Gerar contrato  
2. Wizard etapa Documentos (package)  
3. Fila com busca + atalho “Aguardando assinatura”  
4. Assinatura pública mobile — resumo + parcelas + LGPD  
5. Nav Contratos **sem** itens `*-v2` para recepção  

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Resumo V2 server sem snapshot populado | Campos opcionais; UI degrada com título + LGPD default |
| PDF V1 best-effort via HTML | Preview HTML sempre disponível |
| Wizard progresso só local | Aceitável até cutover; sem schema novo |
| Pilot staging perde nav `*-v2` | Intencional (C3); liberar com flag técnica + admin |

## Pendências

- Validação manual A–G com usuários da clínica
- Popular `treatmentSummary`/`financialSummary` no `openSigningSession` server quando snapshots V2 existirem
- Beta interno controlado (sem flags de produção)
- Não fazer cutover operacional V2 nesta fase

## Gate

**READY_FOR_INTERNAL_UX_BETA**

## Next recommended phase

**PHASE_10.17 — Internal UX Beta**  
Piloto interno com recepção/comercial em staging, métricas de cliques/tempo, ajustes finos de copy e checklist odontológico — sem produção e sem ativar flags globais.
