import { describe, it, expect } from 'vitest';
import {
  buildAtestadoPrintHtml,
  buildAtestadoPrintContext,
  buildAtestadoPreviewText,
  hasText,
} from '../components/clinical/documents/atestadoPrintTemplate.js';

const baseDb = {
  clinicProfile: {
    nomeClinica: 'Clínica Sorriso',
    logoUrl: 'https://cdn.example.com/logo.png',
    emailPrincipal: 'contato@sorriso.com.br',
  },
  clinicDocumentation: {
    cnpj: '12345678000199',
    responsavelTecnico: 'Dra. Ana Responsável',
    croResponsavelTecnico: 'CRO-SP 123456',
  },
  clinicAddresses: [{
    principal: true,
    logradouro: 'Rua das Flores',
    numero: '100',
    bairro: 'Centro',
    cidade: 'São Paulo',
    uf: 'SP',
  }],
  clinicPhones: [{
    principal: true,
    whatsapp: true,
    ddd: '11',
    numero: '999998888',
  }],
};

const baseVars = {
  PACIENTE_NOME: 'João da Silva',
  PACIENTE_CPF: '529.982.247-25',
  PROFISSIONAL_NOME: 'Dr. Paulo Dentista',
  PROFISSIONAL_CRO: 'CRO-SP 654321',
  PROFISSIONAL_ESPECIALIDADE: 'Implantodontia',
  DATA_ATENDIMENTO: '18/06/2026',
  HORA_ATENDIMENTO: '14:30',
  DATA_EMISSAO: '18/06/2026',
  CIDADE: 'São Paulo/SP',
  DIAS_AFASTAMENTO: '2',
  CID: 'K08.8',
  OBSERVACOES: 'Repouso relativo recomendado.',
};

describe('atestadoPrintTemplate', () => {
  it('monta contexto com dados da clínica compactos', () => {
    const ctx = buildAtestadoPrintContext({
      db: baseDb,
      patient: { full_name: 'João da Silva', cpf: '52998224725' },
      professional: { nomeCompleto: 'Dr. Paulo', cro: '654321', uf: 'SP', especialidade: 'Implantodontia' },
      appointment: { date: '2026-06-18', startTime: '14:30' },
      variables: baseVars,
    });

    expect(ctx.clinic.name).toBe('Clínica Sorriso');
    expect(ctx.clinic.cnpj).toContain('123');
    expect(ctx.clinic.address).toContain('Rua das Flores');
    expect(ctx.clinic.whatsapp).toContain('11');
    expect(ctx.clinic.technicalResponsible).toBe('Dra. Ana Responsável');
    expect(ctx.certificate.daysLabel).toBe('2 dias');
    expect(ctx.certificate.cid).toBe('K08.8');
  });

  it('gera HTML profissional sem campos vazios nem about:blank', () => {
    const html = buildAtestadoPrintHtml({
      db: baseDb,
      patient: { full_name: 'João da Silva', cpf: '52998224725' },
      professional: { nomeCompleto: 'Dr. Paulo Dentista', cro: '654321', uf: 'SP' },
      appointment: { date: '2026-06-18', startTime: '14:30' },
      variables: baseVars,
    });

    expect(html).toContain('Atestado Odontológico');
    expect(html).toContain('Clínica Sorriso');
    expect(html).toContain('João da Silva');
    expect(html).toContain('necessitando de afastamento');
    expect(html).toContain('CID:');
    expect(html).toContain('K08.8');
    expect(html).toContain('Love Odonto');
    expect(html).not.toContain('about:blank');
    expect(html).not.toContain('Não informado');
    expect(html).not.toContain('nao informado');
  });

  it('omite CID e observações quando vazios', () => {
    const html = buildAtestadoPrintHtml({
      db: baseDb,
      patient: { full_name: 'Maria' },
      professional: { nomeCompleto: 'Dr. Teste' },
      appointment: { date: '2026-06-18', startTime: '10:00' },
      variables: { ...baseVars, CID: '', OBSERVACOES: '' },
    });

    expect(html).not.toContain('<strong>CID:</strong>');
    expect(html).not.toContain('Observações clínicas');
  });

  it('gera preview textual alinhado ao documento', () => {
    const text = buildAtestadoPreviewText(baseVars);
    expect(text).toContain('ATESTADO ODONTOLÓGICO');
    expect(text).toContain('João da Silva');
    expect(text).toContain('Período de afastamento: 2 dias');
  });

  it('hasText rejeita placeholders inválidos', () => {
    expect(hasText('')).toBe(false);
    expect(hasText('Não informado')).toBe(false);
    expect(hasText('São Paulo')).toBe(true);
  });
});
