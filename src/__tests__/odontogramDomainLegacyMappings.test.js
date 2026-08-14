import { describe, expect, it } from 'vitest';
import { BASIC_CONDITIONS, FACE_CODES } from '../components/odontogram/odontogramConstants.js';
import {
  DEFAULT_TOOTH_STATE,
  FACES,
  STATUS_OPTIONS,
} from '../components/odontogram-v2/odontogramV2Constants.js';
import {
  mapLegacyV1ConditionToCanonical,
  mapLegacyV2ConditionToCanonical,
  mapLegacyV1SurfaceToCanonical,
  mapLegacyV2SurfaceToCanonical,
} from '../domain/odontogram/index.js';

describe('OD-1A mapeamento legado v1', () => {
  it('cobre todas as condições reais do v1', () => {
    const expected = {
      higido: 'healthy',
      carie: 'caries',
      restauracao: 'restoration',
      ausente: 'missing',
      extracao_indicada: 'extraction_indicated',
      endodontia: 'endodontic_treatment',
      coroa_protese: 'crown_or_prosthesis',
      implante: 'implant',
      fratura: 'fracture',
    };
    expect(BASIC_CONDITIONS.map((item) => item.key)).toEqual(Object.keys(expected));
    for (const [legacy, canonical] of Object.entries(expected)) {
      const result = mapLegacyV1ConditionToCanonical(legacy);
      expect(result).toMatchObject({ value: canonical, status: 'exact', warnings: [] });
    }
    expect(mapLegacyV1ConditionToCanonical('CARIE')).toMatchObject({
      value: 'caries',
      status: 'normalized',
    });
    expect(mapLegacyV1ConditionToCanonical('EXTRACAO').status).toBe('unsupported');
    expect(mapLegacyV1ConditionToCanonical('pago').status).toBe('unsupported');
  });

  it('cobre todas as faces reais do v1 com transformação explícita', () => {
    expect(FACE_CODES).toEqual(['M', 'D', 'V', 'L', 'O']);
    expect(mapLegacyV1SurfaceToCanonical('16', 'M')).toMatchObject({ value: 'M', status: 'exact' });
    expect(mapLegacyV1SurfaceToCanonical('46', 'L')).toMatchObject({ value: 'L', status: 'exact' });
    expect(mapLegacyV1SurfaceToCanonical('16', 'O')).toMatchObject({ value: 'O', status: 'exact' });

    const palatal = mapLegacyV1SurfaceToCanonical('11', 'L');
    expect(palatal.value).toBe('P');
    expect(palatal.status).toBe('normalized');
    expect(palatal.warnings.some((item) => item.code === 'LEGACY_L_TO_P')).toBe(true);

    const incisal = mapLegacyV1SurfaceToCanonical('11', 'O');
    expect(incisal.value).toBe('I');
    expect(incisal.status).toBe('normalized');
    expect(incisal.warnings.some((item) => item.code === 'LEGACY_O_TO_I')).toBe(true);

    expect(mapLegacyV1SurfaceToCanonical('11', 'P').status).toBe('unsupported');
    expect(mapLegacyV1SurfaceToCanonical('11', 'I').status).toBe('unsupported');
  });
});

describe('OD-1A mapeamento legado v2', () => {
  it('cobre todos os status reais do v2', () => {
    const expectedExact = {
      HIGIDO: 'healthy',
      CARIE: 'caries',
      RESTAURACAO: 'restoration',
      AUSENTE: 'missing',
      SELANTE: 'sealant',
    };
    expect(STATUS_OPTIONS.map((item) => item.value)).toEqual([...Object.keys(expectedExact), 'EXTRACAO']);
    for (const [legacy, canonical] of Object.entries(expectedExact)) {
      expect(mapLegacyV2ConditionToCanonical(legacy)).toMatchObject({
        value: canonical,
        status: 'exact',
        warnings: [],
      });
    }
    expect(mapLegacyV2ConditionToCanonical('carie')).toMatchObject({
      value: 'caries',
      status: 'normalized',
    });
  });

  it('mapeia a flag de implante do v2 sem usar cor como identidade', () => {
    expect(DEFAULT_TOOTH_STATE).toHaveProperty('implant', false);
    const flag = mapLegacyV2ConditionToCanonical(true);
    expect(flag.value).toBe('implant');
    expect(flag.status).toBe('normalized');
    expect(flag.warnings.some((item) => item.code === 'LEGACY_V2_IMPLANT_FLAG')).toBe(true);
    expect(mapLegacyV2ConditionToCanonical('IMPLANTE').value).toBe('implant');
    expect(STATUS_OPTIONS.every((item) => typeof item.color === 'string')).toBe(true);
    expect(mapLegacyV2ConditionToCanonical('#22c55e').status).toBe('unsupported');
  });

  it('cobre todas as faces reais do v2 sem converter L/P silenciosamente', () => {
    expect(FACES).toEqual(['O', 'M', 'D', 'V', 'L', 'P']);
    expect(mapLegacyV2SurfaceToCanonical('16', 'O')).toMatchObject({ value: 'O', status: 'exact' });
    expect(mapLegacyV2SurfaceToCanonical('11', 'P')).toMatchObject({ value: 'P', status: 'exact' });
    expect(mapLegacyV2SurfaceToCanonical('41', 'L')).toMatchObject({ value: 'L', status: 'exact' });

    const incisal = mapLegacyV2SurfaceToCanonical('11', 'O');
    expect(incisal.value).toBe('I');
    expect(incisal.status).toBe('normalized');
    expect(incisal.warnings.some((item) => item.code === 'LEGACY_O_TO_I')).toBe(true);

    const lingualOnMaxilla = mapLegacyV2SurfaceToCanonical('11', 'L');
    expect(lingualOnMaxilla.value).toBeNull();
    expect(lingualOnMaxilla.status).toBe('ambiguous');
    expect(lingualOnMaxilla.warnings.some((item) => item.code === 'LEGACY_V2_LINGUAL_ON_MAXILLA')).toBe(true);

    const palatalOnMandible = mapLegacyV2SurfaceToCanonical('41', 'P');
    expect(palatalOnMandible.value).toBeNull();
    expect(palatalOnMandible.status).toBe('ambiguous');
    expect(palatalOnMandible.warnings.some((item) => item.code === 'LEGACY_V2_PALATAL_ON_MANDIBLE')).toBe(true);

    expect(mapLegacyV2SurfaceToCanonical('16', 'I').status).toBe('unsupported');
  });
});

describe('OD-1A ambiguidade e imutabilidade dos mapeadores', () => {
  it('não confunde EXTRACAO do v2 com extração concluída', () => {
    const result = mapLegacyV2ConditionToCanonical('EXTRACAO');
    expect(result.value).toBe('extraction_indicated');
    expect(result.status).toBe('ambiguous');
    expect(result.warnings.some((item) => item.code === 'LEGACY_V2_EXTRACTION_AMBIGUOUS')).toBe(true);
    expect(mapLegacyV2ConditionToCanonical('AUSENTE').value).toBe('missing');
    expect(mapLegacyV1ConditionToCanonical('extracao_indicada').value).toBe('extraction_indicated');
    expect(mapLegacyV1ConditionToCanonical('ausente').value).toBe('missing');
  });

  it('não muta argumentos e falha de forma previsível', () => {
    const payload = { value: 'CARIE' };
    mapLegacyV2ConditionToCanonical(payload.value);
    expect(payload).toEqual({ value: 'CARIE' });
    expect(mapLegacyV1ConditionToCanonical(null).status).toBe('unsupported');
    expect(mapLegacyV2ConditionToCanonical(32).status).toBe('unsupported');
    expect(mapLegacyV1SurfaceToCanonical('99', 'M').status).toBe('unsupported');
    expect(mapLegacyV2SurfaceToCanonical(11, ['O']).status).toBe('unsupported');
  });
});
