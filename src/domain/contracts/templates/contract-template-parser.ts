/**
 * @module domain/contracts/templates/contract-template-parser
 * @description Parser seguro de variáveis {{path}} — Phase 10.4.
 * Sem eval, sem Function, sem expressões, sem prototype chain.
 */

import {
  createContractDomainError,
  createContractDomainWarning,
  type ContractDomainError,
  type ContractDomainWarning,
} from '../contract.errors.js';
import {
  getContractTemplateVariableDefinition,
  isKnownContractTemplateVariableKey,
  type ContractTemplateVariableDefinition,
} from './contract-template-variables.catalog.js';
import { sanitizeContractTemplateHtml } from './contract-template-sanitize.js';

/** Apenas segmentos alfanuméricos / underscore — sem constructor, __proto__, etc. */
const SAFE_SEGMENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const BLOCKED_SEGMENTS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'globalThis',
  'process',
  'window',
  'document',
  'Function',
  'eval',
]);

const VARIABLE_TOKEN_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;

export interface ParsedContractVariable {
  raw: string;
  key: string;
  start: number;
  end: number;
  validSyntax: boolean;
  reason?: string;
}

export interface ParseContractTemplateVariablesResult {
  variables: ParsedContractVariable[];
  usedKeys: string[];
  invalidSyntax: ParsedContractVariable[];
}

export interface ValidateContractTemplateVariablesResult {
  valid: boolean;
  errors: ContractDomainError[];
  warnings: ContractDomainWarning[];
  used: string[];
  unknown: string[];
  unresolved: string[];
  sensitive: string[];
}

export interface RenderContractTemplateOptions {
  /** Em modo editor, preserva tokens não resolvidos. */
  mode?: 'editor' | 'preview' | 'publish';
  /** Escape HTML para tipos não-html (default true). */
  escapeHtml?: boolean;
  /** Catálogo opcional (default: global). */
  resolveDefinition?: (key: string) => ContractTemplateVariableDefinition | undefined;
}

function isSafeVariableKey(key: string): { ok: boolean; reason?: string } {
  const trimmed = String(key || '').trim();
  if (!trimmed) return { ok: false, reason: 'variável vazia' };
  if (/[()=+\-*/%!<>?:|&;[\]\\]/.test(trimmed)) {
    return { ok: false, reason: 'expressão não permitida' };
  }
  if (trimmed.includes(' ')) return { ok: false, reason: 'espaços não permitidos na chave' };
  const parts = trimmed.split('.');
  if (parts.length === 0 || parts.length > 6) {
    return { ok: false, reason: 'caminho inválido' };
  }
  for (const part of parts) {
    if (!SAFE_SEGMENT.test(part)) {
      return { ok: false, reason: `segmento inválido: ${part}` };
    }
    if (BLOCKED_SEGMENTS.has(part)) {
      return { ok: false, reason: `segmento bloqueado: ${part}` };
    }
  }
  return { ok: true };
}

export function parseContractTemplateVariables(
  content: string,
): ParseContractTemplateVariablesResult {
  const text = String(content ?? '');
  const variables: ParsedContractVariable[] = [];
  const used = new Set<string>();
  const invalidSyntax: ParsedContractVariable[] = [];

  let match: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_TOKEN_RE.source, 'g');
  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const inner = String(match[1] ?? '');
    const safety = isSafeVariableKey(inner);
    const parsed: ParsedContractVariable = {
      raw,
      key: safety.ok ? inner.trim() : inner.trim(),
      start: match.index,
      end: match.index + raw.length,
      validSyntax: safety.ok,
      reason: safety.reason,
    };
    variables.push(parsed);
    if (!safety.ok) {
      invalidSyntax.push(parsed);
    } else {
      used.add(parsed.key);
    }
  }

  return {
    variables,
    usedKeys: [...used],
    invalidSyntax,
  };
}

export function validateContractTemplateVariables(
  content: string,
  catalogLookup: (key: string) => boolean = isKnownContractTemplateVariableKey,
): ValidateContractTemplateVariablesResult {
  const parsed = parseContractTemplateVariables(content);
  const errors: ContractDomainError[] = [];
  const warnings: ContractDomainWarning[] = [];
  const unknown: string[] = [];
  const sensitive: string[] = [];

  for (const item of parsed.invalidSyntax) {
    errors.push(createContractDomainError(
      'TEMPLATE_VARIABLE_INVALID',
      `Sintaxe de variável inválida: ${item.raw} (${item.reason || 'inválida'}).`,
      'content',
      { raw: item.raw, reason: item.reason },
    ));
  }

  for (const key of parsed.usedKeys) {
    if (!catalogLookup(key)) {
      unknown.push(key);
      errors.push(createContractDomainError(
        'TEMPLATE_VARIABLE_UNKNOWN',
        `Variável desconhecida: {{${key}}}.`,
        'content',
        { key },
      ));
      continue;
    }
    const def = getContractTemplateVariableDefinition(key);
    if (def?.sensitive) {
      sensitive.push(key);
      warnings.push(createContractDomainWarning(
        'TEMPLATE_SENSITIVE_VARIABLE',
        `Variável sensível em uso: ${key}.`,
        'content',
        { key },
      ));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    used: parsed.usedKeys,
    unknown,
    unresolved: [],
    sensitive,
  };
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Resolve valor apenas por chave flat do mapa — nunca atravessa objetos arbitrários.
 */
function resolveFlatValue(
  values: Record<string, unknown>,
  key: string,
): unknown {
  if (!Object.prototype.hasOwnProperty.call(values, key)) {
    return undefined;
  }
  return values[key];
}

export function getUnresolvedContractVariables(
  content: string,
  values: Record<string, unknown>,
): string[] {
  const parsed = parseContractTemplateVariables(content);
  return parsed.usedKeys.filter((key) => {
    const v = resolveFlatValue(values, key);
    return v === undefined || v === null || v === '';
  });
}

export function renderContractTemplate(
  content: string,
  values: Record<string, unknown>,
  options: RenderContractTemplateOptions = {},
): { html: string; unresolved: string[]; errors: ContractDomainError[] } {
  const mode = options.mode || 'preview';
  const escape = options.escapeHtml !== false;
  const resolveDef = options.resolveDefinition || getContractTemplateVariableDefinition;
  const errors: ContractDomainError[] = [];
  const unresolved: string[] = [];

  const text = String(content ?? '');
  const re = new RegExp(VARIABLE_TOKEN_RE.source, 'g');

  // Sanitiza o esqueleto do template antes da interpolação (evita double-escape nos valores).
  const skeleton = sanitizeContractTemplateHtml(text);
  if (skeleton.blocked && mode === 'publish') {
    errors.push(createContractDomainError(
      'TEMPLATE_HTML_BLOCKED',
      'Conteúdo HTML contém elementos bloqueados.',
      'content',
    ));
  }

  const rendered = skeleton.html.replace(re, (raw, inner: string) => {
    const safety = isSafeVariableKey(inner);
    if (!safety.ok) {
      errors.push(createContractDomainError(
        'TEMPLATE_VARIABLE_INVALID',
        `Sintaxe inválida: ${raw}`,
        'content',
      ));
      return mode === 'editor' ? raw : `<span class="ctr-var-error">${escapeHtml(raw)}</span>`;
    }
    const key = inner.trim();
    const def = resolveDef(key);
    if (!def && mode === 'publish') {
      errors.push(createContractDomainError(
        'TEMPLATE_VARIABLE_UNKNOWN',
        `Variável desconhecida: ${key}`,
        'content',
      ));
      return '';
    }
    const value = resolveFlatValue(values, key);
    if (value === undefined || value === null || value === '') {
      unresolved.push(key);
      if (mode === 'editor') return raw;
      return `<span class="ctr-var-missing" data-variable="${escapeHtml(key)}">{{${escapeHtml(key)}}}</span>`;
    }

    const dataType = def?.dataType || 'string';
    if (dataType === 'html') {
      const sanitized = sanitizeContractTemplateHtml(String(value));
      if (sanitized.blocked) {
        errors.push(createContractDomainError(
          'TEMPLATE_HTML_BLOCKED',
          `HTML bloqueado na variável ${key}.`,
          key,
        ));
      }
      return sanitized.html;
    }
    if (dataType === 'image') {
      // Apenas referência textual segura nesta fase — sem <img src=...>
      return `<span class="ctr-var-image" data-variable="${escapeHtml(key)}">${escapeHtml(String(value))}</span>`;
    }
    const asString = typeof value === 'string' ? value : String(value);
    return escape ? escapeHtml(asString) : asString;
  });

  return {
    html: rendered,
    unresolved: [...new Set(unresolved)],
    errors,
  };
}
