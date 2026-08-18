/**
 * PHASE_10.21BQ — Resend como transporte transacional primário.
 * Zero fetch real. Zero sendMail SMTP quando Resend está configurado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getEmailTransportInventory,
  getResendConfig,
  getTransactionalEmailProvider,
  RESEND_FROM_ADDRESS,
} from '../email/emailConfig.js';
import { sendTransactionalEmail } from '../email/emailProvider.js';
import {
  resetSmtpTransporterCache,
  setSmtpTransporterForTests,
} from '../email/smtpMailer.js';
import {
  sendResendEmail,
  setResendFetchForTests,
} from '../email/resendMailer.js';
import { createContractsSignatureInviteEmailHandler } from '../lib/contractsSignatureEmailApi.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RESEND_SECRET = 're_bq_test_secret_do_not_leak';

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

function stubResendEnv() {
  vi.stubEnv('RESEND_API_KEY', RESEND_SECRET);
  vi.stubEnv('EMAIL_FROM_NAME', 'Love Odonto');
  vi.stubEnv('EMAIL_REPLY_TO', 'contato@loveodonto.com.br');
  vi.stubEnv('SMTP_HOST', 'smtp.hostinger.com');
  vi.stubEnv('SMTP_PORT', '465');
  vi.stubEnv('SMTP_USER', 'smtp-user');
  vi.stubEnv('SMTP_PASSWORD', 'smtp-secret-value');
  vi.stubEnv('SMTP_SECURE', 'true');
  vi.stubEnv('EMAIL_FROM_ADDRESS', 'no-reply@loveodonto.com.br');
  vi.stubEnv('EMAIL_API_KEY', '');
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('PHASE_10.21BQ Resend transactional cutover', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetSmtpTransporterCache();
    setSmtpTransporterForTests(null);
    setResendFetchForTests(null);
    stubResendEnv();
  });

  it('A) RESEND_API_KEY presente → provider=resend', () => {
    expect(getResendConfig().isConfigured).toBe(true);
    expect(getTransactionalEmailProvider()).toBe('resend');
    const inventory = getEmailTransportInventory();
    expect(inventory.resendConfigured).toBe(true);
    expect(inventory.transactionalConfigured).toBe(true);
    expect(inventory.transactionalProvider).toBe('resend');
  });

  it('B) Resend configurado → SMTP transporter NÃO é chamado', async () => {
    const sendMail = vi.fn(async () => ({ messageId: '<smtp-should-not-run>' }));
    setSmtpTransporterForTests({ sendMail, verify: vi.fn() });
    setResendFetchForTests(vi.fn(async () => jsonResponse(200, { id: 'resend-id-bq-1' })));
    await sendTransactionalEmail({
      to: 'paciente@example.invalid',
      subject: 'Assinatura de contrato — Implanprime',
      text: 'x',
      html: '<p>x</p>',
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('C) mock de sucesso → provider=resend + messageId', async () => {
    setResendFetchForTests(vi.fn(async () => jsonResponse(200, { id: 'c6a2e2d2-bq' })));
    const result = await sendResendEmail({
      to: 'paciente@example.invalid',
      subject: 'Assinatura de contrato — Implanprime',
      text: 'texto',
      html: '<p>ok</p>',
    });
    expect(result.ok).toBe(true);
    expect(result.acceptedByTransport).toBe(true);
    expect(result.delivered).toBe(false);
    expect(result.simulated).toBe(false);
    expect(result.provider).toBe('resend');
    expect(result.messageId).toBe('c6a2e2d2-bq');
  });

  it('D) erro Resend → fail closed e SMTP NÃO é fallback', async () => {
    const sendMail = vi.fn();
    setSmtpTransporterForTests({ sendMail });
    setResendFetchForTests(vi.fn(async () => jsonResponse(429, { message: 'rate limited' })));
    await expect(sendTransactionalEmail({
      to: 'paciente@example.invalid',
      subject: 'x',
      text: 'x',
      html: '<p>x</p>',
    })).rejects.toMatchObject({ code: 'RESEND_REJECTED' });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('E) /health inventory: resend configurado mesmo com SMTP legado', () => {
    const inventory = getEmailTransportInventory();
    expect(inventory.resendConfigured).toBe(true);
    expect(inventory.transactionalConfigured).toBe(true);
    expect(inventory.transactionalProvider).toBe('resend');
    expect(inventory.directSmtpConfigured).toBe(true);
    const index = readSrc('server/index.js');
    expect(index).toContain('resendConfigured: inventory.resendConfigured');
    expect(index).toContain('emailTransactionalProvider: inventory.transactionalProvider');
  });

  it('F) nenhum teste usa fetch real / from não é onboarding@resend.dev', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe('https://api.resend.com/emails');
      const body = JSON.parse(init.body);
      expect(body.from).toContain(RESEND_FROM_ADDRESS);
      expect(body.from).not.toMatch(/onboarding@resend\.dev/i);
      expect(body.reply_to).toEqual(['contato@loveodonto.com.br']);
      return jsonResponse(200, { id: 'resend-id-bq-from' });
    });
    setResendFetchForTests(fetchMock);
    await sendResendEmail({
      to: 'paciente@example.invalid',
      subject: 'x',
      text: 'x',
      html: '<p>x</p>',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const mailer = readSrc('server/email/resendMailer.js');
    expect(mailer).toContain("process.env.VITEST === 'true'");
    expect(mailer).toContain('setResendFetchForTests');
  });

  it('G) API key nunca aparece em inventory/logs/respostas', async () => {
    setResendFetchForTests(vi.fn(async () => jsonResponse(200, { id: 'resend-id-bq-secret' })));
    const dumped = JSON.stringify(getEmailTransportInventory());
    expect(dumped).not.toContain(RESEND_SECRET);
    expect(dumped).not.toContain('smtp-secret-value');
    expect(getEmailTransportInventory().env.RESEND_API_KEY).toBe('PRESENT');

    const handler = createContractsSignatureInviteEmailHandler();
    const res = mockRes();
    await handler({
      body: {
        to: 'paciente@example.invalid',
        signPath: '/assinatura/csgn-mock-bq-00003',
        patientName: 'Paulo Henrique Silva de Assis',
        clinicName: 'Implanprime',
        contractNumber: 'CTR-2026-00003',
      },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.provider).toBe('resend');
    expect(res.body.messageId).toBe('resend-id-bq-secret');
    expect(JSON.stringify(res.body)).not.toContain(RESEND_SECRET);
    const api = readSrc('server/lib/contractsSignatureEmailApi.js');
    expect(api).not.toMatch(/process\.env\.RESEND_API_KEY/);
    expect(api).toContain("console.error('[signature-invite-email]', mapped.code)");
  });
});
