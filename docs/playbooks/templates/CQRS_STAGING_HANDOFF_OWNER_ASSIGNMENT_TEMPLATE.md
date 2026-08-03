# Template — Handoff Owner Assignment

**Owner Assignment ≠ Human Approval ≠ Read-only Authorization ≠ Stage 1 ≠ Execution Approval.**

Não preencher com nomes inventados. Sem secrets. Sem aprovação automática.

## Objetivo
Atribuir pessoas reais aos 9 papéis do handoff. A atribuição **não** aprova nenhuma etapa.

## Papéis e limitações

| roleId | responsabilidades | approvalsForbidden |
|--------|-------------------|--------------------|
| architecture_owner | versão/certificação | stage_one_execution, production |
| staging_environment_owner | declarar staging | production, all_tenants |
| security_readonly_verifier | verificação read-only | tenant_expansion, flag_write |
| tenant_owner | tenants explícitos | all_tenants, wildcard |
| business_owner | critérios de negócio | production, flag_write |
| stage_one_approver | Stage 1 only | production, execution auto |
| execution_operator | executa só com Execution Approval | self_approve |
| rollback_operator | rollback ordenado | skip_rollback_review |
| evidence_reviewer | revisa sem mutar evidências | mutate_evidence |

## Segregation
Approver ≠ Executor. Verifier ≠ Executor. Rollback Operator obrigatório.

## Assignment (vazio)

```text
roleId:
assignedPerson:
assignedBy:
assignedAt:
contactReference:
acknowledged: false
acknowledgedAt:
acknowledgementScope:
responsibilitiesAccepted: false
limitationsAccepted: false
notes:
justification:
validUntil:
```

## Dados proibidos
Senhas, tokens, service role, e-mails de pacientes, hosts inventados, tenants wildcards.

## Assinatura do submitter
```text
submittedBy: ____________________  Data: __________
```
