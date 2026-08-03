# Template — Staging Tenant Selection

**Não inventar IDs. Não usar wildcards. Sem secrets.**

## Instruções
1. Informe UUIDs reais de tenants staging.
2. Pelo menos um piloto.
3. Controle e excluídos sem overlap.
4. Não buscar tenants remotamente neste formulário — apenas declarar.

## Campos obrigatórios

```text
pilotTenantIds:            [mínimo 1, UUIDs explícitos]
controlTenantIds:
excludedTenantIds:
selectionReason:           [obrigatório]
selectedBy:                [obrigatório]
selectedAt:                [ISO-8601]
dataSensitivityReviewed: false
tenantOwnersNotified: false
```

## Formato (exemplo sem dados reais)
`pilotTenantIds: ["<uuid-piloto>"]`

## Proibido
`all`, `*`, `everyone`, listas vazias de piloto, overlap.

## Assinatura
```text
Selecionado por: ____________________  Data: __________
```

## Checklist
- [ ] IDs explícitos
- [ ] Sem duplicidade / overlap
- [ ] Owners notificados (quando aplicável)
- [ ] Sensibilidade revisada
