import { describe, expect, it } from 'vitest';
import {
  getCanonicalHeaderMap,
  normalizeParsedRows,
  parseCsvText,
  isMetadataSpreadsheetHeader,
} from '../services/csvXlsxUtils.js';

const SCOPE = 'Escopo: Todos os pacientes (sem filtro)';

describe('csvXlsx header map — nome civil vs metadado de escopo', () => {
  it('não mapeia cabeçalho de escopo para nome_completo', () => {
    expect(isMetadataSpreadsheetHeader(SCOPE)).toBe(true);
    const map = getCanonicalHeaderMap([SCOPE, 'Nome Completo', 'CPF']);
    expect(map[SCOPE]).not.toBe('nome_completo');
    expect(map['Nome Completo']).toBe('nome_completo');
    expect(map.CPF).toBe('cpf');
  });

  it('coluna Paciente isolada continua mapeando para nome_completo', () => {
    const map = getCanonicalHeaderMap(['Paciente', 'CPF']);
    expect(map.Paciente).toBe('nome_completo');
  });

  it('aliases legítimos de nome civil continuam mapeando', () => {
    const headers = [
      'Nome',
      'Nome do Paciente',
      'Nome Completo do Paciente',
      'Nome do Titular',
      'full name',
    ];
    for (const header of headers) {
      const map = getCanonicalHeaderMap([header, 'CPF']);
      expect(map[header]).toBe('nome_completo');
    }
  });

  it('Nome Social não é roubado por alias curto "nome"', () => {
    const map = getCanonicalHeaderMap(['Nome Social', 'Nome Completo']);
    expect(map['Nome Social']).toBe('nome_social');
    expect(map['Nome Completo']).toBe('nome_completo');
  });

  it('valor de escopo na coluna de nome é descartado em favor do nome civil', () => {
    const headers = [SCOPE, 'Nome Completo', 'CPF'];
    const map = getCanonicalHeaderMap(headers);
    const rows = normalizeParsedRows(
      [{ [SCOPE]: SCOPE, 'Nome Completo': 'Maria Silva Teste', CPF: '52998224725' }],
      map,
    );
    expect(rows[0].nome_completo).toBe('Maria Silva Teste');
    expect(rows[0].nome_completo).not.toContain('Escopo');
  });

  it('CSV com linha-título de escopo usa a linha seguinte como header', () => {
    const csv = [
      SCOPE,
      'nome_completo,cpf,data_nascimento,sexo',
      'Joao da Silva Teste,52998224725,1990-01-01,M',
    ].join('\n');
    const rows = parseCsvText(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].nome_completo).toBe('Joao da Silva Teste');
  });
});
