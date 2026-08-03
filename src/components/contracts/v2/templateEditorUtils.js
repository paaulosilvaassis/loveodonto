/**
 * Helpers do editor de templates v2 — Phase 10.4.
 */

import { createEmptyContentSchema } from '../../../domain/contracts/templates/contract-template-content.schema.ts';

export function createBlockId() {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function sortBlocks(blocks) {
  return [...(blocks || [])].sort((a, b) => a.order - b.order);
}

export function reindexBlocks(blocks) {
  return sortBlocks(blocks).map((block, index) => ({ ...block, order: index }));
}

export function moveBlock(blocks, blockId, direction) {
  const sorted = reindexBlocks(blocks);
  const index = sorted.findIndex((b) => b.id === blockId);
  if (index < 0) return sorted;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= sorted.length) return sorted;
  const next = [...sorted];
  const tmp = next[index];
  next[index] = next[target];
  next[target] = tmp;
  return reindexBlocks(next);
}

export function removeBlock(blocks, blockId) {
  const block = (blocks || []).find((b) => b.id === blockId);
  if (block?.required) return blocks;
  return reindexBlocks((blocks || []).filter((b) => b.id !== blockId));
}

export function duplicateBlock(blocks, blockId) {
  const sorted = reindexBlocks(blocks);
  const index = sorted.findIndex((b) => b.id === blockId);
  if (index < 0) return sorted;
  const copy = {
    ...JSON.parse(JSON.stringify(sorted[index])),
    id: createBlockId(),
    required: false,
  };
  const next = [...sorted];
  next.splice(index + 1, 0, copy);
  return reindexBlocks(next);
}

export function insertBlock(blocks, type, extras = {}) {
  const sorted = reindexBlocks(blocks);
  const base = {
    id: createBlockId(),
    type,
    order: sorted.length,
    required: false,
    ...extras,
  };
  switch (type) {
    case 'HEADING':
      return reindexBlocks([...sorted, { ...base, level: 2, text: 'Novo título' }]);
    case 'PARAGRAPH':
      return reindexBlocks([...sorted, { ...base, text: '' }]);
    case 'VARIABLE':
      return reindexBlocks([...sorted, { ...base, variableKey: extras.variableKey || 'patient.name' }]);
    case 'CLAUSE':
      return reindexBlocks([...sorted, {
        ...base,
        clauseCode: extras.clauseCode || 'SYS.OBJECT',
        title: extras.title || 'Cláusula',
        content: extras.content || '',
      }]);
    case 'PAGE_BREAK':
    case 'DIVIDER':
    case 'SIGNATURES':
    case 'ODONTOGRAM':
    case 'FINANCIAL_SUMMARY':
    case 'TREATMENT_TABLE':
      return reindexBlocks([...sorted, base.type === 'SIGNATURES'
        ? { ...base, roles: ['patient', 'clinic', 'professional'] }
        : base]);
    case 'TABLE':
      return reindexBlocks([...sorted, {
        ...base,
        headers: ['Coluna 1', 'Coluna 2'],
        rows: [['', '']],
      }]);
    default:
      return sorted;
  }
}

export function insertVariableToken(text, variableKey) {
  const token = `{{${variableKey}}}`;
  return `${String(text || '')}${String(text || '').endsWith(' ') || !text ? '' : ' '}${token}`;
}

export function defaultEditorSchema() {
  return createEmptyContentSchema();
}

export const BLOCK_TYPE_LABELS = {
  HEADING: 'Título',
  PARAGRAPH: 'Parágrafo',
  CLAUSE: 'Cláusula',
  TABLE: 'Tabela',
  VARIABLE: 'Variável',
  PAGE_BREAK: 'Quebra de página',
  SIGNATURES: 'Assinaturas',
  ODONTOGRAM: 'Odontograma',
  FINANCIAL_SUMMARY: 'Resumo financeiro',
  TREATMENT_TABLE: 'Tabela de tratamento',
  DIVIDER: 'Divisor',
};
