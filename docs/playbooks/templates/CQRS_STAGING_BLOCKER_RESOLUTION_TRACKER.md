# Tracker — Staging Blocker Resolution

**Objetivo:** rastrear blockers do handoff.  
**Regra:** não marcar `resolved` sem evidência real.

| blockerId | severity | ownerRole | status | resolutionEvidence |
|-----------|----------|-----------|--------|--------------------|
| MISSING_STAGING_ENVIRONMENT | critical | staging_environment_owner | open | |
| MISSING_ENVIRONMENT_OWNER | critical | staging_environment_owner | open | |
| MISSING_HUMAN_APPROVAL | critical | stage_one_approver | open | |
| MISSING_PILOT_TENANTS | critical | tenant_owner | open | |
| READONLY_ACCESS_UNVERIFIED | critical | security_readonly_verifier | open | |
| MISSING_READONLY_VERIFICATION_APPROVAL | critical | security_readonly_verifier | open | |
| REMOTE_VERIFICATION_NOT_PERFORMED | high | security_readonly_verifier | open | |
| MISSING_STAGE_ONE_AUTHORIZATION | critical | stage_one_approver | open | |
| MISSING_EXECUTION_APPROVAL | critical | stage_one_approver | open | |
| ROLLBACK_NOT_HUMAN_REVIEWED | high | rollback_operator | open | |
| RISKS_NOT_HUMAN_ACCEPTED | high | business_owner | open | |

**Proibido produção / Stage 1 automatic.**
