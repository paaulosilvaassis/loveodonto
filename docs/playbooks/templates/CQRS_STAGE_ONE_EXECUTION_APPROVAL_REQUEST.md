# Request — Stage 1 Execution Approval

**Objetivo:** aprovação **separada** de execução controlada do Stage 1.  
Stage 1 Authorization **não** substitui este documento.

**Proibido:** executar sem este approval; dryRunRequired deve permanecer true até política explícita.

## Responsáveis
- Stage 1 Approver (approval)
- Execution Operator (execução posterior — sem autoaprovação)

## Campos

```text
executionApprovalId:
authorizationPackageId:
approvedBy:
approvedAt:
expiresAt:
environmentId:
tenantIds:
allowedAction: controlled_stage_one_observability
dryRunRequired: true
maximumDurationHours: 72
status: pending
```

## Assinatura
```text
Execution Approver: ____________________  Validade: __________
```
