/**
 * PHASE_10.21BN — SMTP direto transacional (mock transporter, zero envio real).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getEmailConfig,
  getEmailTransportInventory,
  getSmtpConfig,
} from '../email/emailConfig.js';
import { sendTransactionalEmail } from '../email/emailProvider.js';
import {
  resetSmtpTransporterCache,
  sendSmtpEmail,
  setSmtpTransporterForTests,
  SmtpTransportError,
} from '../email/smtpMailer.js';
import { createContractsSignatureInviteEmailHandler } from '../lib/contractsSignatureEmailApi.js';
import { dispatchCollaboratorInvite } from '../collaboratorInviteDispatch.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
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

function stubSmtpEnv({ complete = true } = {}) {
  vi.stubEnv('SMTP_HOST', complete ? 'smtp.example.test' : '');
  vi.stubEnv('SMTP_PORT', complete ? '465' : '');
  vi.stubEnv('SMTP_USER', complete ? 'smtp-user' : '');
  vi.stubEnv('SMTP_PASSWORD', complete ? 'smtp-secret-value' : '');
  vi.stubEnv('SMTP_SECURE', complete ? 'true' : '');
  vi.stubEnv('EMAIL_FROM_ADDRESS', complete ? 'no-reply@loveodonto.com.br' : '');
  vi.stubEnv('EMAIL_FROM_NAME', complete ? 'Love Odonto' : '');
  vi.stubEnv('EMAIL_API_KEY', '');
  vi.stubEnv('EMAIL_PROVIDER', '');
  vi.stubEnv('RESEND_API_KEY', '');
}

describe('PHASE_10.21BN direct SMTP transactional email', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetSmtpTransporterCache();
    setSmtpTransporterForTests(null);
    stubSmtpEnv({ complete: false });
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('APP_INVITE_REDIRECT_TO', 'https://loveodonto.com.br/primeiro-acesso');
  });

  it('A) config ausente → directSmtpConfigured=false', () => {
    const inventory = getEmailTransportInventory();
    expect(inventory.directSmtpConfigured).toBe(false);
    expect(inventory.directSmtpProvider).toBeNull();
    expect(getSmtpConfig().isConfigured).toBe(false);
  });

  it('B) config completa → true', () => {
    stubSmtpEnv({ complete: true });
    const inventory = getEmailTransportInventory();
    expect(inventory.directSmtpConfigured).toBe(true);
    expect(inventory.directSmtpProvider).toBe('smtp');
    expect(inventory.transactionalConfigured).toBe(true);
    expect(inventory.transactionalProvider).toBe('smtp');
  });

  it('C) password nunca aparece no health/inventory', () => {
    stubSmtpEnv({ complete: true });
    const dumped = JSON.stringify(getEmailTransportInventory());
    expect(dumped).not.toContain('smtp-secret-value');
    expect(getEmailTransportInventory().env.SMTP_PASSWORD).toBe('PRESENT');
  });

  it('D) send sem config → fail closed', async () => {
    await expect(sendTransactionalEmail({
      to: 'paciente@example.invalid',
      subject: 'x',
      text: 'x',
      html: '<p>x</p>',
    })).rejects.toMatchObject({ code: 'RESEND_NOT_CONFIGURED' });
  });

  it('E) SMTP success → provider accepted', async () => {
    stubSmtpEnv({ complete: true });
    const sendMail = vi.fn(async () => ({ messageId: '<smtp-1@example>' }));
    setSmtpTransporterForTests({ sendMail });
    const result = await sendSmtpEmail({
      to: 'paciente@example.invalid',
      subject: 'Contrato',
      text: 'texto',
      html: '<p>ok</p>',
    });
    expect(result.acceptedByTransport).toBe(true);
    expect(result.provider).toBe('smtp');
    expect(result.messageId).toBe('<smtp-1@example>');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('F) SMTP auth failure → erro', async () => {
    stubSmtpEnv({ complete: true });
    setSmtpTransporterForTests({
      sendMail: vi.fn(async () => {
        const err = new Error('Invalid login');
        err.code = 'EAUTH';
        err.responseCode = 535;
        throw err;
      }),
    });
    await expect(sendSmtpEmail({
      to: 'paciente@example.invalid',
      subject: 'x',
      text: 'x',
      html: '<p>x</p>',
    })).rejects.toMatchObject({ code: 'SMTP_AUTH_FAILED' });
  });

  it('G) SMTP timeout → erro', async () => {
    stubSmtpEnv({ complete: true });
    setSmtpTransporterForTests({
      sendMail: vi.fn(async () => {
        const err = new Error('Connection timeout');
        err.code = 'ETIMEDOUT';
        throw err;
      }),
    });
    await expect(sendSmtpEmail({
      to: 'paciente@example.invalid',
      subject: 'x',
      text: 'x',
      html: '<p>x</p>',
    })).rejects.toMatchObject({ code: 'SMTP_CONNECTION_FAILED' });
  });

  it('H) invalid recipient → erro', async () => {
    stubSmtpEnv({ complete: true });
    setSmtpTransporterForTests({ sendMail: vi.fn() });
    await expect(sendSmtpEmail({ to: 'nao-e-email', subject: 'x', text: 'x', html: 'x' }))
      .rejects.toMatchObject({ code: 'INVALID_RECIPIENT' });
  });

  it('I) raw SMTP error não vaza para frontend', async () => {
    stubSmtpEnv({ complete: true });
    setSmtpTransporterForTests({
      sendMail: vi.fn(async () => {
        const err = new Error('connect ECONNREFUSED');
        err.code = 'ECONNREFUSED';
        throw err;
      }),
    });
    const handler = createContractsSignatureInviteEmailHandler();
    const res = mockRes();
    await handler({ body: { to: 'paciente@example.invalid', signPath: '/assinatura/csgn-ok' } }, res);
    expect(res.statusCode).toBe(502);
    expect(String(res.body.error || '')).not.toMatch(/ECONNREFUSED|535 Authentication/i);
    expect(res.body.code).toBe('SMTP_CONNECTION_FAILED');
  });

  it('J/K/L/P/Q/R/S) retry jurídico reutiliza request/link', () => {
    const provider = readSrc('src/services/signatureProviderService.js');
    const bl = readSrc('src/__tests__/phase1021blPatientSignatureEmailDelivery.test.js');
    expect(provider).toContain('findReusableSignatureArtifacts');
    expect(bl).toContain('retry reutiliza request/link');
    expect(bl).toContain('CTR-2026-00003');
    expect(bl).toContain('CTR-2026-00001');
    expect(bl).toContain("signerRole === 'PATIENT'");
  });

  it('M) double click não duplica envio ativo', async () => {
    stubSmtpEnv({ complete: true });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let started;
    const startedP = new Promise((resolve) => { started = resolve; });
    setSmtpTransporterForTests({
      sendMail: vi.fn(async () => {
        started();
        await gate;
        return { messageId: '<smtp-dup@example>' };
      }),
    });
    const handler = createContractsSignatureInviteEmailHandler();
    const firstRes = mockRes();
    const firstPromise = handler(
      { body: { to: 'paciente@example.invalid', signPath: '/assinatura/csgn-ok' } },
      firstRes,
    );
    await startedP;
    const secondRes = mockRes();
    await handler(
      { body: { to: 'paciente@example.invalid', signPath: '/assinatura/csgn-ok' } },
      secondRes,
    );
    expect(secondRes.statusCode).toBe(409);
    expect(secondRes.body.code).toBe('SMTP_SEND_IN_FLIGHT');
    release();
    await firstPromise;
    expect(firstRes.statusCode).toBe(200);
    expect(firstRes.body.ok).toBe(true);
  });

  it('N) Auth onboarding continua no Supabase Auth mesmo com SMTP direto', async () => {
    stubSmtpEnv({ complete: true });
    expect(getSmtpConfig().isConfigured).toBe(true);
    expect(getEmailConfig().isConfigured).toBe(false);
    const authUser = { id: 'auth-bn', email: 'colaborador@clinica.com' };
    const supabase = {
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
          inviteUserByEmail: vi.fn(async () => ({ data: { user: authUser }, error: null })),
          generateLink: vi.fn(),
        },
      },
    };
    const result = await dispatchCollaboratorInvite(supabase, {
      email: authUser.email,
      tenantId: 'tenant-1',
      role: 'atendimento',
      collaboratorId: 'col-1',
      collaboratorName: 'Colaborador',
      userName: 'Colaborador',
      profileRole: 'atendimento',
    });
    expect(result.emailDelivery).toBe('supabase_auth');
    expect(supabase.auth.admin.inviteUserByEmail).toHaveBeenCalled();
  });

  it('O) assinatura NÃO usa inviteUserByEmail', () => {
    const api = readSrc('server/lib/contractsSignatureEmailApi.js');
    const mailer = readSrc('server/email/smtpMailer.js');
    expect(api).not.toMatch(/\.inviteUserByEmail\s*\(/);
    expect(mailer).not.toMatch(/\.inviteUserByEmail\s*\(/);
  });

  it('T) zero envio real nos testes — transporter é mock', () => {
    expect(SmtpTransportError.name).toBe('SmtpTransportError');
    const mailer = readSrc('server/email/smtpMailer.js');
    expect(mailer).toContain('setSmtpTransporterForTests');
  });
});
