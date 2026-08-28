# Estratégia tenant-by-tenant

**Estado em 2026-08-28:** PHASE_10.21 = CLOSED. Piloto real CTR-2026-00005 PASS. `GLOBAL_ROLLOUT = BLOCKED`. `CONTROLLED_TENANT_EXPANSION = AUTHORIZED`. Próxima fase: **10.22**. Closeout: `PHASE_10_21_PRODUCTION_PILOT_CLOSEOUT.md`.

## Princípio

Ativar a UX operacional **um tenant por vez** em produção. V1 nunca é desligado. Domínio Contracts V2 técnico permanece OFF.

## Fases

| Fase | Ambiente | Critério de saída |
|------|----------|-------------------|
| A | Staging | Piloto 10.18 PASS |
| B | Produção — 1 tenant piloto | 48h sem alerta crítico + checklist jurídico |
| C | Produção — 3–5 tenants | Taxa assinatura pública ≥ 70% (n≥5) |
| D | Ampliação controlada | Sem rollback na onda anterior |
| E | Escala | Decisão de produto (fora do escopo 10.20) |

## Controles técnicos

1. `productionGlobalEnabled` default **false**
2. Allowlist de tenant IDs no painel `/gestao/contratos/rollout`
3. Unlock env `CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK` / `VITE_CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK` só para permitir o clique de ativação global
4. Frase de confirmação: `ATIVAR_PRODUCAO_OPERATIONAL_UX`
5. Rollback imediato zera global e marca `ROLLED_BACK`

## Ordem sugerida de tenants

1. Clínica interna / piloto controlado (menor volume)
2. Clínica com equipe treinada (doc TRAINING_10_MIN)
3. Demais, por volume crescente

## Métricas por onda

- Wizards abertos / concluídos
- Links gerados
- Assinatura pública aberta / concluída / falha
- Contagem de rollbacks

Pausar expansão se houver alerta `critical` no painel.
