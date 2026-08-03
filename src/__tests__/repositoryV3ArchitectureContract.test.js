/**
 * Phase 5.15 — Contrato arquitetural Repository V3 (cross-domain).
 * Valida invariantes compartilhados sem duplicar testes de domínio.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyVitestIsolationContract,
  AGENDA_TEST_FLAG_CONTRACT,
  CLINIC_PROFILE_TEST_FLAG_CONTRACT,
  FINANCIAL_TEST_FLAG_CONTRACT,
  CRM_TEST_FLAG_CONTRACT,
  DOMAIN_EVENT_TEST_FLAG_CONTRACT,
  RH_TEST_FLAG_CONTRACT,
} from './rhTestFlagContract.js';
import {
  getCollaboratorRepositoryFlags,
  COLLABORATOR_REPOSITORY_PRODUCTION_LOCKED_FLAGS,
  PRODUCTION_SUPABASE_PROJECT_REF as RH_PROD_REF,
} from '../repositories/collaborator/collaboratorRepositoryFlags.ts';
import {
  getClinicProfileRepositoryFlags,
  CLINIC_PROFILE_PRODUCTION_LOCKED_FLAGS,
  PRODUCTION_SUPABASE_PROJECT_REF as CLINIC_PROD_REF,
} from '../repositories/clinicProfile/clinicProfileRepositoryFlags.ts';
import {
  getAgendaRepositoryFlags,
  AGENDA_PRODUCTION_LOCKED_FLAGS,
  PRODUCTION_SUPABASE_PROJECT_REF as AGENDA_PROD_REF,
} from '../repositories/agenda/agendaRepositoryFlags.ts';
import {
  getFinancialRepositoryFlags,
  FINANCIAL_PRODUCTION_LOCKED_FLAGS,
  PRODUCTION_SUPABASE_PROJECT_REF as FIN_PROD_REF,
} from '../repositories/financial/financialRepositoryFlags.ts';
import {
  getCrmRepositoryFlags,
  CRM_PRODUCTION_LOCKED_FLAGS,
  PRODUCTION_SUPABASE_PROJECT_REF as CRM_PROD_REF,
} from '../repositories/crm/crmRepositoryFlags.ts';
import {
  getCrmActivityFlags,
  CRM_ACTIVITY_PRODUCTION_LOCKED_FLAGS,
} from '../repositories/crm/crmActivityFlags.ts';
import {
  getDomainEventFlags,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  PRODUCTION_SUPABASE_PROJECT_REF as DOMAIN_EVENT_PROD_REF,
} from '../domain-events/domainEventFlags.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const DOMAIN_REPOS = [
  {
    name: 'collaborator',
    path: 'repositories/collaborator',
    required: [
      'collaboratorRepository.ts',
      'collaboratorRepositoryFlags.ts',
      'collaboratorMapper.ts',
      'collaboratorIndexedDbRepository.ts',
      'collaboratorCache.ts',
    ],
  },
  {
    name: 'clinicProfile',
    path: 'repositories/clinicProfile',
    required: [
      'clinicProfileRepository.ts',
      'clinicProfileRepositoryFlags.ts',
      'clinicProfileMapper.ts',
      'clinicProfileIndexedDbRepository.ts',
      'clinicProfileCache.ts',
    ],
  },
  {
    name: 'agenda',
    path: 'repositories/agenda',
    required: [
      'agendaRepository.ts',
      'agendaRepositoryFlags.ts',
      'agendaMapper.ts',
      'agendaIndexedDbRepository.ts',
      'agendaCache.ts',
    ],
  },
  {
    name: 'financial',
    path: 'repositories/financial',
    required: [
      'financialRepository.ts',
      'financialRepositoryFlags.ts',
      'financialMapper.ts',
      'financialIndexedDbRepository.ts',
      'financialCache.ts',
    ],
  },
  {
    name: 'crm',
    path: 'repositories/crm',
    required: [
      'crmRepository.ts',
      'crmRepositoryFlags.ts',
      'crmMapper.ts',
      'crmIndexedDbRepository.ts',
      'crmCache.ts',
      'crmActivityTypes.ts',
      'crmActivityMapper.ts',
      'crmActivityFlags.ts',
      'crmActivityRepository.ts',
      'crmActivityWritePipeline.ts',
      'crmActivityHydrate.ts',
      'crmActivityWriteSoak.ts',
    ],
  },
  {
    name: 'domain-events',
    path: 'domain-events',
    required: [
      'domainEventTypes.ts',
      'domainEventMapper.ts',
      'domainEventBus.ts',
      'domainEventDispatcher.ts',
      'domainEventRegistry.ts',
      'domainEventContracts.ts',
      'domainEventFlags.ts',
      'domainEventAudit.ts',
    ],
  },
  {
    name: 'domain-events/shared',
    path: 'domain-events/shared',
    required: [
      'domainEventPublisher.ts',
      'domainEventValidator.ts',
      'domainEventSerializer.ts',
      'domainEventCorrelation.ts',
      'domainEventRetry.ts',
      'domainEventDeduplication.ts',
      'domainEventSubscriberBase.ts',
      'domainEventAuditHooks.ts',
      'domainEventFacade.ts',
    ],
  },
  {
    name: 'domain-events/observability',
    path: 'domain-events/observability',
    required: [
      'domainEventMetrics.ts',
      'domainEventTrace.ts',
      'domainEventTimeline.ts',
      'domainEventDiagnostics.ts',
      'domainEventHealth.ts',
      'domainEventInspector.ts',
      'attachDomainEventObservability.ts',
    ],
  },
  {
    name: 'domain-events/consumers',
    path: 'domain-events/consumers',
    required: [
      'domainEventConsumerTypes.ts',
      'domainEventConsumerRegistry.ts',
      'domainEventConsumerContracts.ts',
      'domainEventConsumerContext.ts',
      'domainEventConsumerRunner.ts',
      'domainEventConsumerDispatcher.ts',
      'domainEventConsumerRetry.ts',
      'domainEventConsumerDeadLetter.ts',
      'domainEventConsumerAudit.ts',
      'domainEventConsumerHealth.ts',
      'eventAuditProjectionStore.ts',
      'eventAuditProjectionConsumer.ts',
      'attachEventAuditProjection.ts',
    ],
  },
  {
    name: 'domain-events/projections',
    path: 'domain-events/projections',
    required: [
      'analyticsProjectionTypes.ts',
      'analyticsProjectionStore.ts',
      'analyticsProjectionBuilder.ts',
      'analyticsProjectionReducer.ts',
      'analyticsProjectionRegistry.ts',
      'analyticsProjectionInspector.ts',
      'analyticsProjectionMetrics.ts',
      'analyticsProjectionHealth.ts',
      'analyticsProjectionScope.ts',
      'analyticsProjectionDiagnostics.ts',
      'index.ts',
    ],
  },
  {
    name: 'domain-events/read-models',
    path: 'domain-events/read-models',
    required: [
      'leadAnalyticsTypes.ts',
      'leadAnalyticsBuilder.ts',
      'leadAnalyticsStore.ts',
      'leadAnalyticsMetrics.ts',
      'leadAnalyticsHealth.ts',
      'leadAnalyticsReadModel.ts',
      'leadAnalyticsInspector.ts',
      'leadAnalyticsDefinition.ts',
      'leadAnalyticsCompatibility.ts',
      'appointmentAnalytics.ts',
      'financialAnalytics.ts',
      'attachAnalyticsReadModels.ts',
      'analyticsReadModelRefresh.ts',
      'index.ts',
    ],
  },
  {
    name: 'domain-events/read-models/shared',
    path: 'domain-events/read-models/shared',
    required: [
      'readModelTypes.ts',
      'readModelRegistry.ts',
      'readModelLifecycle.ts',
      'readModelBuilder.ts',
      'readModelCache.ts',
      'readModelSnapshot.ts',
      'readModelMetrics.ts',
      'readModelHealth.ts',
      'readModelInspector.ts',
      'readModelFlags.ts',
      'readModelTenant.ts',
      'readModelProjectionScope.ts',
      'readModelSoakTypes.ts',
      'readModelSoakMetrics.ts',
      'readModelDriftDetector.ts',
      'readModelConsistency.ts',
      'readModelSoakRunner.ts',
      'readModelSoakReport.ts',
      'readModelPromotionTypes.ts',
      'readModelPromotionChecklist.ts',
      'readModelPromotionEvaluator.ts',
      'readModelPromotionReport.ts',
      'readModelPromotionHealth.ts',
      'readModelPromotionInspector.ts',
      'index.ts',
    ],
  },
  {
    name: 'domain-events/certification',
    path: 'domain-events/certification',
    required: [
      'cqrsArchitectureVersion.ts',
      'cqrsCertificationTypes.ts',
      'cqrsCertificationEvidence.ts',
      'cqrsCertificationHumanApproval.ts',
      'cqrsCertificationStaging.ts',
      'cqrsCertificationGates.ts',
      'cqrsCertificationHistory.ts',
      'cqrsCertificationReport.ts',
      'cqrsCertificationHealth.ts',
      'cqrsCertificationInspector.ts',
      'index.ts',
    ],
  },
  {
    name: 'domain-events/staging-activation',
    path: 'domain-events/staging-activation',
    required: [
      'stagingActivationTypes.ts',
      'stagingEnvironmentContract.ts',
      'stagingHumanAuthorization.ts',
      'stagingTenantSelection.ts',
      'stagingFlagMatrix.ts',
      'stagingRollback.ts',
      'stagingCriteria.ts',
      'stagingSoakPlan.ts',
      'stagingEvidence.ts',
      'stagingPreflight.ts',
      'stagingActivationGuards.ts',
      'stagingActivationPlan.ts',
      'stagingActivationHistory.ts',
      'stagingActivationReport.ts',
      'stagingActivationInspector.ts',
      'stagingPreflightExecutionTypes.ts',
      'stagingPreflightExecutionEvidence.ts',
      'stagingPreflightExecutionRunner.ts',
      'stagingPreflightLocalReadiness.ts',
      'stagingPreflightHistory.ts',
      'stagingPreflightReport.ts',
      'stagingPreflightInspector.ts',
      'index.ts',
    ],
  },
  {
    name: 'domain-events/staging-activation/authorization',
    path: 'domain-events/staging-activation/authorization',
    required: [
      'stagingAuthorizationTypes.ts',
      'stagingEnvironmentDeclaration.ts',
      'stagingHumanApproval.ts',
      'stagingTenantSelection.ts',
      'stagingReadonlyAccessDeclaration.ts',
      'stageOneAuthorization.ts',
      'stagingRollbackAcknowledgement.ts',
      'stagingEvidenceAcknowledgement.ts',
      'stagingRiskAcknowledgement.ts',
      'stagingAuthorizationValidator.ts',
      'stagingAuthorizationPackage.ts',
      'stageOneReadinessGate.ts',
      'stageOneExecutionCommand.ts',
      'stagingAuthorizationHistory.ts',
      'stagingAuthorizationReport.ts',
      'stagingAuthorizationInspector.ts',
      'index.ts',
    ],
  },
  {
    name: 'domain-events/staging-activation/authorization-intake',
    path: 'domain-events/staging-activation/authorization-intake',
    required: [
      'stagingAuthorizationIntakeTypes.ts',
      'stagingAuthorizationInputSchema.ts',
      'stagingAuthorizationInputParser.ts',
      'stagingAuthorizationInputSanitizer.ts',
      'stagingAuthorizationInputValidator.ts',
      'stagingAuthorizationCrossValidator.ts',
      'stagingAuthorizationCompleteness.ts',
      'stagingAuthorizationFinalGate.ts',
      'stageOneExecutionApproval.ts',
      'stagingAuthorizationIntakeService.ts',
      'stagingAuthorizationIntakeHistory.ts',
      'stagingAuthorizationIntakeReport.ts',
      'stagingAuthorizationIntakeInspector.ts',
      'index.ts',
    ],
  },
  {
    name: 'domain-events/staging-activation/readonly-verification',
    path: 'domain-events/staging-activation/readonly-verification',
    required: [
      'readonlyVerificationTypes.ts',
      'readonlyVerificationApproval.ts',
      'readonlyVerificationSession.ts',
      'readonlyVerificationCapabilities.ts',
      'readonlyVerificationProbeRegistry.ts',
      'readonlyVerificationRunner.ts',
      'readonlyVerificationEvidence.ts',
      'readonlyVerificationReport.ts',
      'readonlyVerificationInspector.ts',
      'index.ts',
    ],
  },
  {
    name: 'domain-events/staging-activation/handoff',
    path: 'domain-events/staging-activation/handoff',
    required: [
      'stagingHandoffTypes.ts',
      'stagingHandoffPackage.ts',
      'stagingResponsibilityMatrix.ts',
      'stagingSegregationOfDuties.ts',
      'stagingRequiredDataChecklist.ts',
      'stagingApprovalChain.ts',
      'stagingEvidenceReadiness.ts',
      'stagingBlockerTracker.ts',
      'stagingHumanReviewChecklist.ts',
      'stagingHandoffValidator.ts',
      'stagingHandoffReadinessGate.ts',
      'stagingHandoffReport.ts',
      'stagingHandoffInspector.ts',
      'index.ts',
    ],
  },
  {
    name: 'domain-events/staging-activation/handoff/owner-assignment',
    path: 'domain-events/staging-activation/handoff/owner-assignment',
    required: [
      'ownerAssignmentTypes.ts',
      'ownerAssignmentParser.ts',
      'ownerAssignmentSanitizer.ts',
      'ownerAssignmentConflicts.ts',
      'ownerAssignmentEnvTenant.ts',
      'ownerAssignmentCompleteness.ts',
      'ownerAssignmentReadinessGate.ts',
      'ownerAssignmentService.ts',
      'ownerAssignmentReport.ts',
      'ownerAssignmentInspector.ts',
      'index.ts',
    ],
  },
];

const FLAG_DOMAIN_CONFIG = [
  {
    label: 'RH',
    resolver: getCollaboratorRepositoryFlags,
    lockedKeys: COLLABORATOR_REPOSITORY_PRODUCTION_LOCKED_FLAGS,
  },
  {
    label: 'Clinic',
    resolver: getClinicProfileRepositoryFlags,
    lockedKeys: CLINIC_PROFILE_PRODUCTION_LOCKED_FLAGS,
  },
  {
    label: 'Agenda',
    resolver: getAgendaRepositoryFlags,
    lockedKeys: AGENDA_PRODUCTION_LOCKED_FLAGS,
  },
  {
    label: 'Financial',
    resolver: getFinancialRepositoryFlags,
    lockedKeys: FINANCIAL_PRODUCTION_LOCKED_FLAGS,
  },
  {
    label: 'CRM',
    resolver: getCrmRepositoryFlags,
    lockedKeys: CRM_PRODUCTION_LOCKED_FLAGS,
  },
  {
    label: 'CRM Activity',
    resolver: getCrmActivityFlags,
    lockedKeys: CRM_ACTIVITY_PRODUCTION_LOCKED_FLAGS,
  },
  {
    label: 'Domain Events',
    resolver: getDomainEventFlags,
    lockedKeys: DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  },
];

function buildAllTrueOverrides(lockedKeys) {
  return Object.fromEntries(lockedKeys.map((key) => [key, true]));
}

describe('repositoryV3ArchitectureContract — estrutura', () => {
  it.each(DOMAIN_REPOS)('$name possui arquivos foundation obrigatórios', ({ path: relPath, required }) => {
    const abs = path.join(REPO_ROOT, relPath);
    const files = fs.readdirSync(abs);
    for (const file of required) {
      expect(files, `ausente: ${file}`).toContain(file);
    }
  });

  it('documentação oficial Repository V3 existe', () => {
    const doc = path.resolve(REPO_ROOT, '../docs/platform/LOVE_ODONTO_V3_REPOSITORY_PATTERN.md');
    expect(fs.existsSync(doc)).toBe(true);
  });

  it('checklist migração existe', () => {
    const checklist = path.resolve(REPO_ROOT, '../docs/playbooks/REPOSITORY_V3_MIGRATION_CHECKLIST.md');
    expect(fs.existsSync(checklist)).toBe(true);
  });
});

describe('repositoryV3ArchitectureContract — flags default OFF', () => {
  it.each(FLAG_DOMAIN_CONFIG)('$label — flags production-locked false por default', ({ resolver, lockedKeys }) => {
    const flags = resolver();
    for (const key of lockedKeys) {
      expect(flags[key]).toBe(false);
    }
  });

  it.each(FLAG_DOMAIN_CONFIG)('$label — PROD runtime trava flags perigosas', ({ resolver, lockedKeys }) => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = resolver({
        overrides: buildAllTrueOverrides(lockedKeys),
      });
      for (const key of lockedKeys) {
        expect(flags[key]).toBe(false);
      }
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });
});

describe('repositoryV3ArchitectureContract — vitest isolation', () => {
  it('contratos de flag default false no Vitest', () => {
    for (const contract of [
      RH_TEST_FLAG_CONTRACT,
      CLINIC_PROFILE_TEST_FLAG_CONTRACT,
      AGENDA_TEST_FLAG_CONTRACT,
      FINANCIAL_TEST_FLAG_CONTRACT,
      CRM_TEST_FLAG_CONTRACT,
      DOMAIN_EVENT_TEST_FLAG_CONTRACT,
    ]) {
      for (const value of Object.values(contract)) {
        expect(value).toBe('false');
      }
    }
  });

  it('applyVitestIsolationContract stub env perigosos', () => {
    vi.stubEnv('VITE_FINANCIAL_WRITE_PRIMARY', 'true');
    applyVitestIsolationContract(vi);
    expect(import.meta.env.VITE_FINANCIAL_WRITE_PRIMARY).toBe('false');
    vi.unstubAllEnvs();
  });
});

describe('repositoryV3ArchitectureContract — bridges e adapters', () => {
  const bridges = [
    'services/collaboratorServiceRepositoryBridge.js',
    'services/clinicProfileServiceRepositoryBridge.js',
    'services/agendaRepositoryBridge.js',
    'services/financialRepositoryBridge.js',
    'services/crmRepositoryBridge.js',
  ];

  it.each(bridges)('%s existe', (rel) => {
    expect(fs.existsSync(path.join(REPO_ROOT, rel))).toBe(true);
  });

  const writeAdapters = [
    'services/collaboratorServiceWriteAdapter.js',
    'services/clinicProfileServiceWriteAdapter.js',
    'services/agendaWriteAdapter.js',
    'services/financialWriteAdapter.js',
    'services/crmReadAdapter.js',
  ];

  it.each(writeAdapters)('%s existe', (rel) => {
    expect(fs.existsSync(path.join(REPO_ROOT, rel))).toBe(true);
  });
});

describe('repositoryV3ArchitectureContract — PRODUCTION_SUPABASE_PROJECT_REF', () => {
  it('todos os domínios usam o mesmo project ref de produção', () => {
    const refs = new Set([
      RH_PROD_REF,
      CLINIC_PROD_REF,
      AGENDA_PROD_REF,
      FIN_PROD_REF,
      CRM_PROD_REF,
      DOMAIN_EVENT_PROD_REF,
    ]);
    expect(refs).toEqual(new Set(['uoepkwhqztmsjnzirpev']));
  });
});
