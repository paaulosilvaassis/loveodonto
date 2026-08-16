/**
 * PHASE_10.21BM — assinatura não abusa Auth; retry jurídico permanece idempotente.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('PHASE_10.21BM signature vs auth email', () => {
  it('B) frontend de assinatura não chama inviteUserByEmail', () => {
    const invite = readSrc('src/services/signatureInviteEmailService.js');
    const provider = readSrc('src/services/signatureProviderService.js');
    const flow = readSrc('src/services/contractSignatureFlowService.js');
    expect(invite).not.toMatch(/\.inviteUserByEmail\s*\(|\.resetPasswordForEmail\s*\(/);
    expect(provider).not.toMatch(/\.inviteUserByEmail\s*\(|\.resetPasswordForEmail\s*\(/);
    expect(flow).not.toMatch(/\.inviteUserByEmail\s*\(|\.resetPasswordForEmail\s*\(/);
    expect(invite).toContain('SIGNATURE_INVITE_EMAIL_PATH');
  });

  it('E) delivery simulado não conta como enviado', () => {
    const flow = readSrc('src/services/contractSignatureFlowService.js');
    const invite = readSrc('src/services/signatureInviteEmailService.js');
    expect(flow).toContain('delivery?.simulated === true');
    expect(invite).toContain('json?.simulated === true');
  });

  it('G/H/I/J/K/L) retry reutiliza request/link e não fabrica evidence', () => {
    const provider = readSrc('src/services/signatureProviderService.js');
    expect(provider).toContain('findReusableSignatureArtifacts');
    expect(provider).toContain('preserveContractStatusAfterInvite');
    expect(provider).toContain('SIGNED_BY_CLINIC');
    const bl = readSrc('src/__tests__/phase1021blPatientSignatureEmailDelivery.test.js');
    expect(bl).toContain('CTR-2026-00003');
    expect(bl).toContain('retry reutiliza request/link');
    expect(bl).toContain("signerRole === 'PATIENT'");
  });
});
