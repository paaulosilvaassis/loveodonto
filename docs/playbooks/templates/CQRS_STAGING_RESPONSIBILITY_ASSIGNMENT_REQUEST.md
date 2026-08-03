# Request — Staging Responsibility Assignment

**Objetivo:** atribuir pessoas reais aos papéis do handoff.  
**Proibido:** inventar nomes; autoatribuição silenciosa; secrets.

## Papéis (assignedPerson vazio)

| roleId | roleName | assignedPerson |
|--------|----------|----------------|
| architecture_owner | Architecture Owner | |
| staging_environment_owner | Staging Environment Owner | |
| security_readonly_verifier | Security / Read-only Verifier | |
| tenant_owner | Tenant Owner | |
| business_owner | Business Owner | |
| stage_one_approver | Stage 1 Approver | |
| execution_operator | Execution Operator | |
| rollback_operator | Rollback Operator | |
| evidence_reviewer | Evidence Reviewer | |

## Segregation of Duties
Solicitante ≠ aprovador automático. Executor ≠ aprovador automático.  
Mesma pessoa em papéis conflitantes exige justificativa + revisão independente.

## Assinatura
```text
Coordenador do handoff: ____________________  Data: __________
```
