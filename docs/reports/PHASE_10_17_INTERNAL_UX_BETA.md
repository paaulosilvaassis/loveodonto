# PHASE_10.17 — INTERNAL UX BETA

## Status

**READY_FOR_CONTROLLED_CLINIC_PILOT**

## 1. Baseline

| Item | Valor |
|------|--------|
| Pré-requisito | PHASE_10.16 `READY_FOR_INTERNAL_UX_BETA` |
| Commits 10.16 | `02b86d0`, `47faffe`, `be63828`, `729a883`, `828260b` |
| Fluxo | `/orcamentos` → wizard 7 etapas → package → fila → assinatura pública |
| Infra | Sem migrations / RLS / schema / bucket / ledger |
| Produção | Flags OFF; sem deploy |

## 2. Ambiente

| Campo | Valor |
|-------|--------|
| Ambiente | Staging / local autorizado (dados 100% fictícios) |
| Tenant | Piloto técnico / clínica fictícia Staging Beta |
| Equipe | Admin / testador interno |
| Pacientes reais | Nenhum |
| CPF / telefone / e-mail reais | Nenhum |
| E-mail/SMS/WhatsApp real | Não disparado |
| Cutover V1 | Não executado |

## 3. Perfis simulados

| Perfil | Entende CTA? | Info demais? | Info de menos? | Próxima ação clara? | Termo técnico? | Volta ok? | Localiza contrato? | Ação perigosa fácil? |
|--------|--------------|--------------|----------------|---------------------|----------------|-----------|--------------------|----------------------|
| Recepcionista | Sim (após CTA real) | Antes: enums no package | Antes: quem falta assinar | Melhorou na fila | Removidos na UI | Sim (wizard Voltar) | Fila + busca | Não (anti-duplicata) |
| CRC / Comercial | Sim | Snapshot/hash (corrigido) | Preview resumo | Sim na revisão | Corrigido | Sim | Sim | Não |
| Administrador | Sim | Harness oculto | — | Sim | Harness isolado | Sim | Sim | Harness exige flag técnica |
| Dentista | Parcial (usa atendimento) | Baixo | Odontograma no wizard ainda resumido | Via atendimento/package | Não | Sim | Sim | Não |
| Paciente fictício | Sim (etapas) | Antes: hash/evidência | — | Etapas numeradas | Removido | Sim | N/A (link direto) | Não |

## 4–5. Cenários A–G e fluxo real

### Cenário A — Orçamento aprovado sem contrato
- **Antes:** texto “Gerar contrato” sem CTA funcional  
- **Depois:** botão → validações → wizard com paciente/tratamento/financeiro pré-preenchidos  
- **Resultado beta:** OK após correções de labels e view model  
- **Ações significativas (alvo):** 7–9  

### Cenário B — Contrato em rascunho
- CTA Continuar + progresso `operationalContractWizardProgress`  
- **Resultado:** OK  

### Cenário C — Pronto para assinatura
- Readiness por etapa + revisão completa + package  
- **Resultado:** OK (copy da revisão reforçada)  

### Cenário D — Aguardando assinatura
- Fila mostra paciente, tratamento, valor, status, próxima ação, quem falta  
- **Resultado:** OK  

### Cenário E — Parcialmente assinado
- Fila: “Já assinou” / “Falta assinar”  
- **Resultado:** OK  

### Cenário F — Assinado
- Status Assinado + Detalhes/PDF via modal; conteúdo assinado não editável no fluxo público  
- **Resultado:** OK  

### Cenário G — Paciente no celular
- Resumo → documento → privacidade → assinar na mesma página; tipografia/botões maiores  
- **Resultado:** OK após remoção de linguagem técnica  

## 6. Cliques por cenário (estimado pós-correção)

| Cenário | Telas | Ações significativas | Tempo aprox. |
|---------|-------|----------------------|--------------|
| A | Hub → Wizard → (modal gerar) | 7–9 | 3–6 min |
| B | Hub → Wizard (retoma etapa) | 3–5 | 1–3 min |
| C | Wizard revisão → assinatura | 2–4 | 1–2 min |
| D | Fila | 1–2 | &lt;1 min |
| E | Fila | 1–2 | &lt;1 min |
| F | Fila → Detalhes | 2 | &lt;1 min |
| G | 1 página pública (4 fases) | 5–7 | 2–4 min |

## 7. Bugs / problemas encontrados

| ID | Severidade | Área | Achado |
|----|------------|------|--------|
| B1 | ALTO | Wizard package | Exibia enums (`CONTRACT_SERVICES`) e falava em hash/versão |
| B2 | ALTO | Wizard financeiro | Menciona “snapshot”; valores crus sem R$ |
| B3 | ALTO | Assinatura V2 | “evidências técnicas”, hash abreviado, “metadados técnicos” |
| B4 | MÉDIO | Fila | Atalho “Com problema” (linguagem negativa/ambígua) |
| B5 | MÉDIO | Fila | Não mostrava quem assinou / quem falta |
| B6 | MÉDIO | Wizard etapas | Dados/tratamento/signatários incompletos para revisão confiante |
| B7 | MÉDIO | Mensagens | Erros curtíssimos sem orientação de próximo passo |
| B8 | MÉDIO | Toast envio | Exibia URL crua do link |
| B9 | BAIXO | Tratamento readiness | `missing` inconsistente quando só `planName` existia |
| B10 | BAIXO | Espaçamento mobile | Botões públicos poderiam ser maiores |

**Críticos abertos:** nenhum.

## 8. Bugs corrigidos

- Labels amigáveis no package (`labelDocumentType`)
- View model do wizard (`buildWizardViewModel`) com clínica, procedimentos, financeiro formatado
- Remoção de linguagem interna na assinatura pública
- Atalho **Com pendência**
- Signers na fila (`whoSigned` / `whoPending`)
- Catálogo `operationalUxMessages.js` (o que aconteceu + o que fazer)
- Toast de envio sem URL crua
- Readiness de tratamento
- CSS mobile (botões ≥ 3rem)

## 9–10. UX problems / melhorias

- Hierarquia “Quem / Tratamento / Quanto / Status / O que fazer agora” na fila  
- Revisão do wizard pergunta explicitamente se enviaria sem voltar  
- Consentimentos sem pré-marcação mantidos  
- Harness `*-v2` permanece isolado  

## 11. Wizard (checklist)

| Etapa | Status |
|-------|--------|
| 1 Dados | Paciente, responsável, clínica, profissional — sem IDs |
| 2 Tratamento | Procedimentos, dentes/regiões, observações |
| 3 Financeiro | Total, entrada, saldo, parcelas, forma — sem recálculo |
| 4 Documentos | Contrato + TCLE + LGPD + opcionais |
| 5 Signatários | Nome, papel, contato, ordem, obrigatoriedade |
| 6 Revisão | Resumo completo + package |
| 7 Assinatura | Status + próxima ação clara |

## 12. Fila administrativa

Busca/filtros/atalhos validados. Empty state profissional. CTAs contextuais preservados.

## 13–14. Assinatura pública / mobile

Paciente conclui na mesma página. Fonte maior, botões grandes, LGPD separada, PDF CTA, sem enums/IDs/hash/artifact/envelope na UI.

## 15. Regressão V1

- `/orcamentos` OK  
- Pendentes/Assinados V1 OK  
- `/assinatura/:token` OK  
- Harness não aparece para usuário comum  
- Flags produção não alteradas  
- Sem mudanças financeiras estruturais  

## 16. Testes

```bash
npm run test:supabase:phase1016   # 22/22 passed
npm run test:supabase:phase1017   # 16/16 passed
npx vitest run src/__tests__/contractModuleService.test.js  # 4/4 passed
```

## 17. Build

`npm run build` — OK.

## 18. Riscos

| Risco | Mitigação |
|-------|-----------|
| Odontograma visual ainda não é o foco do wizard | Snapshot textual suficiente para beta; piloto clínico pode pedir visual |
| Envio real de mensagem desligado | Intencional; staging só simula |
| Resumo V2 server ainda opcional | UI degrada com título + LGPD |

## 19. Pendências (para piloto clínico controlado)

- Sessão assistida com 1–2 usuários da clínica (ainda dados fictícios)
- Confirmar tempos reais de clique no staging
- Não ativar produção
- Não cutover V1

## 20. Screenshots recomendados

1. Hub com Gerar contrato  
2. Wizard etapas Dados/Documentos/Revisão  
3. Fila com “Falta assinar”  
4. Assinatura mobile — resumo + LGPD  
5. Nav Contratos sem `*-v2` para recepção  

## 21. Gate

**READY_FOR_CONTROLLED_CLINIC_PILOT**

### Next recommended phase

**PHASE_10.18 — Controlled Clinic Pilot**  
Piloto clínico controlado em staging com usuários da clínica e dados fictícios/anonimizados autorizados — sem produção e sem cutover V1.
