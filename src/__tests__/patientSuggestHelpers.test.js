import { describe, it, expect } from 'vitest';
import {
  getPatientSuggestLabel,
  getPatientSuggestId,
} from '../utils/patientSuggestHelpers.js';

describe('patientSuggestHelpers', () => {
  it('getPatientSuggestLabel usa fallbacks seguros', () => {
    expect(getPatientSuggestLabel(null)).toBe('Paciente');
    expect(getPatientSuggestLabel({ full_name: 'Maria' })).toBe('Maria');
    expect(getPatientSuggestLabel({ name: 'João' })).toBe('João');
  });

  it('getPatientSuggestLabel nunca usa texto de escopo como nome', () => {
    expect(getPatientSuggestLabel({
      name: 'Escopo: Todos os pacientes (sem filtro)',
      full_name: 'Maria Silva',
    })).toBe('Maria Silva');
    expect(getPatientSuggestLabel({
      name: 'Escopo: Todos os pacientes (sem filtro)',
    })).toBe('Paciente');
  });

  it('getPatientSuggestId retorna vazio sem id', () => {
    expect(getPatientSuggestId(null)).toBe('');
    expect(getPatientSuggestId({})).toBe('');
    expect(getPatientSuggestId({ id: 'pat-1' })).toBe('pat-1');
  });

});
