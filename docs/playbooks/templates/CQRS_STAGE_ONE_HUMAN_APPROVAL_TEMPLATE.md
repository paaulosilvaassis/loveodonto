# Template — Stage 1 Human Approval

**Não inventar aprovador. Sem autoaprovação. Sem secrets.**

## Instruções
1. Escopo exclusivo: `stage_one_observability`.
2. Preencher somente com tenants e ambiente reais já selecionados.
3. `status` permanece `pending` até assinatura humana real.
4. Aprovador ≠ inventado pelo sistema.
5. Validade (`expiresAt`) obrigatória se `approved`.

## Campos obrigatórios

```text
approvalId:              [obrigatório]
approvalScope: stage_one_observability
environmentId:           [deve coincidir com declaration]
tenantIds:               [explícitos, sem wildcards]
requestedBy:             [obrigatório]
requestedAt:             [ISO-8601]
status: pending
approvedBy:              [só se approved]
approvedAt:              [só se approved]
expiresAt:               [só se approved]
revokedAt:
reason:
riskAcknowledged: false
rollbackAcknowledged: false
```

## Alerta
Não inserir tokens, senhas, service role keys ou dados de pacientes.

## Assinatura / declaração
Declaro ter autoridade para aprovar somente o Stage 1 (observabilidade).

```text
Aprovador: ____________________  Data: __________  Validade até: __________
```

## Checklist
- [ ] Escopo = Stage 1 only
- [ ] Ambiente e tenants conferidos
- [ ] Riscos e rollback reconhecidos
- [ ] Sem autoaprovação silenciosa
