# Template — Read-only Access Verification

**Declaração ≠ verificação remota runtime. Sem secrets no formulário.**

## Instruções
1. Confirme bloqueios de mutação/migration/storage/secrets.
2. `writeOperations` deve permanecer vazio.
3. Sem comprovação autorizada: `status: unverified`.
4. Mesmo com `verified_readonly`, o sistema marca apenas `declared_verified_readonly` até checagem remota futura.

## Campos obrigatórios

```text
connectionId:            [obrigatório]
environmentId:           [coincide com declaration]
verifiedBy:              [se verified_readonly]
verifiedAt:              [ISO-8601]
readOperations:
writeOperations:         []  (deve permanecer vazio)
mutationBlocked: true
migrationBlocked: true
storageWriteBlocked: true
secretAccessBlocked: true
environmentVariableWriteBlocked: true
verificationMethod:
expiresAt:
status: unverified
```

## Alerta
Não colar API keys, cookies, authorization headers ou connection strings.

## Assinatura
```text
Verificado por: ____________________  Método: __________  Validade: __________
```

## Checklist
- [ ] Todos os bloqueios = true
- [ ] Ambiente correto
- [ ] Sem writes declarados
- [ ] Validade definida se verified
