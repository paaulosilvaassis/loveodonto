import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../email/transactionalEmailService.js', () => ({
  sendTransactionalEmail: vi.fn(async () => ({
    provider: 'smtp',
    messageId: 're_test',
    acceptedByTransport: true,
    simulated: false,
    ok: true,
  })),
}));

vi.mock('../email/emailConfig.js', () => ({
  getEmailConfig: vi.fn(() => ({
    isConfigured: true,
    provider: 'smtp',
    fromAddress: 'no-reply@loveodonto.com.br',
    fromName: 'Love Odonto',
    apiKey: '',
  })),
  getSmtpConfig: vi.fn(() => ({ isConfigured: true })),
  isTransactionalEmailConfigured: vi.fn(() => true),
}));

import { sendTransactionalEmail } from '../email/transactionalEmailService.js';
import { getEmailConfig, isTransactionalEmailConfigured } from '../email/emailConfig.js';
import { createContractsSignatureInviteEmailHandler } from '../lib/contractsSignatureEmailApi.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

describe('signature invite email API', () => {
  beforeEach(() => {
    sendTransactionalEmail.mockClear();
    getEmailConfig.mockReturnValue({
      isConfigured: true,
      provider: 'smtp',
      fromAddress: 'no-reply@loveodonto.com.br',
      fromName: 'Love Odonto',
      apiKey: '',
    });
    isTransactionalEmailConfigured.mockReturnValue(true);
  });

  it('rejeita e-mail inválido e não chama o provedor', async () => {
    const handler = createContractsSignatureInviteEmailHandler();
    const res = mockRes();
    await handler({ body: { to: '', signPath: '/assinatura/abc' } }, res);
    expect(res.statusCode).toBe(400);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('rejeita caminho de assinatura inválido', async () => {
    const handler = createContractsSignatureInviteEmailHandler();
    const res = mockRes();
    await handler({ body: { to: 'a@b.com', signPath: 'https://evil.example/phish' } }, res);
    expect(res.statusCode).toBe(400);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('503 quando provedor não configurado', async () => {
    getEmailConfig.mockReturnValue({ isConfigured: false, provider: null });
    isTransactionalEmailConfigured.mockReturnValue(false);
    const handler = createContractsSignatureInviteEmailHandler();
    const res = mockRes();
    await handler({ body: { to: 'a@b.com', signPath: '/assinatura/token-1' } }, res);
    expect(res.statusCode).toBe(503);
    expect(['RESEND_NOT_CONFIGURED', 'SMTP_NOT_CONFIGURED']).toContain(res.body.code);
    expect(String(res.body.error || '')).toMatch(/Supabase Auth|não está configurado/i);
    expect(String(res.body.error || '')).not.toMatch(/EMAIL_API_KEY|RESEND_API_KEY/i);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('sucesso só após o provedor aceitar', async () => {
    const handler = createContractsSignatureInviteEmailHandler();
    const res = mockRes();
    await handler({
      body: {
        to: 'paciente@example.invalid',
        signPath: '/assinatura/csgn-ok',
        patientName: 'Paulo',
        contractNumber: 'CTR-2026-00003',
      },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.simulated).toBe(false);
    expect(res.body.messageId).toBe('re_test');
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const arg = sendTransactionalEmail.mock.calls[0][0];
    expect(arg.to).toBe('paciente@example.invalid');
    expect(String(arg.html || '')).toContain('/assinatura/csgn-ok');
    expect(String(arg.subject || '')).toMatch(/Assinatura de contrato/i);
    expect(String(arg.html || '')).toContain('REVISAR E ASSINAR CONTRATO');
    expect(String(arg.html || '')).toContain('CTR-2026-00003');
    expect(res.body.delivered).toBe(false);
  });

  it('F) rejeição do transporte vira 502 e não delivered', async () => {
    sendTransactionalEmail.mockRejectedValueOnce(new Error('HTTP 429'));
    const handler = createContractsSignatureInviteEmailHandler();
    const res = mockRes();
    await handler({
      body: { to: 'paciente@example.invalid', signPath: '/assinatura/csgn-ok' },
    }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.ok).not.toBe(true);
    expect(['EMAIL_PROVIDER_REJECTED', 'SMTP_SEND_FAILED']).toContain(res.body.code);
  });

  it('escapa HTML do nome do paciente no template', async () => {
    const handler = createContractsSignatureInviteEmailHandler();
    const res = mockRes();
    await handler({
      body: {
        to: 'paciente@example.invalid',
        signPath: '/assinatura/csgn-ok',
        patientName: '<img src=x onerror=alert(1)>',
        contractNumber: 'CTR-2026-00003',
      },
    }, res);
    expect(res.statusCode).toBe(200);
    const html = String(sendTransactionalEmail.mock.calls[0][0].html || '');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
