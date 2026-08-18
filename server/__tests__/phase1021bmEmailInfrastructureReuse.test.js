/**
 * PHASE_10.21BM — SSOT de e-mail: Auth SMTP ≠ transacional genérico.
 * Sem envio real. Sem secrets. Sem inviteUserByEmail no fluxo de assinatura.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEmailConfig, getEmailTransportInventory } from '../email/emailConfig.js';
import { sendTransactionalEmail } from '../email/emailProvider.js';
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

describe('PHASE_10.21BM email infrastructure reuse', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('EMAIL_API_KEY', '');
    vi.stubEnv('EMAIL_FROM_ADDRESS', '');
    vi.stubEnv('EMAIL_PROVIDER', '');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASSWORD', '');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('APP_INVITE_REDIRECT_TO', 'https://loveodonto.com.br/primeiro-acesso');
  });

  it('A) onboarding continua no Auth SMTP quando overlay HTTP está ausente', async () => {
    const authUser = { id: 'auth-bm', email: 'colaborador@clinica.com' };
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
    expect(supabase.auth.admin.inviteUserByEmail).toHaveBeenCalled();
    expect(result.emailDelivery).toBe('supabase_auth');
    expect(getEmailConfig().isConfigured).toBe(false);
  });

  it('B) assinatura não usa inviteUserByEmail como hack', () => {
    const files = [
      'src/services/signatureInviteEmailService.js',
      'src/services/signatureProviderService.js',
      'server/lib/contractsSignatureEmailApi.js',
      'server/email/buildSignatureInviteEmail.js',
    ];
    for (const rel of files) {
      const src = readSrc(rel);
      expect(src).not.toMatch(/\.inviteUserByEmail\s*\(/);
      expect(src).not.toMatch(/\.resetPasswordForEmail\s*\(/);
      expect(src).not.toMatch(/redirectTo.*assinatura/);
    }
  });

  it('C/D) sem transporte transacional = fail closed e não delivered', async () => {
    const inventory = getEmailTransportInventory();
    expect(inventory.transactionalConfigured).toBe(false);
    expect(inventory.directSmtpConfigured).toBe(false);
    expect(inventory.transactionalProvider).toBeNull();
    expect(getEmailConfig().provider).toBeNull();
    await expect(sendTransactionalEmail({
      to: 'paciente@example.invalid',
      subject: 'x',
      text: 'x',
      html: '<p>x</p>',
    })).rejects.toThrow(/ausente|não está configurado|não configurado/i);

    const handler = createContractsSignatureInviteEmailHandler();
    const res = mockRes();
    await handler({ body: { to: 'paciente@example.invalid', signPath: '/assinatura/csgn-ok' } }, res);
    expect(res.statusCode).toBe(503);
    expect(['RESEND_NOT_CONFIGURED', 'SMTP_NOT_CONFIGURED', 'EMAIL_PROVIDER_NOT_CONFIGURED']).toContain(res.body.code);
    expect(res.body.ok).not.toBe(true);
    expect(res.body.simulated).not.toBe(true);
  });

  it('M) inventário e logs não expõem secrets', () => {
    vi.stubEnv('EMAIL_API_KEY', 're_secret_should_not_leak');
    vi.stubEnv('RESEND_API_KEY', 're_bq_secret_should_not_leak');
    vi.stubEnv('SMTP_PASSWORD', 'smtp_secret_should_not_leak');
    const inventory = getEmailTransportInventory();
    const dumped = JSON.stringify(inventory);
    expect(dumped).not.toContain('re_secret_should_not_leak');
    expect(dumped).not.toContain('re_bq_secret_should_not_leak');
    expect(dumped).not.toContain('smtp_secret_should_not_leak');
    expect(inventory.env.EMAIL_API_KEY).toBe('PRESENT');
    expect(inventory.env.RESEND_API_KEY).toBe('PRESENT');
    expect(inventory.env.SMTP_PASSWORD).toBe('PRESENT');
    const audit = readSrc('server/email/emailAuditLog.js');
    const api = readSrc('server/lib/contractsSignatureEmailApi.js');
    expect(audit).toContain('sanitizeForLog');
    expect(api).toContain("console.error('[signature-invite-email]', mapped.code)");
    expect(api).not.toMatch(/process\.env\.EMAIL_API_KEY/);
    expect(api).not.toMatch(/process\.env\.SMTP_PASSWORD/);
  });
});
