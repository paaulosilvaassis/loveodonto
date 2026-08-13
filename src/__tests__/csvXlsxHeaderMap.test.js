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

describe('csvXlsx header map — identidade paciente vs responsável', () => {
  it('CPF mapeia para cpf do paciente', () => {
    const map = getCanonicalHeaderMap(['CPF', 'Nome Completo']);
    expect(map.CPF).toBe('cpf');
  });

  it('CPF Paciente mapeia para cpf do paciente', () => {
    const map = getCanonicalHeaderMap(['CPF Paciente', 'Nome Completo']);
    expect(map['CPF Paciente']).toBe('cpf');
  });

  it('CPF Responsável NÃO mapeia para cpf do paciente', () => {
    const map = getCanonicalHeaderMap(['CPF', 'CPF Responsável']);
    expect(map.CPF).toBe('cpf');
    expect(map['CPF Responsável']).toBe('cpf_responsavel');
    expect(map['CPF Responsável']).not.toBe('cpf');
  });

  it('CPF do Responsável NÃO mapeia para cpf do paciente', () => {
    const map = getCanonicalHeaderMap(['CPF do Responsável']);
    expect(map['CPF do Responsável']).toBe('cpf_responsavel');
    expect(map['CPF do Responsável']).not.toBe('cpf');
  });

  it('CPF Titular NÃO mapeia para cpf do paciente', () => {
    const map = getCanonicalHeaderMap(['CPF Titular', 'CPF']);
    expect(map['CPF Titular']).not.toBe('cpf');
    expect(map.CPF).toBe('cpf');
  });

  it('CPF vazio + CPF Responsável preenchido não preenche patient.cpf', () => {
    const headers = ['Nome Completo', 'CPF', 'CPF Responsável'];
    const map = getCanonicalHeaderMap(headers);
    const rows = normalizeParsedRows(
      [{ 'Nome Completo': 'Maria Silva Teste', CPF: '', 'CPF Responsável': '39053344705' }],
      map,
    );
    expect(rows[0].cpf || '').toBe('');
    expect(rows[0].cpf_responsavel).toBe('39053344705');
  });

  it('CPF e CPF Responsável preenchidos preservam cada um no campo certo', () => {
    const headers = ['Nome Completo', 'CPF', 'CPF Responsável'];
    const map = getCanonicalHeaderMap(headers);
    const rows = normalizeParsedRows(
      [{ 'Nome Completo': 'Maria Silva Teste', CPF: '52998224725', 'CPF Responsável': '39053344705' }],
      map,
    );
    expect(rows[0].cpf).toBe('52998224725');
    expect(rows[0].cpf_responsavel).toBe('39053344705');
  });

  it('Nome Completo não recebe Nome Responsável', () => {
    const map = getCanonicalHeaderMap(['Nome Completo', 'Nome Responsável']);
    expect(map['Nome Completo']).toBe('nome_completo');
    expect(map['Nome Responsável']).toBe('nome_responsavel');
    const rows = normalizeParsedRows(
      [{ 'Nome Completo': 'Ana Souza Teste', 'Nome Responsável': 'Carlos Souza Teste' }],
      map,
    );
    expect(rows[0].nome_completo).toBe('Ana Souza Teste');
    expect(rows[0].nome_responsavel).toBe('Carlos Souza Teste');
  });

  it('Telefone não recebe Telefone Responsável', () => {
    const map = getCanonicalHeaderMap(['Telefone', 'Telefone Responsável']);
    expect(map.Telefone).toBe('telefone');
    expect(map['Telefone Responsável']).toBe('telefone_responsavel');
    const rows = normalizeParsedRows(
      [{ Telefone: '3133334444', 'Telefone Responsável': '31988887777' }],
      map,
    );
    expect(rows[0].telefone).toBe('3133334444');
    expect(rows[0].telefone_responsavel).toBe('31988887777');
  });

  it('Email não recebe Email Responsável', () => {
    const map = getCanonicalHeaderMap(['Email', 'Email Responsável']);
    expect(map.Email).toBe('email');
    expect(map['Email Responsável']).not.toBe('email');
    const rows = normalizeParsedRows(
      [{ Email: 'ana@example.com', 'Email Responsável': 'carlos@example.com' }],
      map,
    );
    expect(rows[0].email).toBe('ana@example.com');
    expect(rows[0].email).not.toBe('carlos@example.com');
  });

  it('RG Responsável não mapeia para rg do paciente', () => {
    const map = getCanonicalHeaderMap(['RG', 'RG Responsável']);
    expect(map.RG).toBe('rg');
    expect(map['RG Responsável']).not.toBe('rg');
  });

  it('Email Responsável / Celular Responsável / CEP Responsável não preenchem identidade do paciente', () => {
    const map = getCanonicalHeaderMap([
      'Email',
      'Email Responsável',
      'Celular',
      'Celular Responsável',
      'CEP',
      'CEP Responsável',
      'Endereço',
      'Endereço Responsável',
      'Data Nascimento',
      'Data Nascimento Responsável',
    ]);
    expect(map.Email).toBe('email');
    expect(map['Email Responsável']).not.toBe('email');
    expect(map.Celular).toBe('celular');
    expect(map['Celular Responsável']).not.toBe('celular');
    expect(map.CEP).toBe('cep');
    expect(map['CEP Responsável']).not.toBe('cep');
    expect(map.Endereço).toBe('endereco');
    expect(map['Endereço Responsável']).not.toBe('endereco');
    expect(map['Data Nascimento']).toBe('data_nascimento');
    expect(map['Data Nascimento Responsável']).not.toBe('data_nascimento');
  });
});
