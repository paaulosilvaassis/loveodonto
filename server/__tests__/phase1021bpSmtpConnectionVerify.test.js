/**
 * PHASE_10.21BP — transporter.verify() sem sendMail, cache no /health, handler mock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifySmtpVerifyError,
  resetSmtpTransporterCache,
  setSmtpTransporterForTests,
  verifySmtpConnection,
} from '../email/smtpMailer.js';
import {
  getPublicSmtpVerifyHealth,
  peekSmtpVerifyCache,
  refreshSmtpVerifyCache,
  resetSmtpVerifyCacheForTests,
} from '../email/smtpVerifyCache.js';
import { createContractsSignatureInviteEmailHandler } from '../lib/contractsSignatureEmailApi.js';
import { sendTransactionalEmail } from '../email/transactionalEmailService.js';

vi.mock('../email/transactionalEmailService.js', () => ({
  sendTransactionalEmail: vi.fn(async () => ({
    ok: true,
    acceptedByTransport: true,
    delivered: false,
    simulated: false,
    provider: 'smtp',
    messageId: 'mock-bp-no-real-send',
  })),
}));

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function stubSmtpEnv({ host = 'smtp.example.test', port = '465', secure = 'true' } = {}) {
  vi.stubEnv('SMTP_HOST', host);
  vi.stubEnv('SMTP_PORT', port);
  vi.stubEnv('SMTP_USER', 'smtp-user');
  vi.stubEnv('SMTP_PASSWORD', 'smtp-secret-value');
  vi.stubEnv('SMTP_SECURE', secure);
  vi.stubEnv('EMAIL_FROM_ADDRESS', 'no-reply@loveodonto.com.br');
  vi.stubEnv('EMAIL_FROM_NAME', 'Love Odonto');
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

describe('PHASE_10.21BP SMTP connection verify', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetSmtpTransporterCache();
    setSmtpTransporterForTests(null);
    resetSmtpVerifyCacheForTests();
    sendTransactionalEmail.mockClear();
    stubSmtpEnv();
  });

  it('A) verify SUCCESS não chama sendMail', async () => {
    const sendMail = vi.fn();
    const verify = vi.fn(async () => true);
    setSmtpTransporterForTests({ sendMail, verify });
    const result = await verifySmtpConnection();
    expect(result.ok).toBe(true);
    expect(result.classification).toBe('SUCCESS');
    expect(verify).toHaveBeenCalledTimes(1);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('B) AUTH_FAILED classifica EAUTH/535', async () => {
    setSmtpTransporterForTests({
      sendMail: vi.fn(),
      verify: vi.fn(async () => {
        const err = new Error('Invalid login');
        err.code = 'EAUTH';
        err.responseCode = 535;
        err.command = 'AUTH PLAIN';
        throw err;
      }),
    });
    const result = await verifySmtpConnection();
    expect(result.ok).toBe(false);
    expect(result.classification).toBe('AUTH_FAILED');
    expect(result.errorCode).toBe('EAUTH');
    expect(result.responseCode).toBe(535);
    expect(result.command).toBe('AUTH PLAIN');
  });

  it('C) CONNECTION_REFUSED / TIMEOUT / TLS / DNS', () => {
    expect(classifySmtpVerifyError({ code: 'ECONNREFUSED' }).classification).toBe('CONNECTION_REFUSED');
    expect(classifySmtpVerifyError({ code: 'ETIMEDOUT', message: 'timeout' }).classification).toBe('CONNECTION_TIMEOUT');
    expect(classifySmtpVerifyError({ code: 'EPROTO', message: 'wrong version number' }).classification).toBe('TLS_ERROR');
    expect(classifySmtpVerifyError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' }).classification).toBe('DNS_ERROR');
  });

  it('D) config ausente → CONFIG_ERROR sem verify', async () => {
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_PASSWORD', '');
    const verify = vi.fn();
    setSmtpTransporterForTests({ verify, sendMail: vi.fn() });
    const result = await verifySmtpConnection();
    expect(result.classification).toBe('CONFIG_ERROR');
    expect(verify).not.toHaveBeenCalled();
  });

  it('E) /health lê cache e não dispara verify', async () => {
    const verify = vi.fn(async () => true);
    setSmtpTransporterForTests({ verify, sendMail: vi.fn() });
    const pending = getPublicSmtpVerifyHealth();
    expect(pending.directSmtpVerifyCode).toBe('PENDING');
    expect(verify).not.toHaveBeenCalled();
    expect(peekSmtpVerifyCache()).toBeNull();

    await refreshSmtpVerifyCache({ force: true });
    expect(verify).toHaveBeenCalledTimes(1);
    const health = getPublicSmtpVerifyHealth();
    expect(health.directSmtpConfigured).toBe(true);
    expect(health.directSmtpVerified).toBe(true);
    expect(health.directSmtpVerifyCode).toBe('SUCCESS');
    expect(verify).toHaveBeenCalledTimes(1);
    getPublicSmtpVerifyHealth();
    expect(verify).not.toHaveBeenCalledTimes(2);
  });

  it('F) snapshot público nunca inclui password/user secret', async () => {
    setSmtpTransporterForTests({ verify: vi.fn(async () => true), sendMail: vi.fn() });
    await refreshSmtpVerifyCache({ force: true });
    const dumped = JSON.stringify(getPublicSmtpVerifyHealth());
    expect(dumped).not.toContain('smtp-secret-value');
    expect(dumped).not.toContain('SMTP_PASSWORD');
    expect(dumped).not.toMatch(/smtp-user@|pass=/i);
  });

  it('G) Hostinger 465 connection/TLS tenta 587 STARTTLS sem persistir cache', async () => {
    stubSmtpEnv({ host: 'smtp.hostinger.com', port: '465', secure: 'true' });
    let calls = 0;
    setSmtpTransporterForTests({
      sendMail: vi.fn(),
      verify: vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          const err = new Error('connect ECONNREFUSED');
          err.code = 'ECONNREFUSED';
          throw err;
        }
        return true;
      }),
    });
    await refreshSmtpVerifyCache({ force: true });
    const health = getPublicSmtpVerifyHealth();
    expect(calls).toBe(2);
    expect(health.directSmtpVerified).toBe(false);
    expect(health.directSmtpVerifyCode).toBe('CONNECTION_REFUSED');
    expect(health.directSmtpAlternatePort).toBe(587);
    expect(health.directSmtpAlternateVerified).toBe(true);
    expect(health.directSmtpAlternateVerifyCode).toBe('SUCCESS');
  });

  it('H) AUTH_FAILED não tenta 587', async () => {
    stubSmtpEnv({ host: 'smtp.hostinger.com', port: '465', secure: 'true' });
    const verify = vi.fn(async () => {
      const err = new Error('authentication failed');
      err.code = 'EAUTH';
      err.responseCode = 535;
      throw err;
    });
    setSmtpTransporterForTests({ verify, sendMail: vi.fn() });
    await refreshSmtpVerifyCache({ force: true });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(getPublicSmtpVerifyHealth().directSmtpAlternatePort).toBeNull();
    expect(getPublicSmtpVerifyHealth().directSmtpVerifyCode).toBe('AUTH_FAILED');
  });

  it('I) handler CTR-2026-00003 usa mock e não sendMail real', async () => {
    const handler = createContractsSignatureInviteEmailHandler();
    const res = mockRes();
    await handler({
      body: {
        to: 'paciente@example.invalid',
        signPath: '/assinatura/csgn-mock-bp-00003',
        patientName: 'Paulo Henrique Silva de Assis',
        clinicName: 'Implanprime',
        contractNumber: 'CTR-2026-00003',
      },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.simulated).toBe(false);
    expect(res.body.messageId).toBe('mock-bp-no-real-send');
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const mailer = readSrc('server/email/smtpMailer.js');
    expect(mailer).toContain('await transporter.verify()');
    expect(mailer).not.toMatch(/rejectUnauthorized\s*:\s*false/);
  });

  it('J) rota POST autenticada + GET 405 + health cacheado', () => {
    const index = readSrc('server/index.js');
    expect(index).toContain("app.post('/internal/app/contracts/signature-invite-email', requireAppUser, handleContractsSignatureInviteEmail)");
    expect(index).toContain("app.get('/internal/app/contracts/signature-invite-email'");
    expect(index).toContain("code: 'METHOD_NOT_ALLOWED'");
    expect(index).toContain('directSmtpVerified: smtpVerify.directSmtpVerified');
    expect(index).toContain('directSmtpVerifyCode: smtpVerify.directSmtpVerifyCode');
    expect(index).toContain('getPublicSmtpVerifyHealth()');
    expect(index).toContain('scheduleSmtpVerifyOnStartup()');
    expect(index).not.toMatch(/rejectUnauthorized\s*:\s*false/);
    const cache = readSrc('server/email/smtpVerifyCache.js');
    expect(cache).toContain('SMTP_VERIFY_TTL_MS');
    expect(cache).not.toContain('sendMail');
  });

  it('K) frontend não atribui falha de fetch ao SMTP', () => {
    const service = readSrc('src/services/signatureInviteEmailService.js');
    expect(service).toContain('EMAIL_REQUEST_FAILED');
    expect(service).toContain('Admin API');
    expect(service).toContain("SIGNATURE_INVITE_EMAIL_PATH = '/internal/app/contracts/signature-invite-email'");
    expect(service).toContain('buildAdminApiUrl(SIGNATURE_INVITE_EMAIL_PATH)');
    expect(service).toContain('Authorization');
    expect(service).not.toContain('Não foi possível conectar ao serviço de e-mail.');
  });
});
