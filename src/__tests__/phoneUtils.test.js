import { describe, expect, it, beforeEach } from 'vitest';
import {
  normalizeBrazilianPhoneParts,
  isBrazilianPhonePartsValid,
  formatBrazilianPhoneDisplay,
  sanitizePhoneNumberInput,
  phonePartsToKey,
} from '../utils/phoneUtils.js';
import { addClinicPhone } from '../services/clinicService.js';
import { initDb, resetDb, loadDb } from '../db/index.js';

const admin = { id: 'user-admin', role: 'admin' };

describe('phoneUtils', () => {
  it('remove DDD duplicado do campo número', () => {
    expect(normalizeBrazilianPhoneParts('31', '(31) 97119-6315')).toEqual({
      ddd: '31',
      numero: '971196315',
    });
    expect(normalizeBrazilianPhoneParts('31', '97119-6315')).toEqual({
      ddd: '31',
      numero: '971196315',
    });
    expect(normalizeBrazilianPhoneParts('31', '31971196315')).toEqual({
      ddd: '31',
      numero: '971196315',
    });
  });

  it('aceita telefone fixo com 8 dígitos', () => {
    const parts = normalizeBrazilianPhoneParts('31', '(31) 3333-4444');
    expect(parts).toEqual({ ddd: '31', numero: '33334444' });
    expect(isBrazilianPhonePartsValid(parts.ddd, parts.numero)).toBe(true);
    expect(formatBrazilianPhoneDisplay(parts.ddd, parts.numero)).toBe('(31) 3333-4444');
  });

  it('extrai DDD quando informado apenas no número', () => {
    expect(normalizeBrazilianPhoneParts('', '31971196315')).toEqual({
      ddd: '31',
      numero: '971196315',
    });
  });

  it('sanitizePhoneNumberInput remove DDD do valor digitado', () => {
    expect(sanitizePhoneNumberInput('31971196315', '31')).toBe('971196315');
    expect(sanitizePhoneNumberInput('(31) 97119-6315', '31')).toBe('971196315');
  });
});

describe('addClinicPhone com normalização', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('salva celular com DDD duplicado no número', () => {
    addClinicPhone(admin, {
      tipo: 'whatsapp',
      ddd: '31',
      numero: '(31) 97119-6315',
      principal: true,
    });
    const db = loadDb();
    expect(db.clinicPhones[0]).toMatchObject({ ddd: '31', numero: '971196315', principal: true });
    expect(phonePartsToKey('31', '971196315')).toBe('31971196315');
  });

  it('rejeita telefone duplicado', () => {
    addClinicPhone(admin, { tipo: 'whatsapp', ddd: '31', numero: '971196315', principal: true });
    expect(() => addClinicPhone(admin, { tipo: 'comercial', ddd: '31', numero: '97119-6315' }))
      .toThrow('Este telefone já está cadastrado.');
  });

  it('marca primeiro telefone como principal automaticamente', () => {
    addClinicPhone(admin, { tipo: 'fixo', ddd: '31', numero: '33334444', principal: false });
    expect(loadDb().clinicPhones[0].principal).toBe(true);
  });
});
