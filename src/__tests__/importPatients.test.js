/**
 * Testes da importação em lote de pacientes.
 * Garante: 1) batch nunca derrubado por 1 CPF duplicado; 2) contabilidade correta; 3) CPF duplicado = DUPLICATE_SKIPPED.
 *
 * Cenários de referência (obrigatórios):
 * - 400 linhas únicas => created=400 (teste reduzido para 40 no CI).
 * - 3600 linhas, 3000 CPFs existentes => created=600, duplicateSkipped=3000 (teste reduzido para 100/50).
 * - Batch 200 com linha 1 CPF duplicado => created=199, duplicateSkipped=1.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { loadDb, initDb, resetDb } from '../db/index.js';
import { createPatientQuick } from '../services/patientService.js';
import { importFromCsvOrXlsx, IMPORT_ROW_STATUS, buildImportReportCsv } from '../services/importPatientService.js';

const admin = { id: 'user-admin', role: 'admin' };

/** Gera CPF válido a partir de um base de 9 dígitos (evita repetição). */
function validCpfFromSeed(seed) {
  const base = String(seed).padStart(9, '0').slice(-9);
  if (/^(\d)\1+$/.test(base)) return validCpfFromSeed(seed + 1);
  const calc = (b, factor) => {
    let total = 0;
    for (let i = 0; i < b.length; i++) total += Number(b[i]) * (factor - i);
    const mod = total % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const d1 = calc(base, 10);
  const d2 = calc(base + String(d1), 11);
  return base + String(d1) + String(d2);
}

/** Cria CSV com cabeçalho canônico e N linhas (cpf único por linha). */
function buildCsv(rows) {
  const header = 'nome_completo,cpf,data_nascimento,sexo\n';
  const lines = rows.map((r) => `${r.nome_completo},${r.cpf},${r.data_nascimento},${r.sexo}`).join('\n');
  return header + lines;
}

/** Mock File com text() e name para importFromCsvOrXlsx. */
function mockFile(csvContent, filename = 'test.csv') {
  return {
    name: filename,
    text: () => Promise.resolve(csvContent),
  };
}

describe('Importação em lote', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('arquivo com 40 linhas únicas => created=40 e contabilidade bate', async () => {
    const rows = [];
    for (let i = 0; i < 40; i++) {
      rows.push({
        nome_completo: `Paciente ${i}`,
        cpf: validCpfFromSeed(100000000 + i),
        data_nascimento: '1990-01-01',
        sexo: 'M',
      });
    }
    const file = mockFile(buildCsv(rows));
    const result = await importFromCsvOrXlsx(file, admin, 'create', { getCancelRequested: () => false });

    expect(result.created).toBe(40);
    expect(result.reportRows).toBeDefined();
    expect(result.reportRows.length).toBe(40);

    const sum = result.created + result.updated + result.merged + result.duplicateSkipped + result.ignored + result.technicalErrors;
    expect(sum).toBe(40);
  });

  it('arquivo com 100 linhas e 50 CPFs já existentes => created=50, duplicateSkipped=50', async () => {
    for (let i = 0; i < 50; i++) {
      createPatientQuick(admin, {
        full_name: `Existente ${i}`,
        sex: 'M',
        birth_date: '1990-01-01',
        cpf: validCpfFromSeed(200000000 + i),
      });
    }

    const rows = [];
    for (let i = 0; i < 100; i++) {
      const cpf = i < 50 ? validCpfFromSeed(200000000 + i) : validCpfFromSeed(300000000 + i);
      rows.push({
        nome_completo: `Paciente ${i}`,
        cpf,
        data_nascimento: '1990-01-01',
        sexo: 'M',
      });
    }
    const file = mockFile(buildCsv(rows));
    const result = await importFromCsvOrXlsx(file, admin, 'create', { getCancelRequested: () => false });

    expect(result.created).toBe(50);
    expect(result.duplicateSkipped).toBe(50);
    expect(result.reportRows.length).toBe(100);

    const sum = result.created + result.updated + result.merged + result.duplicateSkipped + result.ignored + result.technicalErrors;
    expect(sum).toBe(100);
  });

  it('batch de 200 com linha 1 CPF duplicado => outras 199 importam (created=199, duplicateSkipped=1)', async () => {
    const cpfDuplicado = validCpfFromSeed(999999001);
    createPatientQuick(admin, {
      full_name: 'Já existe',
      sex: 'M',
      birth_date: '1990-01-01',
      cpf: cpfDuplicado,
    });

    const rows = [];
    rows.push({ nome_completo: 'Linha 1 duplicada', cpf: cpfDuplicado, data_nascimento: '1990-01-01', sexo: 'M' });
    for (let i = 1; i < 200; i++) {
      rows.push({
        nome_completo: `Paciente ${i}`,
        cpf: validCpfFromSeed(400000000 + i),
        data_nascimento: '1990-01-01',
        sexo: 'M',
      });
    }
    const file = mockFile(buildCsv(rows));
    const result = await importFromCsvOrXlsx(file, admin, 'create', { getCancelRequested: () => false });

    expect(result.created).toBe(199);
    expect(result.duplicateSkipped).toBe(1);
    expect(result.technicalErrors).toBe(0);
    expect(result.reportRows.length).toBe(200);

    const dupInReport = result.reportRows.filter((r) => r.status === IMPORT_ROW_STATUS.DUPLICATE_SKIPPED);
    expect(dupInReport.length).toBe(1);
    expect(dupInReport[0].linha).toBe(1);
  });

  it('buildImportReportCsv gera CSV com header e linhas', () => {
    const reportRows = [
      { linha: 1, nome: 'A', cpf: '111', status: IMPORT_ROW_STATUS.CREATED, motivo: 'Ok' },
      { linha: 2, nome: 'B', cpf: '222', status: IMPORT_ROW_STATUS.DUPLICATE_SKIPPED, motivo: 'CPF já cadastrado' },
    ];
    const csv = buildImportReportCsv(reportRows);
    expect(csv).toContain('linha,nome,cpf,status,motivo');
    expect(csv).toContain('1,');
    expect(csv).toContain('DUPLICATE_SKIPPED');
  });
});
