# Template — Stage 1 Risk Acknowledgement

**Aceite individual obrigatório. Sem aceite global. Sem secrets.**

## Instruções
1. Cada risco: `accepted: true` + `acceptedBy` + `acceptedAt` + `mitigation`.
2. Checkbox vazio ≠ aceito.
3. Não preenchimento automático.

## Riscos obrigatórios

| riskId | description | severity | accepted | acceptedBy | acceptedAt | mitigation |
|--------|-------------|----------|----------|------------|------------|------------|
| rejected_events | eventos rejeitados | high | false | | | |
| broken_correlation | correlation quebrada | high | false | | | |
| inconsistent_causation | causation inconsistente | medium | false | | | |
| tenant_mismatch | tenant mismatch | critical | false | | | |
| memory_growth | crescimento de memória | medium | false | | | |
| process_local_metrics | métricas process-local | medium | false | | | |
| inmemory_loss | perda in-memory | high | false | | | |
| wrong_host | host incorreto | critical | false | | | |
| out_of_scope_activation | ativação fora de escopo | critical | false | | | |
| manual_rollback_failure | falha rollback manual | high | false | | | |

## Assinatura
```text
Riscos aceitos por: ____________________  Validade: __________
```

## Checklist
- [ ] Todos os 10 riscos individualizados
- [ ] Mitigações preenchidas
- [ ] Sem aceite automático
