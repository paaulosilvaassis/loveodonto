/**
 * @module domain/contracts/runtime/contracts-v2-secure-logger
 * @description Logger/sanitizer Contracts V2 — Phase 10.12.
 */

export type ContractsV2LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ContractsV2LogRecord {
  level: ContractsV2LogLevel;
  message: string;
  correlationId?: string;
  requestId?: string;
  eventCode?: string;
  operation?: string;
  result?: string;
  tenantIdAbbrev?: string;
  contractIdAbbrev?: string;
  durationMs?: number;
  httpStatus?: number;
  internalErrorCode?: string;
  meta?: Record<string, unknown>;
}

export interface ContractsV2SecureLogger {
  log(record: ContractsV2LogRecord): void;
  child(bindings: Partial<ContractsV2LogRecord>): ContractsV2SecureLogger;
}

const SENSITIVE_KEY_RE =
  /^(token|otp|code|password|secret|authorization|cookie|cpf|email|phone|telefone|signedUrl|signed_url|html|snapshot|signature|artifact|body)$/i;

const TOKEN_LIKE_RE = /\b[a-f0-9]{32,}\b/gi;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const PHONE_RE = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/g;
const URL_WITH_TOKEN_RE = /https?:\/\/[^\s]+\/(?:assinar\/v2\/|signatures-v2\/)[^\s]+/gi;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]+/gi;

const OTP_INLINE_RE = /\b(otp|code|pin)\s*[=:]\s*\d{4,8}\b/gi;

export function redactSensitiveString(input: unknown): string {
  let s = String(input ?? '');
  s = s.replace(BEARER_RE, 'Bearer [REDACTED]');
  s = s.replace(URL_WITH_TOKEN_RE, '[REDACTED_PUBLIC_LINK]');
  s = s.replace(OTP_INLINE_RE, '$1=[REDACTED_OTP]');
  s = s.replace(EMAIL_RE, '[REDACTED_EMAIL]');
  s = s.replace(CPF_RE, '[REDACTED_CPF]');
  s = s.replace(PHONE_RE, '[REDACTED_PHONE]');
  s = s.replace(TOKEN_LIKE_RE, '[REDACTED_TOKEN]');
  return s;
}

export function sanitizeLogMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (typeof value === 'string') {
      out[key] = redactSensitiveString(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeLogMeta(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function abbreviateId(id: string | undefined | null, keep = 8): string | undefined {
  if (!id) return undefined;
  const s = String(id);
  if (s.length <= keep) return s;
  return `${s.slice(0, keep)}…`;
}

export function createContractsV2SecureLogger(
  sink: (line: string) => void = (line) => {
    // eslint-disable-next-line no-console
    console.info(line);
  },
): ContractsV2SecureLogger {
  function write(record: ContractsV2LogRecord) {
    const safe: ContractsV2LogRecord = {
      ...record,
      message: redactSensitiveString(record.message),
      meta: sanitizeLogMeta(record.meta),
      tenantIdAbbrev: record.tenantIdAbbrev || abbreviateId(
        typeof record.meta?.tenantId === 'string' ? record.meta.tenantId : undefined,
      ),
      contractIdAbbrev: record.contractIdAbbrev || abbreviateId(
        typeof record.meta?.contractId === 'string' ? record.meta.contractId : undefined,
      ),
    };
    sink(JSON.stringify({
      channel: 'contracts-v2',
      level: safe.level,
      message: safe.message,
      correlationId: safe.correlationId,
      requestId: safe.requestId,
      eventCode: safe.eventCode,
      operation: safe.operation,
      result: safe.result,
      tenantIdAbbrev: safe.tenantIdAbbrev,
      contractIdAbbrev: safe.contractIdAbbrev,
      durationMs: safe.durationMs,
      httpStatus: safe.httpStatus,
      internalErrorCode: safe.internalErrorCode,
      meta: safe.meta,
    }));
  }

  return {
    log: write,
    child(bindings) {
      return {
        log(record) {
          write({ ...bindings, ...record });
        },
        child(more) {
          return createContractsV2SecureLogger(sink).child({ ...bindings, ...more });
        },
      };
    },
  };
}
