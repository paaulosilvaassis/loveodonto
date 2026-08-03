# Request — Staging Environment Information

**Objetivo:** obter declaração real do ambiente staging (não produção).  
**Proibido:** secrets, service role, tokens, connection strings, dados de pacientes.

## Responsáveis
- Staging Environment Owner
- Architecture Owner (conferência)

## Escopo
Somente Stage 1 observability. Não autoriza Stage 2 nem produção.

## Riscos
Ambiente incorreto / host de produção → abort imediato.

## Campos (vazios)

```text
environmentId:
environmentName:
environmentType: staging
host:
projectRef:
owner:
declaredBy:
declaredAt:
expiresAt:
confirmação de não produção: [ ] sim
```

## Assinatura
```text
Declarante: ____________________  Data: __________
```
