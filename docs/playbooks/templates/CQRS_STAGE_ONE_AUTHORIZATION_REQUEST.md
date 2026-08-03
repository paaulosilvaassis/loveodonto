# Request — Stage 1 Authorization

**Objetivo:** autorizar **somente** Stage 1 (3 flags de observabilidade).  
**Não** autoriza execução, produção, consumers, CQRS, Read Models.

## Flags permitidas
```text
DOMAIN_EVENTS
DOMAIN_EVENT_AUDIT
DOMAIN_EVENT_OBSERVABILITY
```

## Responsáveis
- Stage 1 Approver
- Business Owner (ack)

## Campos

```text
authorizationId:
environmentId:
tenantIds:
authorizedBy:
authorizedAt:
expiresAt:
maximumDurationHours: 72
successCriteria:
failureCriteria:
rollbackPlanId:
status: pending
```

## Assinatura
```text
Stage 1 Approver: ____________________  Data: __________
```
