/**
 * @module domain/contracts/generation/contract-generation.pipeline
 * @description Pipeline puro de geração de versão — Phase 10.5.
 */

import { createContractDomainError, createContractDomainWarning } from '../contract.errors.js';
import { createContractDomainEvent } from '../contract.events.js';
import type { ContractVersion } from '../contract.types.js';
import type { Contract } from '../contract.types.js';
import {
  contentSchemaToHtml,
  extractPlainTextFromSchema,
} from '../templates/contract-template-content.schema.js';
import {
  parseContractTemplateVariables,
  renderContractTemplate,
} from '../templates/contract-template-parser.js';
import { getContractTemplateVariableDefinition } from '../templates/contract-template-variables.catalog.js';
import { sanitizeContractTemplateHtml } from '../templates/contract-template-sanitize.js';
import type { ContractContentHasher } from '../hash/contract-content-hasher.js';
import { createContractContentHasher } from '../hash/contract-content-hasher.js';
import type { ContractIdFactory } from '../shared/contract-id-factory.js';
import { createCryptoContractIdFactory } from '../shared/contract-id-factory.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type {
  ContractGenerationContext,
  ContractGenerationValidationResult,
  GenerateContractVersionInput,
  GenerateContractVersionResult,
} from './contract-generation.types.js';

export interface ContractGenerationPipelineDeps {
  hasher?: ContractContentHasher;
  ids?: ContractIdFactory;
  clock?: ContractClock;
  /** Persistência injetada — obrigatória. */
  saveVersion: (tenantId: string, version: ContractVersion) => Promise<ContractVersion>;
  updateContract: (tenantId: string, contract: Contract) => Promise<Contract>;
  listVersions: (tenantId: string, contractId: string) => Promise<ContractVersion[]>;
}

export interface ContractGenerationPipeline {
  generate(input: GenerateContractVersionInput): Promise<GenerateContractVersionResult>;
}

function buildVariableValues(ctx: ContractGenerationContext): Record<string, unknown> {
  const p = ctx.patient;
  const c = ctx.clinic;
  const g = ctx.guardian;
  const pro = ctx.professional;
  const b = ctx.budget;
  const f = ctx.financial;
  const t = ctx.treatment;
  const o = ctx.odontogram;

  const currency = (n: number | undefined) => (
    n == null ? undefined : `R$ ${Number(n).toFixed(2).replace('.', ',')}`
  );

  return {
    'clinic.legalName': c.legalName,
    'clinic.tradeName': c.tradeName,
    'clinic.cnpj': c.cnpjMasked,
    'clinic.address.full': c.addressFull,
    'clinic.phone': c.phone,
    'clinic.email': c.email,
    'clinic.responsibleProfessional.name': c.responsibleProfessionalName,
    'clinic.responsibleProfessional.cro': c.responsibleProfessionalCro,
    'patient.name': p.fullName,
    'patient.cpf': p.documentNumberMasked,
    'patient.birthDate': p.birthDate,
    'patient.address.full': p.addressFull,
    'patient.phone': p.phone,
    'patient.email': p.email,
    'patient.maritalStatus': p.maritalStatus,
    'guardian.name': g?.fullName,
    'guardian.cpf': g?.documentNumberMasked,
    'guardian.relationship': g?.relationship,
    'guardian.phone': g?.phone,
    'guardian.email': g?.email,
    'professional.name': pro?.name,
    'professional.cro': pro?.cro,
    'professional.specialty': pro?.specialty,
    'budget.number': b?.budgetNumber,
    'budget.total': currency(b?.total),
    'budget.discount': currency(b?.discountTotal),
    'budget.finalTotal': currency(b?.finalTotal),
    'budget.notes': b?.notes,
    'budget.validUntil': b?.validUntil,
    'financial.downPayment': currency(f?.downPayment),
    'financial.financedAmount': currency(f?.financedAmount),
    'financial.installmentCount': f?.installmentCount,
    'financial.installmentValue': currency(f?.installmentValue),
    'financial.interestRate': f?.interestRate != null ? `${f.interestRate}%` : undefined,
    'financial.paymentMethods': f?.paymentMethods?.join(', '),
    'financial.conditionsText': f?.financialConditionsText
      ? `<p>${String(f.financialConditionsText)}</p>`
      : undefined,
    'treatment.summary': t?.summary,
    'treatment.itemsTable': t?.items?.length
      ? `<table><tbody>${t.items.map((i) => `<tr><td>${i.procedureName}</td><td>${i.finalPrice}</td></tr>`).join('')}</tbody></table>`
      : undefined,
    'odontogram.summary': o?.summary,
    'odontogram.capturedAt': o?.capturedAt,
    'odontogram.image': o?.imageFileId ? `[ref:${o.imageFileId}]` : undefined,
    'contract.number': ctx.contract.contractNumber,
    'contract.issueDate': ctx.generatedAt.slice(0, 10),
    'contract.version': undefined, // preenchido após versionNumber
    'signature.patientBlock': '<p><strong>Paciente:</strong> ________________</p>',
    'signature.guardianBlock': '<p><strong>Responsável:</strong> ________________</p>',
    'signature.professionalBlock': '<p><strong>Profissional:</strong> ________________</p>',
    'signature.clinicBlock': '<p><strong>Clínica:</strong> ________________</p>',
    'signature.witnessesBlock': '<p><strong>Testemunhas:</strong> ________</p>',
  };
}

function validateContext(ctx: ContractGenerationContext): ContractGenerationValidationResult {
  const errors = [];
  const warnings = [];
  const variables = {
    used: [] as string[],
    unknown: [] as string[],
    unresolvedRequired: [] as string[],
    unresolvedOptional: [] as string[],
  };

  if (!ctx.tenantId || ctx.contract.tenantId !== ctx.tenantId) {
    errors.push(createContractDomainError('TENANT_MISMATCH', 'tenantId inconsistente.', 'tenantId'));
  }
  if (ctx.template.tenantId !== ctx.tenantId) {
    errors.push(createContractDomainError('TENANT_MISMATCH', 'Template de outro tenant.', 'templateId'));
  }
  if (ctx.templateVersion.tenantId !== ctx.tenantId
    || ctx.templateVersion.templateId !== ctx.template.id) {
    errors.push(createContractDomainError(
      'TEMPLATE_REQUIRED',
      'Versão de template inválida para o template/tenant.',
      'templateVersionId',
    ));
  }
  if (ctx.template.templateStatus !== 'PUBLISHED'
    && ctx.templateVersion.status !== 'PUBLISHED') {
    errors.push(createContractDomainError(
      'TEMPLATE_NOT_PUBLISHED',
      'Template/versão não publicados.',
      'templateId',
    ));
  }
  if (ctx.signaturesStarted) {
    errors.push(createContractDomainError(
      'SIGNATURES_STARTED',
      'Não é possível gerar nova versão com assinatura iniciada.',
      'status',
    ));
  }

  const req = ctx.requirements || ctx.template.requirements || {};
  if (req.requiresGuardian && !ctx.guardian) {
    errors.push(createContractDomainError('GUARDIAN_REQUIRED', 'Responsável obrigatório ausente.', 'guardian'));
  }
  if (req.requiresBudget && !ctx.budget) {
    errors.push(createContractDomainError('BUDGET_REQUIRED', 'Orçamento obrigatório ausente.', 'budget'));
  }
  if (req.requiresFinancialPlan && !ctx.financial) {
    errors.push(createContractDomainError(
      'FINANCIAL_SNAPSHOT_REQUIRED',
      'Snapshot financeiro obrigatório ausente.',
      'financial',
    ));
  }
  if (req.requiresOdontogram && !ctx.odontogram) {
    errors.push(createContractDomainError(
      'INVALID_INPUT',
      'Odontograma obrigatório ausente.',
      'odontogram',
    ));
  }
  if (!ctx.patient?.fullName) {
    errors.push(createContractDomainError('PATIENT_REQUIRED', 'Snapshot de paciente inválido.', 'patient'));
  }
  if (!ctx.clinic?.legalName) {
    errors.push(createContractDomainError('INVALID_INPUT', 'Snapshot de clínica inválido.', 'clinic'));
  }
  if (!ctx.signers?.length) {
    warnings.push(createContractDomainWarning(
      'OPTIONAL_SNAPSHOT_ABSENT',
      'Nenhum signatário no contexto.',
      'signers',
    ));
  }

  return { valid: errors.length === 0, errors, warnings, variables };
}

function htmlToPlainText(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function createContractGenerationPipeline(
  deps: ContractGenerationPipelineDeps,
): ContractGenerationPipeline {
  const hasher = deps.hasher || createContractContentHasher();
  const ids = deps.ids || createCryptoContractIdFactory();
  const clock = deps.clock || createSystemContractClock();

  return {
    async generate(input) {
      const ctx = input.context;
      const validation = validateContext(ctx);
      const warnings = [...validation.warnings];

      if (!validation.valid) {
        return {
          contract: ctx.contract,
          version: null as unknown as ContractVersion,
          validation,
          events: [],
          warnings,
          idempotentReplay: false,
        };
      }

      const schema = ctx.templateVersion.contentSchema;
      let sourceHtml = String(ctx.templateVersion.contentHtml || '').trim();
      if (!sourceHtml && schema) {
        sourceHtml = contentSchemaToHtml(schema as never);
      }
      if (!sourceHtml) {
        validation.valid = false;
        validation.errors.push(createContractDomainError(
          'TEMPLATE_CONTENT_EMPTY',
          'Template sem conteúdo.',
          'contentHtml',
        ));
        return {
          contract: ctx.contract,
          version: null as unknown as ContractVersion,
          validation,
          events: [],
          warnings,
          idempotentReplay: false,
        };
      }

      const values = buildVariableValues(ctx);
      const parsed = parseContractTemplateVariables(sourceHtml);
      validation.variables.used = parsed.usedKeys;

      for (const key of parsed.usedKeys) {
        const def = getContractTemplateVariableDefinition(key);
        if (!def) {
          validation.variables.unknown.push(key);
          validation.errors.push(createContractDomainError(
            'TEMPLATE_VARIABLE_UNKNOWN',
            `Variável desconhecida: ${key}`,
            'content',
          ));
          continue;
        }
        const v = values[key];
        if (v === undefined || v === null || v === '') {
          if (def.requiredByDefault) {
            validation.variables.unresolvedRequired.push(key);
            validation.errors.push(createContractDomainError(
              'TEMPLATE_VARIABLE_INVALID',
              `Variável obrigatória ausente: ${key}`,
              key,
            ));
          } else {
            validation.variables.unresolvedOptional.push(key);
            warnings.push(createContractDomainWarning(
              'OPTIONAL_SNAPSHOT_ABSENT',
              `Variável opcional ausente: ${key}`,
              key,
            ));
          }
        }
      }

      if (validation.errors.length) {
        validation.valid = false;
        return {
          contract: ctx.contract,
          version: null as unknown as ContractVersion,
          validation,
          events: [],
          warnings,
          idempotentReplay: false,
        };
      }

      const previousVersions = await deps.listVersions(ctx.tenantId, ctx.contract.id);
      const maxNum = previousVersions.reduce((m, v) => Math.max(m, v.versionNumber), 0);
      const versionNumber = maxNum + 1;
      values['contract.version'] = String(versionNumber);

      const previous = previousVersions
        .filter((v) => v.versionNumber === maxNum)
        .sort((a, b) => a.versionNumber - b.versionNumber)[0];
      const previousVersionHash = previous?.documentHash;

      const rendered = renderContractTemplate(sourceHtml, values, { mode: 'publish' });
      if (rendered.errors.length) {
        validation.valid = false;
        validation.errors.push(...rendered.errors);
        return {
          contract: ctx.contract,
          version: null as unknown as ContractVersion,
          validation,
          events: [],
          warnings,
          idempotentReplay: false,
        };
      }

      const sanitized = sanitizeContractTemplateHtml(rendered.html);
      if (sanitized.blocked) {
        validation.valid = false;
        validation.errors.push(createContractDomainError(
          'TEMPLATE_HTML_BLOCKED',
          'HTML bloqueado após renderização.',
          'renderedHtml',
        ));
        return {
          contract: ctx.contract,
          version: null as unknown as ContractVersion,
          validation,
          events: [],
          warnings,
          idempotentReplay: false,
        };
      }

      const plainText = schema
        ? extractPlainTextFromSchema(schema as never)
        : htmlToPlainText(sanitized.html);

      const generatedAt = ctx.generatedAt || clock.nowIso();
      const versionId = ids.next('cver') as ContractVersion['id'];

      const hashInput = {
        tenantId: ctx.tenantId,
        contractId: ctx.contract.id,
        versionNumber,
        templateVersionId: ctx.templateVersion.id,
        generationReason: ctx.generationReason,
        previousVersionHash,
        renderedHtml: sanitized.html,
        plainText,
        snapshots: {
          patient: ctx.patient,
          guardian: ctx.guardian || null,
          clinic: ctx.clinic,
          professional: ctx.professional || null,
          budget: ctx.budget || null,
          treatment: ctx.treatment || null,
          odontogram: ctx.odontogram || null,
          financial: ctx.financial || null,
          consents: ctx.consents || null,
          signers: ctx.signers,
          attachments: ctx.attachments || null,
          terms: ctx.terms || null,
        },
      };

      let documentHash: string;
      try {
        documentHash = await hasher.hash(hashInput);
      } catch (error) {
        validation.valid = false;
        validation.errors.push(
          (error as { domainError?: typeof validation.errors[0] }).domainError
          || createContractDomainError('HASH_UNAVAILABLE', 'Falha ao calcular hash.', 'documentHash'),
        );
        return {
          contract: ctx.contract,
          version: null as unknown as ContractVersion,
          validation,
          events: [],
          warnings,
          idempotentReplay: false,
        };
      }

      const version: ContractVersion = {
        id: versionId,
        tenantId: ctx.tenantId,
        contractId: ctx.contract.id,
        versionNumber,
        templateId: ctx.template.id,
        templateVersionId: ctx.templateVersion.id,
        generationReason: ctx.generationReason,
        contentSchemaSnapshot: schema ? JSON.parse(JSON.stringify(schema)) : { schemaVersion: 1, blocks: [] },
        renderedHtmlSnapshot: sanitized.html,
        plainTextSnapshot: plainText,
        patientSnapshot: JSON.parse(JSON.stringify(ctx.patient)),
        guardianSnapshot: ctx.guardian ? JSON.parse(JSON.stringify(ctx.guardian)) : undefined,
        clinicSnapshot: JSON.parse(JSON.stringify(ctx.clinic)),
        professionalSnapshot: ctx.professional
          ? JSON.parse(JSON.stringify(ctx.professional))
          : undefined,
        budgetSnapshot: ctx.budget ? JSON.parse(JSON.stringify(ctx.budget)) : undefined,
        treatmentSnapshot: ctx.treatment ? JSON.parse(JSON.stringify(ctx.treatment)) : undefined,
        odontogramSnapshot: ctx.odontogram ? JSON.parse(JSON.stringify(ctx.odontogram)) : undefined,
        financialSnapshot: ctx.financial ? JSON.parse(JSON.stringify(ctx.financial)) : undefined,
        consentsSnapshot: ctx.consents ? JSON.parse(JSON.stringify(ctx.consents)) : undefined,
        signersSnapshot: JSON.parse(JSON.stringify(ctx.signers)),
        attachmentsSnapshot: ctx.attachments
          ? JSON.parse(JSON.stringify(ctx.attachments))
          : undefined,
        termsSnapshot: ctx.terms ? JSON.parse(JSON.stringify(ctx.terms)) : undefined,
        documentHash,
        previousVersionHash,
        createdBy: ctx.actor.userId,
        createdAt: generatedAt,
      };

      // Simula transação: se update falhar após save, o repo memory deve fazer rollback.
      const savedVersion = await deps.saveVersion(ctx.tenantId, version);
      const updatedContract: Contract = {
        ...ctx.contract,
        currentVersionId: savedVersion.id,
        updatedAt: generatedAt,
      };
      const savedContract = await deps.updateContract(ctx.tenantId, updatedContract);

      const event = createContractDomainEvent({
        tenantId: ctx.tenantId,
        aggregateId: ctx.contract.id,
        aggregateType: 'contract_version',
        eventType: 'contract.version_created',
        occurredAt: generatedAt,
        actor: { actorType: 'USER', actorId: ctx.actor.userId, actorName: ctx.actor.displayName },
        payload: {
          contractId: ctx.contract.id,
          versionId: savedVersion.id,
          versionNumber: savedVersion.versionNumber,
          generationReason: savedVersion.generationReason,
          documentHash: savedVersion.documentHash,
        },
      });

      validation.valid = true;
      return {
        contract: savedContract,
        version: savedVersion,
        validation,
        events: [event],
        warnings,
        idempotentReplay: false,
      };
    },
  };
}
