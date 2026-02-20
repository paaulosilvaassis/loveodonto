import { beforeEach, describe, expect, it } from 'vitest';
import { loadDb } from '../db/index.js';
import {
  addClinicAddress,
  addClinicPhone,
  updateClinicDocumentation,
  updateClinicProfile,
} from '../services/clinicService.js';
import { validateFileMeta } from '../utils/validators.js';

const admin = { id: 'user-admin', role: 'admin' };
const recepcao = { id: 'user-2', role: 'recepcao' };

describe('ClinicProfile - permissões e validações', () => {
  beforeEach(() => {
    localStorage.clear();
    loadDb();
  });

  it('bloqueia edição para usuário sem permissão', () => {
    expect(() =>
      updateClinicProfile(recepcao, {
        nomeClinica: 'Nova Clínica',
      })
    ).toThrow('Permissão insuficiente.');
  });

  it('valida CNPJ inválido na documentação', () => {
    expect(() =>
      updateClinicDocumentation(admin, {
        cnpj: '11.111.111/1111-11',
      })
    ).toThrow('CNPJ inválido.');
  });

  it('valida telefone e CEP', () => {
    expect(() =>
      addClinicPhone(admin, { tipo: 'whatsapp', ddd: '11', numero: '123', principal: true })
    ).toThrow('Telefone inválido.');
    expect(() =>
      addClinicAddress(admin, {
        tipo: 'principal',
        cep: '123',
        logradouro: 'Rua A',
        numero: '10',
        cidade: 'SP',
        uf: 'SP',
      })
    ).toThrow('CEP inválido.');
  });

  it('valida upload de arquivo por tipo e tamanho', () => {
    const ok = validateFileMeta({ type: 'image/png', size: 1024 }, ['image/png']);
    const badType = validateFileMeta({ type: 'image/jpeg', size: 1024 }, ['image/png']);
    const badSize = validateFileMeta({ type: 'image/png', size: 5 * 1024 * 1024 }, ['image/png']);
    expect(ok.ok).toBe(true);
    expect(badType.ok).toBe(false);
    expect(badSize.ok).toBe(false);
  });
});
