# PHASE_10.20 — PRODUCTION READINESS & GRADUAL ROLLOUT

## Status / Gate

**READY_FOR_PRODUCTION_ACTIVATION**

> Esta fase **não ativa produção automaticamente**.  
> V1 permanece ligado. Sem migration, schema, RLS, bucket ou ledger.  
> Harness técnico Contracts V2 (`*-v2`) permanece isolado e OFF em produção.

## 1. Baseline

| Item | Valor |
|------|--------|
| Pré-requisito | PHASE_10.18 `READY_FOR_STAGED_ROLLOUT_PLAN` |
| Escopo | UX operacional (wizard, fila, package, assinatura pública) sobre V1 |
| Fora de escopo | Cutover domínio V2, desligar V1, migrations |
| Staging ref | `tckdjyunwmdpqmewrwvt` |
| Production ref | `uoepkwhqztmsjnzirpev` (bloqueado por default) |

## 2. Estratégia de rollout

Ver também `docs/contracts/TENANT_BY_TENANT_ROLLOUT.md`.

1. Staging validado (10.16–10.18)
2. Painel interno `/gestao/contratos/rollout` (admin/master)
3. Produção: `productionGlobalEnabled=false` por default
4. Inclusão tenant-by-tenant na allowlist
5. Unlock env + frase `ATIVAR_PRODUCAO_OPERATIONAL_UX` para ligar global
6. Ondas: 1 → 3–5 → ampliação, com pausa em alerta crítico

### Modos operacionais

| Modo | Efeito |
|------|--------|
| `OPERATIONAL_UX` | Wizard/CTA no hub (staging/dev; produção só com global+allowlist) |
| `V1_ONLY` | Fluxo clássico; sem Gerar/Continuar no hub |
| `ROLLED_BACK` | Igual V1_ONLY + auditoria de emergência + global OFF |

## 3. Estratégia de rollback

Ver `docs/contracts/EMERGENCY_ROLLBACK.md`.

- Botão **Rollback imediato** no painel
- Zera `productionGlobalEnabled`
- Modo `ROLLED_BACK`
- Contratos existentes permanecem legíveis via V1
- Reativação só após RCA

## 4. Métricas e observabilidade

Módulo: `contracts-rollout-metrics.ts` + painel.

Eventos (sem PII): `wizard_opened`, `wizard_completed`, `signature_link_generated`, `public_sign_*`, `rollback_triggered`, `mode_changed`, etc.

Alertas:

- Rollback registrado → warning
- Taxa assinatura pública &lt; 70% (n≥5) → critical
- Conclusão wizard &lt; 50% (n≥10) → warning

Persistência: localStorage + chave IndexedDB best-effort (`contractsOperationalRollout`). Sem schema novo.

## 5. Monitoramento

| Canal | O quê |
|-------|-------|
| Painel Rollout | Contadores, alertas, auditoria |
| Operações | Revisar métricas a cada onda (24–48h) |
| Incidente | Seguir EMERGENCY_ROLLBACK.md |

Não há dependência de APM externo nesta fase.

## 6. Documentação

| Doc | Uso |
|-----|-----|
| `docs/contracts/TRAINING_10_MIN.md` | Treinamento operacional |
| `docs/contracts/LEGAL_CHECKLIST.md` | Liberação jurídica por tenant |
| `docs/contracts/EMERGENCY_ROLLBACK.md` | Emergência |
| `docs/contracts/TENANT_BY_TENANT_ROLLOUT.md` | Onda de tenants |
| Este relatório | Gate e critérios |

## 7. Checklist jurídico

Itens em `LEGAL_CHECKLIST.md` (modelos, LGPD, menores, contestação, V1 preservado, autorização de allowlist). Obrigatório antes de cada tenant de produção.

## 8. Plano de ativação (humano — não automático)

1. Treinar equipe (10 min)
2. Completar checklist jurídico do tenant
3. Deploy do código desta fase (flags ainda OFF em prod)
4. Admin: allowlist do tenant
5. Ops: setar unlock env apenas no momento da ativação
6. Admin: frase de confirmação → ligar produção global
7. Validar 1 fluxo ponta a ponta fictício/controlado
8. Monitorar 48h
9. Remover unlock env após ativação (recomendado)
10. Ampliar allowlist só se sem alerta crítico

## 9. Plano de emergência

Resumo: rollback no painel → comunicação “modo clássico” → incidente → RCA → reativação controlada. Detalhes em `EMERGENCY_ROLLBACK.md`.

## 10. Critérios objetivos de go-live

| Critério | Status |
|----------|--------|
| Testes phase1016/1017/1018 | PASS (pré-requisito) |
| Testes phase1020 | PASS |
| Build OK | Requerido no CI/local |
| Regressão V1 (módulo clássico disponível) | PASS |
| Harness isolado em produção | PASS |
| Flags domínio V2 OFF por default | PASS |
| Checklist jurídico documentado | PASS (doc) |
| Treinamento documentado | PASS |
| Rollback testado (unitário + painel) | PASS |
| Monitoramento no painel | PASS |
| Sem bugs críticos abertos do piloto | PASS (10.18) |

**Gate do serviço:** `evaluateGoLiveReadiness` → `READY_FOR_PRODUCTION_ACTIVATION`.

## 11. Implementação entregue

| Artefato | Caminho |
|----------|---------|
| Modo operacional | `src/domain/contracts/rollout/contracts-operational-mode.ts` |
| Métricas | `src/domain/contracts/rollout/contracts-rollout-metrics.ts` |
| Facade | `src/services/contractsOperationalRolloutService.js` |
| Painel | `src/pages/contratos/ContractsRolloutPage.jsx` |
| Rota/nav | `/gestao/contratos/rollout` |
| Gate hub | `operationalUxEnabled` em BudgetsHub + cards |
| Testes | `src/__tests__/phase1020ProductionReadiness.test.js` |

## 12. Riscos

| Risco | Mitigação |
|-------|-----------|
| Ativação acidental em produção | Global OFF + unlock env + frase |
| Confusão V1 vs harness V2 | Treinamento; nav `*-v2` isolada |
| Fricção UX em tenant novo | Ondas pequenas + rollback |
| Métricas só locais | Suficiente para piloto; evolução futura opcional |
| Admin/gerente veem nav por regra do shell | Página bloqueia não-admin/master |

## 13. Pendências (pós-gate, antes da ativação real)

- [ ] Assinar checklist jurídico do **primeiro** tenant de produção
- [ ] Agendar treinamento da equipe da clínica piloto
- [ ] Definir janela de monitoramento 48h
- [ ] Decisão humana explícita de ativação (fora deste commit)
- [ ] (Opcional) Telemetria agregada server-side em fase futura

## 14. O que esta fase NÃO fez

- Não ativou produção
- Não desligou V1
- Não criou migrations
- Não alterou schema / RLS / bucket / ledger
- Não habilitou flags de domínio Contracts V2 em produção

## 15. Comando de teste

```bash
npm run test:supabase:phase1020
```

## 16. Gate final

**READY_FOR_PRODUCTION_ACTIVATION**
