# PHASE_10.18 — CONTROLLED CLINIC PILOT

## Status

**READY_FOR_STAGED_ROLLOUT_PLAN**

## 1. Baseline

| Item | Valor |
|------|--------|
| Pré-requisito | PHASE_10.17 `READY_FOR_CONTROLLED_CLINIC_PILOT` |
| Commits 10.17 | `6e412e2`, `48b618a`, `c52caff` |
| Fluxo | `/orcamentos` → wizard → package → fila → assinatura pública |
| Produção | OFF |
| Infra | Sem migration / RLS / schema / bucket / ledger / cutover |

## 2. Ambiente

Staging + dados 100% fictícios. Nenhum paciente/CPF/telefone/e-mail/documento clínico/financeiro/prontuário real. Nenhum envio real. Observação assistida simulando equipe da clínica.

## 3. Usuários / perfis

| Perfil | Papel no piloto |
|--------|-----------------|
| Recepcionista | Localizar orçamento, continuar, fila |
| CRC / Comercial | Gerar pacote e preparar assinatura |
| Administrador | Fila, pendências, busca, overview |
| Dentista | Consultar documentos do tratamento |
| Paciente fictício | Assinatura mobile |

## 4–5. Tarefas e resultados por cenário

| # | Cenário | Resultado | Classificação |
|---|---------|----------|---------------|
| 1 | Novo orçamento → contrato | PASS (CTA Gerar como primário + wizard + fila) | PASS |
| 2 | Continuar incompleto | PASS (progresso + Continuar) | PASS |
| 3 | Contrato + TCLE | PASS (package único, docs separados) | PASS |
| 4 | Dois signatários | PASS (Já assinou / Falta assinar) | PASS |
| 5 | Pendência | PASS (motivo + “Como resolver”) | PASS |
| 6 | Contrato assinado | PASS (fila → detalhes/PDF) | PASS |
| 7 | Dentista | PASS (painel Documentos do tratamento) | PASS |
| 8 | Paciente mobile | PASS (mesma página, sem jargão) | PASS |

Críticos: nenhum FAIL.

## 6–8. Tempo / cliques / dúvidas (estimado pós-correção)

| Cenário | Cliques | Tempo | Dúvidas típicas pré-fix |
|---------|---------|-------|---------------------------|
| 1 | 7–9 | 4–6 min | “Onde gerar?” (CTA agora primário) |
| 2 | 3–5 | 1–3 min | Baixa |
| 3 | 6–8 | 3–5 min | “TCLE é outra aba?” (package resolve) |
| 4 | 1–2 | &lt;1 min | Baixa |
| 5 | 2–4 | 1–2 min | “O que fazer agora?” (hint) |
| 6 | 2–3 | &lt;1 min | Baixa |
| 7 | 2–3 | 1 min | Antes: sem visão clínica do package |
| 8 | 5–7 | 2–4 min | Baixa após 10.17 |

**Tasks without help (alvo pós-polish):** cenários 1–8 PASS  
**Tasks with help:** fricções médias residuais (orientação de 10 min suficiente)  
**Failures:** 0 críticas

## 9–10. Bugs encontrados / corrigidos

| ID | Sev | Achado | Correção |
|----|-----|--------|----------|
| P1 | HIGH | “Abrir orçamento” competia com “Gerar contrato” | CTA Gerar/Continuar como botão primário |
| P2 | HIGH | Fim do wizard sem próximo passo claro | “Ir para fila de assinaturas” + `onGoToQueue` |
| P3 | HIGH | Dentista sem visão do package | `ClinicalDocumentPackagePanel` no atendimento + aba paciente |
| P4 | MEDIUM | Pendência sem “como resolver” | `resolvePendencyFixHint` na fila |
| P5 | MEDIUM | Etapas do wizard não clicáveis para voltar | botões nas etapas concluídas |
| P6 | MEDIUM | Contato ausente pouco evidente | alerta no passo Signatários |
| P7 | LOW | Copy do hub pouco orientativa | dica “Orçamento aprovado? Use Gerar contrato” |

**CRITICAL abertos:** 0  
**HIGH abertos:** 0  

## 11. Problemas UX

Sem campos sobrepostos, sem enums em inglês na UI operacional, CTA principal visível, status em português.

## 12–15. Observações por perfil

### Recepção
Encontra `/orcamentos`, usa Gerar/Continuar, fila compreensível. Training: **YES_WITH_MINOR_TRAINING** (10 min: “Gerar no card → avançar wizard → fila”).

### CRC / Comercial
Package + revisão suficientes para preparar assinatura. Training: **YES**.

### Admin
Fila com busca/filtros/pendência + hint. Harness oculto. Training: **YES**.

### Dentista
Painel “Documentos do tratamento” no atendimento e na aba Orçamentos/Contratos. Training: **YES_WITH_MINOR_TRAINING**.

## 16. Mobile

Assinatura pública permanece em uma página; botões grandes; sem hash/evidence na UI.

## 17. Contratos / TCLE / LGPD

Package único operacional; documentos juridicamente distintos; obrigatório/opcional claros.

## 18–20. Fila / Wizard / Assinatura pública

Estáveis após polish do piloto. Wizard com retorno por etapa e CTA final para fila.

## 21. V1 regression

- `/orcamentos` OK  
- Pendentes/Assinados V1 OK  
- `/assinatura/:token` OK  
- Harness isolado  
- Flags produção OFF  
- Sem mudança financeira/prontuário estrutural  

## 22. Testes

```bash
npm run test:supabase:phase1016  # 22/22 passed
npm run test:supabase:phase1017  # 16/16 passed
npm run test:supabase:phase1018  # 12/12 passed
npx vitest run src/__tests__/contractModuleService.test.js  # 4/4 passed
```

## 23. Build

`npm run build` — OK.

## 24. Blockers

Nenhum `BLOCKER_POST_PILOT` de infraestrutura.  
Pendências não bloqueantes: odontograma visual rico no wizard; envio real de canal (fora do escopo).

## 25. Riscos

| Risco | Mitigação |
|-------|-----------|
| Treinamento zero absoluto em clínica nova | Script de 10 min no rollout plan |
| Staging ≠ carga real | Rollout gradual por unidade |

## 26. Training assessment

| Perfil | Resultado |
|--------|-----------|
| Recepcionista | YES_WITH_MINOR_TRAINING |
| CRC | YES |
| Admin | YES |
| Dentista | YES_WITH_MINOR_TRAINING |
| Paciente mobile | YES (link único) |

Nenhum perfil **NO**.

## 27. Gate

**READY_FOR_STAGED_ROLLOUT_PLAN**

## 28. Próxima fase

**PHASE_10.19 — Staged Rollout Plan**  
Plano de ativação gradual (unidade/tenant), checklist de treinamento de 10 minutos, critérios de rollback — **sem** ativar produção nesta fase seguinte até aprovação explícita.
