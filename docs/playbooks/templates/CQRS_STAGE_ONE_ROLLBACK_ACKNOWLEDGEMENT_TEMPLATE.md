# Template — Stage 1 Rollback Acknowledgement

**Ordem obrigatória. Sem execução nesta fase. Sem secrets.**

## Instruções
Confirme revisão da ordem abaixo. Não altere a sequência.

```text
1. DOMAIN_EVENT_OBSERVABILITY=false
2. DOMAIN_EVENT_AUDIT=false
3. DOMAIN_EVENTS=false
```

## Campos obrigatórios

```text
rollbackPlanId: stage1-rollback-observability
reviewed: false
reviewedBy:              [obrigatório se reviewed=true]
reviewedAt:              [ISO-8601]
flagsToDisable: (ordem acima)
maximumRollbackTimeMinutes: 15
dataImpact: none_operational
indexedDbImpact: preserved
supabaseImpact: untouched
evidencePreservation: true
status: pending
```

## Assinatura
```text
Revisado por: ____________________  Data: __________
```

## Checklist
- [ ] Ordem correta
- [ ] Três flags exatamente
- [ ] Impacto documentado
- [ ] Evidências preserváveis
