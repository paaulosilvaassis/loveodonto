/**
 * @module domain/contracts/templates/contract-template-content.schema
 * @description Schema de blocos serializável — Phase 10.4.
 */

import {
  createContractDomainError,
  createContractDomainWarning,
  type ContractDomainError,
  type ContractDomainWarning,
} from '../contract.errors.js';

export const CONTRACT_CONTENT_SCHEMA_VERSION = 1;

export const CONTRACT_TEMPLATE_BLOCK_TYPES = [
  'HEADING',
  'PARAGRAPH',
  'CLAUSE',
  'TABLE',
  'VARIABLE',
  'PAGE_BREAK',
  'SIGNATURES',
  'ODONTOGRAM',
  'FINANCIAL_SUMMARY',
  'TREATMENT_TABLE',
  'DIVIDER',
] as const;

export type ContractTemplateBlockType = (typeof CONTRACT_TEMPLATE_BLOCK_TYPES)[number];

export interface ContractTemplateBlockBase {
  id: string;
  type: ContractTemplateBlockType;
  order: number;
  required?: boolean;
  settings?: Record<string, unknown>;
}

export interface ContractHeadingBlock extends ContractTemplateBlockBase {
  type: 'HEADING';
  level: 1 | 2 | 3 | 4;
  text: string;
}

export interface ContractParagraphBlock extends ContractTemplateBlockBase {
  type: 'PARAGRAPH';
  text: string;
}

export interface ContractClauseBlock extends ContractTemplateBlockBase {
  type: 'CLAUSE';
  clauseCode: string;
  title: string;
  content: string;
}

export interface ContractTableBlock extends ContractTemplateBlockBase {
  type: 'TABLE';
  headers: string[];
  rows: string[][];
}

export interface ContractVariableBlock extends ContractTemplateBlockBase {
  type: 'VARIABLE';
  variableKey: string;
  label?: string;
}

export interface ContractPageBreakBlock extends ContractTemplateBlockBase {
  type: 'PAGE_BREAK';
}

export interface ContractSignatureBlock extends ContractTemplateBlockBase {
  type: 'SIGNATURES';
  roles: string[];
}

export interface ContractOdontogramBlock extends ContractTemplateBlockBase {
  type: 'ODONTOGRAM';
}

export interface ContractFinancialSummaryBlock extends ContractTemplateBlockBase {
  type: 'FINANCIAL_SUMMARY';
}

export interface ContractTreatmentTableBlock extends ContractTemplateBlockBase {
  type: 'TREATMENT_TABLE';
}

export interface ContractDividerBlock extends ContractTemplateBlockBase {
  type: 'DIVIDER';
}

export type ContractTemplateBlock =
  | ContractHeadingBlock
  | ContractParagraphBlock
  | ContractClauseBlock
  | ContractTableBlock
  | ContractVariableBlock
  | ContractPageBreakBlock
  | ContractSignatureBlock
  | ContractOdontogramBlock
  | ContractFinancialSummaryBlock
  | ContractTreatmentTableBlock
  | ContractDividerBlock;

export interface ContractContentSchema {
  schemaVersion: number;
  blocks: ContractTemplateBlock[];
  metadata?: Record<string, unknown>;
}

export interface ContentSchemaValidationResult {
  valid: boolean;
  errors: ContractDomainError[];
  warnings: ContractDomainWarning[];
}

function isBlockType(value: unknown): value is ContractTemplateBlockType {
  return typeof value === 'string'
    && (CONTRACT_TEMPLATE_BLOCK_TYPES as readonly string[]).includes(value);
}

export function createEmptyContentSchema(): ContractContentSchema {
  return {
    schemaVersion: CONTRACT_CONTENT_SCHEMA_VERSION,
    blocks: [
      {
        id: 'blk_title',
        type: 'HEADING',
        order: 0,
        level: 1,
        text: 'Contrato de Prestação de Serviços Odontológicos',
        required: true,
      },
      {
        id: 'blk_intro',
        type: 'PARAGRAPH',
        order: 1,
        text: 'Pelo presente instrumento, {{clinic.legalName}} e {{patient.name}} celebram o presente contrato.',
      },
      {
        id: 'blk_treatment',
        type: 'TREATMENT_TABLE',
        order: 2,
        required: true,
      },
      {
        id: 'blk_financial',
        type: 'FINANCIAL_SUMMARY',
        order: 3,
      },
      {
        id: 'blk_signatures',
        type: 'SIGNATURES',
        order: 4,
        required: true,
        roles: ['patient', 'clinic', 'professional'],
      },
    ],
  };
}

export function validateContractContentSchema(
  schema: unknown,
): ContentSchemaValidationResult {
  const errors: ContractDomainError[] = [];
  const warnings: ContractDomainWarning[] = [];

  if (!schema || typeof schema !== 'object') {
    errors.push(createContractDomainError(
      'TEMPLATE_BLOCK_INVALID',
      'contentSchema inválido.',
      'contentSchema',
    ));
    return { valid: false, errors, warnings };
  }

  const s = schema as ContractContentSchema;
  if (s.schemaVersion !== CONTRACT_CONTENT_SCHEMA_VERSION) {
    errors.push(createContractDomainError(
      'TEMPLATE_BLOCK_INVALID',
      `schemaVersion deve ser ${CONTRACT_CONTENT_SCHEMA_VERSION}.`,
      'schemaVersion',
    ));
  }
  if (!Array.isArray(s.blocks)) {
    errors.push(createContractDomainError(
      'TEMPLATE_BLOCK_INVALID',
      'blocks deve ser um array.',
      'blocks',
    ));
    return { valid: false, errors, warnings };
  }

  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const block of s.blocks) {
    if (!block || typeof block !== 'object') {
      errors.push(createContractDomainError(
        'TEMPLATE_BLOCK_INVALID',
        'Bloco inválido.',
        'blocks',
      ));
      continue;
    }
    if (!String(block.id || '').trim()) {
      errors.push(createContractDomainError(
        'TEMPLATE_BLOCK_INVALID',
        'Bloco sem id.',
        'blocks',
      ));
    } else if (ids.has(block.id)) {
      errors.push(createContractDomainError(
        'TEMPLATE_BLOCK_INVALID',
        `ID de bloco duplicado: ${block.id}.`,
        'blocks',
        { id: block.id },
      ));
    } else {
      ids.add(block.id);
    }
    if (!isBlockType(block.type)) {
      errors.push(createContractDomainError(
        'TEMPLATE_BLOCK_INVALID',
        `Tipo de bloco desconhecido: ${String(block.type)}.`,
        'blocks',
        { type: block.type },
      ));
    }
    if (!Number.isInteger(block.order)) {
      errors.push(createContractDomainError(
        'TEMPLATE_BLOCK_INVALID',
        `Ordem inválida no bloco ${block.id}.`,
        'blocks',
      ));
    } else if (orders.has(block.order)) {
      errors.push(createContractDomainError(
        'TEMPLATE_BLOCK_INVALID',
        `Ordem duplicada: ${block.order}.`,
        'blocks',
      ));
    } else {
      orders.add(block.order);
    }
  }

  if (s.blocks.length === 0) {
    errors.push(createContractDomainError(
      'TEMPLATE_CONTENT_EMPTY',
      'Documento sem blocos.',
      'blocks',
    ));
  }

  if (s.blocks.length > 200) {
    warnings.push(createContractDomainWarning(
      'LEGACY_DATA_PARTIAL',
      'Documento com muitos blocos — revisar tamanho.',
      'blocks',
    ));
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Conversão determinística schema → HTML (pré-sanitização). */
export function contentSchemaToHtml(schema: ContractContentSchema): string {
  const sorted = [...(schema.blocks || [])].sort((a, b) => a.order - b.order);
  const parts: string[] = [];

  for (const block of sorted) {
    switch (block.type) {
      case 'HEADING': {
        const level = Math.min(4, Math.max(1, block.level || 1));
        parts.push(`<h${level}>${escapeText(block.text || '')}</h${level}>`);
        break;
      }
      case 'PARAGRAPH':
        parts.push(`<p>${escapeText(block.text || '')}</p>`);
        break;
      case 'CLAUSE':
        parts.push(
          `<div data-variable="clause:${escapeAttr(block.clauseCode)}">`
          + `<h3>${escapeText(block.title || '')}</h3>`
          + `<p>${escapeText(block.content || '')}</p></div>`,
        );
        break;
      case 'TABLE': {
        const headers = (block.headers || []).map((h) => `<th>${escapeText(h)}</th>`).join('');
        const rows = (block.rows || []).map((row) => (
          `<tr>${row.map((c) => `<td>${escapeText(c)}</td>`).join('')}</tr>`
        )).join('');
        parts.push(`<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`);
        break;
      }
      case 'VARIABLE':
        parts.push(
          `<p><span data-variable="${escapeAttr(block.variableKey)}">{{${escapeText(block.variableKey)}}}</span></p>`,
        );
        break;
      case 'PAGE_BREAK':
        parts.push('<hr data-variable="page-break" />');
        break;
      case 'SIGNATURES':
        parts.push('<div data-variable="signature.patientBlock">{{signature.patientBlock}}</div>');
        parts.push('<div data-variable="signature.clinicBlock">{{signature.clinicBlock}}</div>');
        parts.push('<div data-variable="signature.professionalBlock">{{signature.professionalBlock}}</div>');
        break;
      case 'ODONTOGRAM':
        parts.push('<div data-variable="odontogram.image">{{odontogram.image}}</div>');
        parts.push('<p>{{odontogram.summary}}</p>');
        break;
      case 'FINANCIAL_SUMMARY':
        parts.push('<div data-variable="financial.conditionsText">{{financial.conditionsText}}</div>');
        parts.push('<p>Total: {{budget.finalTotal}} · Entrada: {{financial.downPayment}}</p>');
        break;
      case 'TREATMENT_TABLE':
        parts.push('<div data-variable="treatment.itemsTable">{{treatment.itemsTable}}</div>');
        break;
      case 'DIVIDER':
        parts.push('<hr />');
        break;
      default:
        break;
    }
  }

  return parts.join('\n');
}

function escapeText(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/'/g, '&#39;');
}

export function extractPlainTextFromSchema(schema: ContractContentSchema): string {
  return [...schema.blocks]
    .sort((a, b) => a.order - b.order)
    .map((block) => {
      if (block.type === 'HEADING' || block.type === 'PARAGRAPH') return block.text || '';
      if (block.type === 'CLAUSE') return `${block.title}\n${block.content}`;
      if (block.type === 'VARIABLE') return `{{${block.variableKey}}}`;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}
