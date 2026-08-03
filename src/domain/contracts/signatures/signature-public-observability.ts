/**
 * @module domain/contracts/signatures/signature-public-observability
 * @description Contadores técnicos locais — Phase 10.11.
 * Sem labels com CPF/e-mail/telefone/token/contractId completo.
 */

export type SignaturePublicMetricName =
  | 'signature_public_open_total'
  | 'signature_public_invalid_session_total'
  | 'signature_public_challenge_requested_total'
  | 'signature_public_challenge_failed_total'
  | 'signature_public_authenticated_total'
  | 'signature_public_signed_total'
  | 'signature_public_declined_total'
  | 'signature_delivery_simulated_total'
  | 'signature_delivery_failed_total'
  | 'signature_rate_limited_total'
  | 'signature_public_artifact_generation_failed_total';

export interface SignaturePublicMetrics {
  increment(name: SignaturePublicMetricName, labels?: Record<string, string>): void;
  snapshot(): Record<string, number>;
  reset(): void;
}

function sanitizeLabels(labels?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels || {})) {
    const key = String(k);
    if (/token|otp|email|phone|cpf|password|signedurl/i.test(key)) continue;
    const val = String(v || '');
    if (val.length > 32) {
      out[key] = `${val.slice(0, 8)}…`;
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function createInMemorySignaturePublicMetrics(): SignaturePublicMetrics {
  const counters = new Map<string, number>();
  return {
    increment(name, labels) {
      const safe = sanitizeLabels(labels);
      const key = `${name}|${JSON.stringify(safe)}`;
      counters.set(key, (counters.get(key) || 0) + 1);
    },
    snapshot() {
      const out: Record<string, number> = {};
      for (const [k, v] of counters.entries()) out[k] = v;
      return out;
    },
    reset() {
      counters.clear();
    },
  };
}

/** Log estruturado sem token/OTP/URL completa. */
export function createSafeSignaturePublicLogger(sink: (entry: Record<string, unknown>) => void = () => {}) {
  return {
    info(operation: string, fields: Record<string, unknown> = {}) {
      sink({
        level: 'info',
        operation,
        ...sanitizeLogFields(fields),
        at: new Date().toISOString(),
      });
    },
    warn(operation: string, fields: Record<string, unknown> = {}) {
      sink({
        level: 'warn',
        operation,
        ...sanitizeLogFields(fields),
        at: new Date().toISOString(),
      });
    },
  };
}

function sanitizeLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/token|otp|plainCode|signedUrl|fullLink|password|authorization/i.test(k)) continue;
    if (typeof v === 'string' && (v.startsWith('http') || v.length > 80)) {
      out[k] = '[redacted]';
      continue;
    }
    out[k] = v;
  }
  return out;
}
