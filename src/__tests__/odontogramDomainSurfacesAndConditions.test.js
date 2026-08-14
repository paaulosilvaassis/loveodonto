import { describe, expect, it } from 'vitest';
import {
  CONDITION_CATALOG,
  CONDITION_CATEGORIES,
  CONDITION_CODES,
  CONDITION_SCOPES,
  PERMANENT_FDI_TOOTH_IDS,
  PRIMARY_FDI_TOOTH_IDS,
  SURFACE_CODES,
  SURFACE_NAMES,
  TERMINOLOGY_VERSION,
  getApplicableSurfaces,
  getConditionDefinition,
  getConditionsByScope,
  isValidConditionCode,
  isValidSurfaceCode,
  normalizeSurfaceCode,
  normalizeSurfaceList,
  validateSurfaceForTooth,
} from '../domain/odontogram/index.js';

describe('OD-1A superfícies canônicas', () => {
  it('mantém P distinto de L e O distinto de I', () => {
    expect(SURFACE_CODES).toEqual(['M', 'D', 'V', 'L', 'P', 'O', 'I']);
    expect(SURFACE_NAMES.P).toBe('palatal');
    expect(SURFACE_NAMES.L).toBe('lingual');
    expect(SURFACE_NAMES.O).toBe('occlusal');
    expect(SURFACE_NAMES.I).toBe('incisal');
    expect(normalizeSurfaceCode('P')).toBe('P');
    expect(normalizeSurfaceCode('L')).toBe('L');
    expect(normalizeSurfaceCode('O')).toBe('O');
    expect(normalizeSurfaceCode('I')).toBe('I');
  });

  it('usa I em anteriores e O em posteriores', () => {
    expect(getApplicableSurfaces('11')).toEqual(['M', 'D', 'V', 'P', 'I']);
    expect(getApplicableSurfaces('21')).toEqual(['M', 'D', 'V', 'P', 'I']);
    expect(getApplicableSurfaces('33')).toEqual(['M', 'D', 'V', 'L', 'I']);
    expect(getApplicableSurfaces('43')).toEqual(['M', 'D', 'V', 'L', 'I']);
    expect(getApplicableSurfaces('16')).toEqual(['M', 'D', 'V', 'P', 'O']);
    expect(getApplicableSurfaces('26')).toEqual(['M', 'D', 'V', 'P', 'O']);
    expect(getApplicableSurfaces('46')).toEqual(['M', 'D', 'V', 'L', 'O']);
    expect(getApplicableSurfaces('36')).toEqual(['M', 'D', 'V', 'L', 'O']);
    expect(getApplicableSurfaces('51')).toEqual(['M', 'D', 'V', 'P', 'I']);
    expect(getApplicableSurfaces('85')).toEqual(['M', 'D', 'V', 'L', 'O']);
  });

  it('aplica palatina na maxila e lingual na mandíbula', () => {
    for (const fdi of [...PERMANENT_FDI_TOOTH_IDS, ...PRIMARY_FDI_TOOTH_IDS]) {
      const surfaces = getApplicableSurfaces(fdi);
      const isMaxillary = fdi[0] === '1' || fdi[0] === '2' || fdi[0] === '5' || fdi[0] === '6';
      if (isMaxillary) {
        expect(surfaces).toContain('P');
        expect(surfaces).not.toContain('L');
      } else {
        expect(surfaces).toContain('L');
        expect(surfaces).not.toContain('P');
      }
    }
  });

  it('não converte silenciosamente superfície incompatível', () => {
    expect(validateSurfaceForTooth('11', 'O').valid).toBe(false);
    expect(validateSurfaceForTooth('11', 'L').valid).toBe(false);
    expect(validateSurfaceForTooth('16', 'I').valid).toBe(false);
    expect(validateSurfaceForTooth('41', 'P').valid).toBe(false);
    expect(validateSurfaceForTooth('11', 'I').valid).toBe(true);
    expect(validateSurfaceForTooth('16', 'O').valid).toBe(true);
    expect(getApplicableSurfaces('99')).toBeNull();
  });

  it('normaliza lista com ordem determinística, sem duplicatas e sem mutar o argumento', () => {
    const input = ['O', 'm', 'O', 'D', 'M'];
    const snapshot = [...input];
    const result = normalizeSurfaceList('16', input);
    expect(input).toEqual(snapshot);
    expect(result.value).toEqual(['M', 'D', 'O']);
    expect(result.status).toBe('normalized');
    expect(normalizeSurfaceList('16', ['M', 'D', 'O']).status).toBe('exact');
  });

  it('rejeita códigos inválidos com warning e sem conversão ambígua', () => {
    const result = normalizeSurfaceList('11', ['I', 'L', 'X', 'I']);
    expect(result.value).toEqual(['I']);
    expect(result.warnings.some((item) => item.code === 'INVALID_SURFACE_CODE')).toBe(true);
    expect(result.warnings.some((item) => item.code === 'SURFACE_NOT_APPLICABLE')).toBe(true);
    expect(normalizeSurfaceCode('mesial')).toBeNull();
    expect(isValidSurfaceCode('MD')).toBe(false);
    expect(normalizeSurfaceList('16', { M: true }).value).toBeNull();
  });
});

describe('OD-1A condições clínicas canônicas', () => {
  const requiredCodes = [
    'healthy',
    'caries',
    'restoration',
    'missing',
    'extraction_indicated',
    'endodontic_treatment',
    'crown_or_prosthesis',
    'implant',
    'fracture',
    'sealant',
    'residual_root',
    'unerupted',
    'impacted',
    'wear',
    'abrasion',
    'erosion',
    'abfraction',
    'mobility',
    'periapical_lesion',
    'gingival_recession',
    'observation',
  ];

  it('expõe códigos únicos, versionados e sem cor como identidade', () => {
    expect(CONDITION_CODES).toEqual(requiredCodes);
    expect(new Set(CONDITION_CODES).size).toBe(requiredCodes.length);
    expect(CONDITION_CATALOG).toHaveLength(requiredCodes.length);
    for (const item of CONDITION_CATALOG) {
      expect(item).toMatchObject({
        code: expect.any(String),
        label: expect.any(String),
        category: expect.any(String),
        scope: expect.any(String),
        active: true,
        terminologyVersion: TERMINOLOGY_VERSION,
        externalTerminology: null,
      });
      expect(item).not.toHaveProperty('color');
      expect(CONDITION_CATEGORIES).toContain(item.category);
      expect(CONDITION_SCOPES).toContain(item.scope);
    }
  });

  it('mantém o catálogo imutável', () => {
    expect(Object.isFrozen(CONDITION_CATALOG)).toBe(true);
    expect(Object.isFrozen(CONDITION_CATALOG[0])).toBe(true);
    expect(() => { CONDITION_CATALOG.push({ code: 'x' }); }).toThrow();
    expect(() => { CONDITION_CATALOG[0].code = 'paid'; }).toThrow();
    expect(() => { CONDITION_CODES.push('paid'); }).toThrow();
    const definition = getConditionDefinition('healthy');
    expect(() => { definition.label = 'alterado'; }).toThrow();
    expect(getConditionDefinition('healthy').label).toBe('Hígido');
  });

  it('separa condição clínica de procedimento planejado e estado financeiro', () => {
    const joined = CONDITION_CATALOG
      .map((item) => `${item.code} ${item.label} ${item.category}`)
      .join(' ')
      .toLowerCase();
    expect(joined).not.toMatch(/autorizado|pago|conclu[ií]do|financeiro|budget|tuss|snodent/);
    expect(CONDITION_CATALOG.some((item) => item.category === 'financial')).toBe(false);
    expect(isValidConditionCode('authorized')).toBe(false);
    expect(isValidConditionCode('paid')).toBe(false);
    expect(isValidConditionCode('higido')).toBe(false);
    expect(isValidConditionCode('healthy')).toBe(true);
    expect(getConditionDefinition('caries').scope).toBe('tooth_or_surface');
    expect(getConditionsByScope('tooth').some((item) => item.code === 'healthy')).toBe(true);
    expect(getConditionsByScope('tooth').some((item) => item.code === 'caries')).toBe(true);
    expect(getConditionsByScope('surface').some((item) => item.code === 'healthy')).toBe(false);
    expect(getConditionsByScope('unknown')).toBeNull();
  });
});
