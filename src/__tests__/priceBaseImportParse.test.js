import { describe, it, expect } from 'vitest';
import {
  findBestHeaderRowIndex,
  sheetRowsToObjects,
  detectColumnMapping,
  normalizeImportRow,
  validateImportRow,
  normalizeHeader,
  scoreRowAsHeader,
  normalizeTussCodeFromImport,
  nullIfNotPositiveLimit,
} from '../services/priceBaseImportParse.js';
import { validateTussCode } from '../services/priceBaseService.js';

describe('priceBaseImportParse', () => {
  it('normaliza cabeçalhos com hífen e acento', () => {
    expect(normalizeHeader('  Código TISS ')).toBe('codigo tiss');
    expect(normalizeHeader('Título_do_procedimento')).toBe('titulo do procedimento');
  });

  it('titulo da planilha + linha vazia + cabeçalho real: escolhe linha 3 (índice 2)', () => {
    const matrix = [
      ['Relatório de procedimentos 2025', '', ''],
      ['', '', ''],
      ['Procedimentos', 'Código TISS', 'Preço', 'Especialidade', 'Situação'],
      ['Limpeza profissional', '81000030', 150.5, '', 'Ativo'],
      ['Consulta', '81000031', 0, '', ''],
      ['', '', '', '', ''],
    ];
    const idx = findBestHeaderRowIndex(matrix);
    expect(idx).toBe(2);
    expect(scoreRowAsHeader(matrix[0])).toBeLessThan(scoreRowAsHeader(matrix[2]));

    const rows = sheetRowsToObjects(matrix, idx);
    expect(rows).toHaveLength(3);
    expect(rows[0].Procedimentos).toBe('Limpeza profissional');

    const cols = Object.keys(rows[0]);
    const mapping = detectColumnMapping(cols);
    const titleCols = Object.entries(mapping).filter(([, v]) => v === 'title').map(([k]) => k);
    expect(titleCols.length).toBeGreaterThan(0);
    expect(Object.values(mapping)).toContain('tussCode');

    const norm0 = normalizeImportRow(rows[0], mapping);
    expect(norm0.title).toBe('Limpeza profissional');
    expect(norm0.price).toBe(150.5);
    expect(norm0.tussCode).toBe('81000030');

    const norm1 = normalizeImportRow(rows[1], mapping);
    expect(norm1.title).toBe('Consulta');
    expect(norm1.price).toBe(0);

    const v0 = validateImportRow(rows[0], norm0, mapping);
    expect(v0.emptyRow).toBe(false);
    expect(v0.errors).toHaveLength(0);

    const v1 = validateImportRow(rows[1], norm1, mapping);
    expect(v1.errors).toHaveLength(0);

    const vBlank = validateImportRow(rows[2], normalizeImportRow(rows[2], mapping), mapping);
    expect(vBlank.emptyRow).toBe(true);
  });

  it('coluna apenas "Procedimentos" mapeia para title', () => {
    const mappingPro = detectColumnMapping(['Procedimentos', 'Preço']);
    expect(mappingPro['Procedimentos']).toBe('title');
    expect(mappingPro['Preço']).toBe('price');
  });

  it('TISS/TUSS 0 e min/max 0 na planilha: sem erro; limites e código viram null', () => {
    const mapping = detectColumnMapping([
      'Procedimentos',
      'Código TISS',
      'Preço',
      'Valor Mínimo',
      'Valor Máximo',
    ]);
    const raw = {
      Procedimentos: 'Restauração',
      'Código TISS': 0,
      Preço: 350,
      'Valor Mínimo': 0,
      'Valor Máximo': 0,
    };
    const norm = normalizeImportRow(raw, mapping);
    expect(norm.title).toBe('Restauração');
    expect(norm.price).toBe(350);
    expect(norm.tussCode).toBeNull();
    expect(norm.minPrice).toBeNull();
    expect(norm.maxPrice).toBeNull();

    const v = validateImportRow(raw, norm, mapping);
    expect(v.errors).toHaveLength(0);

    expect(normalizeTussCodeFromImport(0)).toBeNull();
    expect(normalizeTussCodeFromImport('0')).toBeNull();
    expect(normalizeTussCodeFromImport('81000030')).toBe('81000030');
    expect(nullIfNotPositiveLimit(0)).toBeNull();
    expect(nullIfNotPositiveLimit(100)).toBe(100);
    expect(validateTussCode(0).valid).toBe(true);
    expect(validateTussCode('0').valid).toBe(true);
  });
});
