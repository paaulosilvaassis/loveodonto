# Template — Staging Environment Declaration

**Não preencher com dados fictícios.** Preencher apenas com dados reais autorizados.

## Instruções
1. Identifique o staging real (não produção).
2. Informe host e projectRef explícitos.
3. Owner e declaredBy são obrigatórios.
4. Defina expiresAt (ISO-8601).
5. **Nunca** inserir secrets, service role, tokens ou connection strings.

## Campos obrigatórios

```text
environmentId:           [obrigatório]
environmentName:         [obrigatório]
environmentType: staging [obrigatório]
host:                    [obrigatório]
projectRef:              [obrigatório]
owner:                   [obrigatório]
declaredAt:              [ISO-8601]
declaredBy:              [obrigatório]
isProduction: false
isStaging: true
dataClassification:
allowedOperations: read, inspect
forbiddenOperations: write, mutate, migrate, seed, flag_activate
expiresAt:               [ISO-8601]
```

## Formato de exemplo (sem dados reais)
`host: <project-ref>.supabase.co` · `expiresAt: 2026-12-31T23:59:59.000Z`

## Assinatura / declaração
Declaro que os dados acima referem-se a ambiente de staging autorizado e não a produção.

```text
Assinatura: ____________________  Data: __________
```

## Checklist
- [ ] Não é produção
- [ ] Sem secrets no formulário
- [ ] Validade definida
- [ ] Escopo Stage 1 compreendido
