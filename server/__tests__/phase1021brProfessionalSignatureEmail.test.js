/**
 * PHASE_10.21BR — template institucional multi-tenant, sem mutação jurídica.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSignatureInviteEmail } from '../email/buildSignatureInviteEmail.js';
import {
  isGenericTreatmentName,
  resolveTreatmentName,
  sanitizeClinicIdentity,
} from '../email/signatureInviteClinicIdentity.js';
import { sendTransactionalEmail } from '../email/emailProvider.js';
import {
  resetSmtpTransporterCache,
  setSmtpTransporterForTests,
} from '../email/smtpMailer.js';
import { setResendFetchForTests } from '../email/resendMailer.js';
import { createContractsSignatureInviteEmailHandler } from '../lib/contractsSignatureEmailApi.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SIGN_URL = 'https://loveodonto.com.br/assinatura/csgn-br-token-exact';
const EXPIRES = '2026-08-25T15:00:00.000Z';

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function fullClinic() {
  return {
    name: 'Clínica Áurea Odontologia',
    legalName: 'Áurea Odontologia LTDA',
    logoUrl: 'https://cdn.example.test/logo-aurea.png',
    address: 'Rua das Acácias, 100, Centro',
    cityState: 'Belo Horizonte/MG',
    phone: '(31) 3333-4444',
    email: 'contato@aurea.example',
    technicalResponsible: 'Dra. Ana Costa',
    cro: 'CRO-MG 11111',
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

describe('PHASE_10.21BR professional signature invite template', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetSmtpTransporterCache();
    setSmtpTransporterForTests(null);
    setResendFetchForTests(null);
    vi.stubEnv('RESEND_API_KEY', 're_br_test_secret_do_not_leak');
    vi.stubEnv('SMTP_HOST', 'smtp.hostinger.com');
    vi.stubEnv('SMTP_PORT', '465');
    vi.stubEnv('SMTP_USER', 'smtp-user');
    vi.stubEnv('SMTP_PASSWORD', 'smtp-secret-value');
    vi.stubEnv('SMTP_SECURE', 'true');
  });

  it('A) clínica com logo e todos os dados', () => {
    const email = buildSignatureInviteEmail({
      patientName: 'Paulo Henrique Silva de Assis',
      treatmentName: 'Reabilitação sobre implantes',
      clinicIdentity: fullClinic(),
      signUrl: SIGN_URL,
      expiresAt: EXPIRES,
      contractNumber: 'CTR-2026-00003',
    });
    expect(email.html).toContain('https://cdn.example.test/logo-aurea.png');
    expect(email.html).toContain('Clínica Áurea Odontologia');
    expect(email.html).toContain('Rua das Acácias, 100, Centro');
    expect(email.html).toContain('Belo Horizonte/MG');
    expect(email.html).toContain('(31) 3333-4444');
    expect(email.html).toContain('contato@aurea.example');
    expect(email.html).not.toMatch(/Implanprime/i);
  });

  it('B) clínica sem logo mostra o nome', () => {
    const email = buildSignatureInviteEmail({
      patientName: 'Maria',
      clinicIdentity: { ...fullClinic(), logoUrl: '' },
      signUrl: SIGN_URL,
      contractNumber: 'CTR-2026-00003',
    });
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('Clínica Áurea Odontologia');
  });

  it('C) clínica sem telefone omite a linha', () => {
    const email = buildSignatureInviteEmail({
      patientName: 'Maria',
      clinicIdentity: { ...fullClinic(), phone: '' },
      signUrl: SIGN_URL,
    });
    expect(email.html).not.toContain('(31) 3333-4444');
    expect(email.text).not.toContain('(31) 3333-4444');
  });

  it('D) clínica sem endereço omite a linha', () => {
    const email = buildSignatureInviteEmail({
      patientName: 'Maria',
      clinicIdentity: { ...fullClinic(), address: '', cityState: '' },
      signUrl: SIGN_URL,
    });
    expect(email.html).not.toContain('Rua das Acácias');
    expect(email.text).not.toContain('Rua das Acácias');
  });

  it('E) tratamento válido aparece', () => {
    const email = buildSignatureInviteEmail({
      patientName: 'Maria',
      treatmentName: 'Clareamento',
      clinicIdentity: { name: 'Clínica Norte' },
      signUrl: SIGN_URL,
    });
    expect(email.html).toContain('Clareamento');
    expect(email.text).toContain('Tratamento: Clareamento');
  });

  it('F) tratamento ausente é omitido', () => {
    const email = buildSignatureInviteEmail({
      patientName: 'Maria',
      treatmentName: '',
      clinicIdentity: { name: 'Clínica Norte' },
      signUrl: SIGN_URL,
    });
    expect(email.html).not.toMatch(/>Tratamento</);
    expect(email.text).not.toMatch(/^Tratamento:/m);
  });

  it('G) treatmentName === "Tratamento" não aparece', () => {
    expect(isGenericTreatmentName('Tratamento')).toBe(true);
    expect(resolveTreatmentName('Tratamento odontológico')).toBe('');
    const email = buildSignatureInviteEmail({
      patientName: 'Maria',
      treatmentName: 'Tratamento',
      clinicIdentity: { name: 'Clínica Norte' },
      signUrl: SIGN_URL,
    });
    expect(email.html).not.toContain('referente ao tratamento');
    expect(email.html).not.toMatch(/>Tratamento</);
    expect(email.text).not.toContain('Tratamento: Tratamento');
  });

  it('H/I) display name e Reply-To da clínica no Resend', async () => {
    const sendMail = vi.fn();
    setSmtpTransporterForTests({ sendMail });
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.from).toBe('Clínica Áurea Odontologia <noreply@mail.loveodonto.com.br>');
      expect(body.reply_to).toEqual(['contato@aurea.example']);
      expect(body.from).not.toMatch(/onboarding@resend\.dev/i);
      return { ok: true, status: 200, json: async () => ({ id: 'resend-br-1' }) };
    });
    setResendFetchForTests(fetchMock);
    const handler = createContractsSignatureInviteEmailHandler();
    const res = mockRes();
    await handler({
      body: {
        to: 'paciente@example.invalid',
        signPath: '/assinatura/csgn-br-token-exact',
        patientName: 'Paulo Henrique Silva de Assis',
        treatmentName: 'Reabilitação sobre implantes',
        contractNumber: 'CTR-2026-00003',
        expiresAt: EXPIRES,
        clinicIdentity: fullClinic(),
      },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.provider).toBe('resend');
    expect(sendMail).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('J/K) URL/token e expiração permanecem iguais', () => {
    const email = buildSignatureInviteEmail({
      patientName: 'Maria Silva',
      clinicIdentity: { name: 'Clínica Norte' },
      signUrl: SIGN_URL,
      expiresAt: EXPIRES,
    });
    expect(email.signUrl).toBe(SIGN_URL);
    expect(email.html).toContain(`href="${SIGN_URL}"`);
    expect(email.text).toContain(SIGN_URL);
    expect(email.expiresAt).toBe(EXPIRES);
    expect(email.html).toMatch(/2026/);
  });

  it('L/M) provider Resend e SMTP fallback NO', async () => {
    const provider = readSrc('server/email/emailProvider.js');
    expect(provider).toContain('getResendConfig().isConfigured');
    expect(provider).toContain('return sendResendEmail');
    expect(provider).toMatch(/Falha Resend NÃO cai para SMTP/);
    const sendMail = vi.fn();
    setSmtpTransporterForTests({ sendMail });
    setResendFetchForTests(vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ message: 'down' }),
    })));
    await expect(sendTransactionalEmail({
      to: 'paciente@example.invalid',
      subject: 'x',
      text: 'x',
      html: '<p>x</p>',
      fromName: 'Clínica Norte',
    })).rejects.toMatchObject({ code: 'RESEND_REQUEST_FAILED' });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('N) text/plain presente', () => {
    const email = buildSignatureInviteEmail({
      patientName: 'Maria Silva',
      treatmentName: 'Clareamento',
      clinicIdentity: fullClinic(),
      signUrl: SIGN_URL,
      expiresAt: EXPIRES,
      contractNumber: 'CTR-2026-00003',
    });
    expect(email.text).toContain('Maria Silva');
    expect(email.text).toContain('Clínica Áurea Odontologia');
    expect(email.text).toContain(SIGN_URL);
    expect(email.text).toContain('CTR-2026-00003');
    expect(email.text).toContain('Assinatura segura');
  });

  it('O) escaping de conteúdo dinâmico', () => {
    const email = buildSignatureInviteEmail({
      patientName: '<img src=x onerror=alert(1)>',
      treatmentName: '<script>alert(1)</script>',
      clinicIdentity: {
        name: 'Clínica <b>X</b>',
        address: '<iframe>',
        email: 'ok@clinic.example',
      },
      signUrl: SIGN_URL,
    });
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<iframe>');
    expect(email.html).toContain('&lt;img');
    expect(email.html).toContain('&lt;script&gt;');
    expect(sanitizeClinicIdentity({ email: 'not-an-email' }).email).toBe('');
  });

  it('P) renderização não muta fluxo jurídico', () => {
    const src = readSrc('server/email/buildSignatureInviteEmail.js');
    expect(src).not.toMatch(/createSignatureRequest|signContractViaLink|contractSignatures/);
    expect(src).toContain('signUrl');
    expect(src).not.toContain('Implanprime');
    expect(readSrc('src/services/clinicEmailIdentity.js')).toContain('getClinic()');
    expect(readSrc('src/services/clinicEmailIdentity.js')).not.toContain('Implanprime');
  });
});
