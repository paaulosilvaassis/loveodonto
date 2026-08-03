/**
 * @module domain/contracts/templates/contract-template-validation
 * @description Validação consolidada para publicação — Phase 10.4.
 */

import {
  createContractDomainError,
  createContractDomainWarning,
} from '../contract.errors.js';
import {
  contentSchemaToHtml,
  extractPlainTextFromSchema,
  validateContractContentSchema,
  type ContractTemplateBlockType,
} from './contract-template-content.schema.js';
import { validateContractTemplateVariables } from './contract-template-parser.js';
import { sanitizeContractTemplateHtml } from './contract-template-sanitize.js';
import type {
  ContractTemplate,
  ContractTemplateRequirements,
  ContractTemplateValidationResult,
  ContractTemplateVersion,
} from './contract-template.types.js';
import { isTemplateArchived, isTemplatePublishedImmutable } from './contract-template-status.machine.js';

function blockTypesPresent(version: ContractTemplateVersion): Set<ContractTemplateBlockType> {
  const schema = version.contentSchema as { blocks?: Array<{ type?: string }> } | undefined;
  const set = new Set<ContractTemplateBlockType>();
  for (const b of schema?.blocks || []) {
    if (b?.type) set.add(b.type as ContractTemplateBlockType);
  }
  return set;
}

export function validateTemplateForPublication(input: {
  template: ContractTemplate;
  version: ContractTemplateVersion;
  changeSummary?: string;
}): ContractTemplateValidationResult {
  const errors = [];
  const warnings = [];
  const { template, version } = input;
  const changeSummary = String(input.changeSummary ?? version.changeSummary ?? '').trim();

  const variables = {
    used: [] as string[],
    unknown: [] as string[],
    unresolved: [] as string[],
    sensitive: [] as string[],
  };
  const blocks = {
    total: 0,
    invalid: [] as string[],
    missingRequired: [] as ContractTemplateBlockType[],
  };

  if (!String(template.name || '').trim()) {
    errors.push(createContractDomainError('INVALID_INPUT', 'Nome vazio.', 'name'));
  }
  if (isTemplateArchived(template.templateStatus)) {
    errors.push(createContractDomainError(
      'TEMPLATE_ARCHIVED',
      'Template arquivado não pode ser publicado.',
      'templateStatus',
    ));
  }
  if (isTemplatePublishedImmutable(version.status) && version.lockedAt) {
    errors.push(createContractDomainError(
      'TEMPLATE_ALREADY_PUBLISHED',
      'Versão já publicada/imutável.',
      'status',
    ));
  }
  if (!changeSummary) {
    errors.push(createContractDomainError(
      'TEMPLATE_CHANGE_SUMMARY_REQUIRED',
      'Publicação exige resumo das alterações.',
      'changeSummary',
    ));
  }

  const schemaResult = validateContractContentSchema(version.contentSchema);
  errors.push(...schemaResult.errors);
  warnings.push(...schemaResult.warnings);
  const schema = version.contentSchema as { blocks?: unknown[] } | undefined;
  blocks.total = Array.isArray(schema?.blocks) ? schema!.blocks!.length : 0;
  for (const err of schemaResult.errors) {
    if (err.metadata?.id) blocks.invalid.push(String(err.metadata.id));
  }

  let contentHtml = String(version.contentHtml || '').trim();
  if (!contentHtml && version.contentSchema) {
    contentHtml = contentSchemaToHtml(version.contentSchema as never);
  }
  if (!contentHtml) {
    errors.push(createContractDomainError(
      'TEMPLATE_CONTENT_EMPTY',
      'Conteúdo vazio bloqueia publicação.',
      'contentHtml',
    ));
  }

  const sanitize = sanitizeContractTemplateHtml(contentHtml);
  if (sanitize.blocked || sanitize.removedTags.includes('script')) {
    errors.push(createContractDomainError(
      'TEMPLATE_HTML_BLOCKED',
      'Conteúdo contém HTML bloqueado.',
      'contentHtml',
      { removedTags: sanitize.removedTags },
    ));
  }

  const varResult = validateContractTemplateVariables(contentHtml);
  errors.push(...varResult.errors);
  warnings.push(...varResult.warnings);
  variables.used = varResult.used;
  variables.unknown = varResult.unknown;
  variables.sensitive = varResult.sensitive;

  const req: ContractTemplateRequirements = template.requirements;
  const present = blockTypesPresent(version);

  if (req.requiresPatientSignature || req.requiresClinicSignature || req.requiresProfessionalSignature) {
    if (!present.has('SIGNATURES') && !variables.used.some((k) => k.startsWith('signature.'))) {
      blocks.missingRequired.push('SIGNATURES');
      errors.push(createContractDomainError(
        'TEMPLATE_REQUIRED_BLOCK_MISSING',
        'Assinatura obrigatória sem bloco correspondente.',
        'blocks',
      ));
    }
  }

  if (req.requiresBudget || req.requiresFinancialPlan) {
    if (!present.has('FINANCIAL_SUMMARY') && !present.has('TREATMENT_TABLE')
      && !variables.used.some((k) => k.startsWith('financial.') || k.startsWith('budget.') || k.startsWith('treatment.'))) {
      blocks.missingRequired.push('FINANCIAL_SUMMARY');
      errors.push(createContractDomainError(
        'TEMPLATE_REQUIRED_BLOCK_MISSING',
        'Orçamento/financeiro obrigatório sem bloco apropriado.',
        'blocks',
      ));
    }
  }

  if (req.requiresGuardian) {
    if (!variables.used.some((k) => k.startsWith('guardian.'))
      && !variables.used.includes('signature.guardianBlock')) {
      errors.push(createContractDomainError(
        'GUARDIAN_REQUIRED',
        'Responsável obrigatório sem variáveis/bloco apropriado.',
        'requirements',
      ));
    }
  }

  const isConsent = String(template.documentType || '').includes('CONSENT');
  if (req.requiresRisksSection || isConsent) {
    const text = extractPlainTextFromSchema(version.contentSchema as never)
      || contentHtml;
    const hasRisks = /risco/i.test(text) || present.has('CLAUSE')
      || /SYS\.RISKS/.test(JSON.stringify(version.clausesSnapshot || ''));
    if (!hasRisks && (req.requiresRisksSection || isConsent)) {
      errors.push(createContractDomainError(
        'TEMPLATE_REQUIRED_BLOCK_MISSING',
        'Consentimento sem seção de riscos quando exigido.',
        'blocks',
      ));
    }
  }

  if (!req.requiresWitnesses) {
    warnings.push(createContractDomainWarning(
      'TEMPLATE_OPTIONAL_WITNESSES_ABSENT',
      'Testemunhas opcionais não configuradas.',
      'requirements',
    ));
  }
  if (!req.requiresOdontogram && !present.has('ODONTOGRAM')) {
    warnings.push(createContractDomainWarning(
      'TEMPLATE_OPTIONAL_ODONTOGRAM_ABSENT',
      'Odontograma opcional ausente.',
      'blocks',
    ));
  }
  if (contentHtml.length > 50_000) {
    warnings.push(createContractDomainWarning(
      'TEMPLATE_CONTENT_LONG',
      'Texto muito longo.',
      'contentHtml',
    ));
  }
  if (!variables.used.some((k) => k.includes('phone') || k.includes('email'))) {
    warnings.push(createContractDomainWarning(
      'TEMPLATE_NO_CONTACT_VARIABLE',
      'Nenhuma variável de contato.',
      'content',
    ));
  }
  if (!(template.procedureCodes?.length) && !(template.specialtyCodes?.length)) {
    warnings.push(createContractDomainWarning(
      'TEMPLATE_NO_PROCEDURE_OR_SPECIALTY',
      'Modelo sem especialidade ou procedimento associado.',
      'procedureCodes',
    ));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    variables,
    blocks,
  };
}
