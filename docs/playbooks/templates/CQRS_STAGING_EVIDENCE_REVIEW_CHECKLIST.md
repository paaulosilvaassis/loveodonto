# Checklist — Staging Evidence Review

**Objetivo:** revisão humana de evidências sem alterá-las.  
Evidence Reviewer não muta evidências. Sem secrets.

## Evidências

| evidenceType | status | requiresHuman | requiresRemote | reviewed |
|--------------|--------|---------------|----------------|----------|
| architecture | prepared | no | no | [ ] |
| environment | manual_required | yes | no | [ ] |
| authorization | manual_required | yes | no | [ ] |
| tenant-selection | manual_required | yes | no | [ ] |
| readonly-capabilities | prepared | no | no | [ ] |
| flag-baseline | prepared | no | no | [ ] |
| production-exclusion | remote_required | no | yes | [ ] |
| guard-verification | prepared | no | no | [ ] |
| observability | remote_required | no | yes | [ ] |
| event-audit | remote_required | no | yes | [ ] |
| correlation | remote_required | no | yes | [ ] |
| causation | remote_required | no | yes | [ ] |
| tenant-scope | remote_required | no | yes | [ ] |
| health | prepared | no | no | [ ] |
| diagnostics | prepared | no | no | [ ] |
| rollback | manual_required | yes | no | [ ] |
| manual-review | manual_required | yes | no | [ ] |

## Assinatura
```text
Evidence Reviewer: ____________________  Data: __________
```
