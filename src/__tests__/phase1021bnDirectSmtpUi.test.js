import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SIGNATURE_INVITE_SENT_MSG } from '../services/signatureInviteEmailService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('PHASE_10.21BN frontend SMTP delivery copy', () => {
  it('sucesso não afirma entrega na caixa de entrada', () => {
    expect(SIGNATURE_INVITE_SENT_MSG).toBe('Link de assinatura enviado para o e-mail informado.');
    const contract = readSrc('src/components/clinical/ClinicalContractSection.jsx');
    const signature = readSrc('src/components/clinical/ClinicalSignatureSection.jsx');
    const modal = readSrc('src/components/contracts/SendContractSignatureModal.jsx');
    expect(contract).toContain(SIGNATURE_INVITE_SENT_MSG);
    expect(signature).toContain(SIGNATURE_INVITE_SENT_MSG);
    expect(contract).not.toMatch(/caixa de entrada/i);
    expect(modal).toContain('inFlightRef');
  });
});
