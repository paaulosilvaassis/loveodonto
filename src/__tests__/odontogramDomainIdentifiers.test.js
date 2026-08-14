import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DENTITION_STAGES,
  MIXED_FDI_TOOTH_IDS,
  PERMANENT_FDI_TOOTH_IDS,
  PRIMARY_FDI_TOOTH_IDS,
  getTeethForDentitionStage,
  getToothMetadata,
  isPermanentTooth,
  isPrimaryTooth,
  isValidFdiToothId,
  normalizeFdiToothId,
} from '../domain/odontogram/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOMAIN_DIR = path.resolve(__dirname, '../domain/odontogram');

const EXPECTED_PERMANENT = [
  '18', '17', '16', '15', '14', '13', '12', '11',
  '21', '22', '23', '24', '25', '26', '27', '28',
  '48', '47', '46', '45', '44', '43', '42', '41',
  '31', '32', '33', '34', '35', '36', '37', '38',
];

const EXPECTED_PRIMARY = [
  '55', '54', '53', '52', '51',
  '61', '62', '63', '64', '65',
  '85', '84', '83', '82', '81',
  '71', '72', '73', '74', '75',
];

const PERMANENT_CLASS = {
  1: 'central_incisor',
  2: 'lateral_incisor',
  3: 'canine',
  4: 'first_premolar',
  5: 'second_premolar',
  6: 'first_molar',
  7: 'second_molar',
  8: 'third_molar',
};

const PRIMARY_CLASS = {
  1: 'central_incisor',
  2: 'lateral_incisor',
  3: 'canine',
  4: 'first_molar',
  5: 'second_molar',
};

const QUADRANT_EXPECTATION = {
  1: { dentition: 'permanent', arch: 'maxillary', side: 'right' },
  2: { dentition: 'permanent', arch: 'maxillary', side: 'left' },
  3: { dentition: 'permanent', arch: 'mandibular', side: 'left' },
  4: { dentition: 'permanent', arch: 'mandibular', side: 'right' },
  5: { dentition: 'primary', arch: 'maxillary', side: 'right' },
  6: { dentition: 'primary', arch: 'maxillary', side: 'left' },
  7: { dentition: 'primary', arch: 'mandibular', side: 'left' },
  8: { dentition: 'primary', arch: 'mandibular', side: 'right' },
};

describe('OD-1A identificadores FDI permanentes', () => {
  it('expõe exatamente 32 dentes permanentes na ordem canônica', () => {
    expect(PERMANENT_FDI_TOOTH_IDS).toHaveLength(32);
    expect([...PERMANENT_FDI_TOOTH_IDS]).toEqual(EXPECTED_PERMANENT);
  });

  it('não duplica identificadores permanentes', () => {
    expect(new Set(PERMANENT_FDI_TOOTH_IDS).size).toBe(32);
  });
});

describe('OD-1A identificadores FDI decíduos', () => {
  it('expõe exatamente 20 dentes decíduos na ordem canônica', () => {
    expect(PRIMARY_FDI_TOOTH_IDS).toHaveLength(20);
    expect([...PRIMARY_FDI_TOOTH_IDS]).toEqual(EXPECTED_PRIMARY);
  });

  it('não duplica identificadores decíduos nem cruza com permanentes', () => {
    expect(new Set(PRIMARY_FDI_TOOTH_IDS).size).toBe(20);
    const overlap = PRIMARY_FDI_TOOTH_IDS.filter((id) => PERMANENT_FDI_TOOTH_IDS.includes(id));
    expect(overlap).toEqual([]);
  });

  it('não gera pré-molares nem terceiros molares decíduos', () => {
    for (const fdi of PRIMARY_FDI_TOOTH_IDS) {
      const meta = getToothMetadata(fdi);
      expect(meta.toothClass).not.toMatch(/premolar/);
      expect(meta.toothClass).not.toBe('third_molar');
      expect(PRIMARY_CLASS[meta.positionFromMidline]).toBe(meta.toothClass);
    }
  });
});

describe('OD-1A metadados de quadrante, arcada, lado e classe', () => {
  it('deriva quadrante, arcada, lado e classe para todos os dentes', () => {
    for (const fdi of [...PERMANENT_FDI_TOOTH_IDS, ...PRIMARY_FDI_TOOTH_IDS]) {
      const meta = getToothMetadata(fdi);
      const quadrant = Number(fdi[0]);
      const position = Number(fdi[1]);
      const expected = QUADRANT_EXPECTATION[quadrant];
      const classMap = expected.dentition === 'permanent' ? PERMANENT_CLASS : PRIMARY_CLASS;
      expect(meta).toMatchObject({
        fdi,
        quadrant,
        positionFromMidline: position,
        ...expected,
        toothClass: classMap[position],
      });
    }
  });

  it('classifica permanentes e decíduos sem inferir idade', () => {
    expect(isPermanentTooth('11')).toBe(true);
    expect(isPermanentTooth(18)).toBe(true);
    expect(isPrimaryTooth('51')).toBe(true);
    expect(isPrimaryTooth(85)).toBe(true);
    expect(isPermanentTooth('51')).toBe(false);
    expect(isPrimaryTooth('11')).toBe(false);
    expect(isPermanentTooth('99')).toBe(false);
    expect(isPrimaryTooth(null)).toBe(false);
  });
});

describe('OD-1A normalização segura de FDI', () => {
  it('aceita número inteiro e string simples de dois dígitos', () => {
    expect(normalizeFdiToothId(11)).toBe('11');
    expect(normalizeFdiToothId('11')).toBe('11');
    expect(normalizeFdiToothId(' 21 ')).toBe('21');
    expect(normalizeFdiToothId(55)).toBe('55');
    expect(normalizeFdiToothId(32)).toBe('32');
    expect(getToothMetadata(32).toothClass).toBe('lateral_incisor');
    expect(isValidFdiToothId('48')).toBe(true);
  });

  it('rejeita entradas inválidas de forma previsível', () => {
    const invalid = [
      '11a',
      '11.0',
      11.5,
      -11,
      1,
      8,
      9,
      10,
      19,
      20,
      99,
      0,
      '011',
      '8',
      '18 17',
      '11,12',
      'FDI11',
      '11e0',
      true,
      false,
      null,
      undefined,
      {},
      [],
      { fdi: '11' },
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '  ',
      '1 1',
    ];
    for (const value of invalid) {
      expect(normalizeFdiToothId(value)).toBeNull();
      expect(isValidFdiToothId(value)).toBe(false);
      expect(getToothMetadata(value)).toBeNull();
    }
  });
});

describe('OD-1A estágios de dentição', () => {
  it('expõe catálogo canônico sem regra de erupção', () => {
    expect([...DENTITION_STAGES]).toEqual(['permanent', 'primary', 'mixed']);
  });

  it('retorna conjuntos determinísticos por estágio', () => {
    expect(getTeethForDentitionStage('permanent')).toEqual(EXPECTED_PERMANENT);
    expect(getTeethForDentitionStage('primary')).toEqual(EXPECTED_PRIMARY);
    expect(getTeethForDentitionStage('mixed')).toEqual([...EXPECTED_PERMANENT, ...EXPECTED_PRIMARY]);
    expect(getTeethForDentitionStage('mixed')).toHaveLength(52);
    expect([...MIXED_FDI_TOOTH_IDS]).toEqual([...EXPECTED_PERMANENT, ...EXPECTED_PRIMARY]);
    expect(getTeethForDentitionStage('adulto')).toBeNull();
    expect(getTeethForDentitionStage(null)).toBeNull();
  });

  it('não compartilha o array interno ao retornar dentes do estágio', () => {
    const mixed = getTeethForDentitionStage('mixed');
    mixed.push('99');
    expect(getTeethForDentitionStage('mixed')).toEqual([...EXPECTED_PERMANENT, ...EXPECTED_PRIMARY]);
    expect(MIXED_FDI_TOOTH_IDS).not.toContain('99');
  });

  it('mantém catálogos e metadados imutáveis', () => {
    expect(() => { PERMANENT_FDI_TOOTH_IDS.push('99'); }).toThrow();
    expect(() => { PRIMARY_FDI_TOOTH_IDS.push('99'); }).toThrow();
    const meta = getToothMetadata('11');
    expect(() => { meta.fdi = '99'; }).toThrow();
    expect(getToothMetadata('11').fdi).toBe('11');
  });
});

describe('OD-1A isolamento e determinismo do domínio', () => {
  const files = readdirSync(DOMAIN_DIR).filter((file) => file.endsWith('.js'));

  it('não importa React, IndexedDB, Supabase, Three.js nem módulos clínicos/financeiros', () => {
    const importPattern = /\bfrom\s+['"]([^'"]+)['"]/g;
    const forbidden = /^(react|react-dom|three|@supabase|@supabase\/)/;
    const forbiddenPath = /(indexedDB|localStorage|budget|finance|contractService|(?:^|[./])contracts(?:\/|$)|supabase|three)/i;
    for (const file of files) {
      const source = readFileSync(path.join(DOMAIN_DIR, file), 'utf8');
      const specifiers = [...source.matchAll(importPattern)].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(forbidden.test(specifier), specifier).toBe(false);
        expect(forbiddenPath.test(specifier), specifier).toBe(false);
        expect(specifier).not.toMatch(/components|services|pages|\/db\//);
      }
    }
    const engine = readFileSync(path.join(DOMAIN_DIR, 'eventEngine.js'), 'utf8');
    expect(engine).toMatch(/from '\.\/schemaContract\.js'/);
  });

  it('não usa rede, relógio, random, UUID nem dados reais de paciente', () => {
    for (const file of files) {
      const source = readFileSync(path.join(DOMAIN_DIR, file), 'utf8');
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/\bXMLHttpRequest\b/);
      expect(source).not.toMatch(/\bWebSocket\b/);
      expect(source).not.toMatch(/\bindexedDB\b/);
      expect(source).not.toMatch(/\blocalStorage\b/);
      expect(source).not.toMatch(/\bDate\.now\s*\(/);
      expect(source).not.toMatch(/\bMath\.random\s*\(/);
      expect(source).not.toMatch(/\bcrypto\.randomUUID\s*\(/);
      expect(source).not.toMatch(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
    }
  });

  it('é determinístico para a mesma entrada', () => {
    const first = getToothMetadata(36);
    const second = getToothMetadata('36');
    expect(first).toEqual(second);
    expect(getTeethForDentitionStage('mixed')).toEqual(getTeethForDentitionStage('mixed'));
  });
});
