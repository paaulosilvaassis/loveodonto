import { describe, expect, it } from 'vitest';
import {
  resolveClinicTechnicalResponsible,
  resolveAttendingProfessionalCro,
} from '../contracts/clinicTechnicalResponsible.js';

describe('clinicTechnicalResponsible', () => {
  it('usa dados da clínica, sem fallback para dentista', () => {
    const docs = {
      responsavelTecnico: 'Dr. Responsável Clínica',
      croResponsavelTecnico: 'CRO-MG 11111',
    };
    const { name, cro } = resolveClinicTechnicalResponsible(docs, {});
    expect(name).toBe('Dr. Responsável Clínica');
    expect(cro).toBe('CRO-MG 11111');
  });

  it('aceita conselhoRegionalNumero legado como CRO da clínica', () => {
    const { cro } = resolveClinicTechnicalResponsible({ conselhoRegionalNumero: 'CRO-SP 99999' }, {});
    expect(cro).toBe('CRO-SP 99999');
  });

  it('não preenche nome do RT com dentista do atendimento', () => {
    const { name } = resolveClinicTechnicalResponsible({}, {});
    expect(name).toBe('');
  });

  it('resolve CRO do dentista executante separadamente', () => {
    expect(resolveAttendingProfessionalCro({ cro: 'CRO-RJ 555' })).toBe('CRO-RJ 555');
    expect(resolveAttendingProfessionalCro({ registroProfissional: '12345' })).toBe('12345');
  });
});
