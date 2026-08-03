# Request — Staging Tenant Authorization

**Objetivo:** autorizar tenants piloto/controle explícitos.  
**Proibido:** `all`, `*`, `everyone`; listagem global; secrets; PII de pacientes.

## Responsáveis
- Tenant Owner
- Business Owner

## Campos

```text
pilotTenantIds:
controlTenantIds:
excludedTenantIds:
selectionReason:
selectedBy:
selectedAt:
dataSensitivityReviewed: false
tenantOwnersNotified: false
```

## Checklist
- [ ] IDs explícitos
- [ ] Sem overlap
- [ ] Owners notificados

## Assinatura
```text
Tenant Owner: ____________________  Data: __________
```
