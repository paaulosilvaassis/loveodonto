# Request — Read-only Verification Approval

**Objetivo:** aprovação própria para inspeção remota **somente read-only**.  
**≠** Human Approval · **≠** StageOneExecutionApproval.

**Proibido:** writes, migrations, storage upload, secret-read, flag-write, produção.

## Responsáveis
- Security / Read-only Verifier

## Campos

```text
verificationApprovalId:
authorizationPackageId:
environmentId:
tenantIds:
approvedBy:
approvedAt:
expiresAt:
allowedProbes: (registry allowlist only)
forbiddenOperations: insert, update, delete, migration, seed, ...
status: pending
```

## Riscos
Capabilidades que não garantem read-only → verificação bloqueada.

## Assinatura
```text
Aprovador: ____________________  Validade: __________
```
