/**
 * Cache de transporter.verify() — startup + TTL.
 * /health só lê o snapshot. Nunca imprime SMTP_USER/SMTP_PASSWORD.
 */
import { getSmtpConfig } from './emailConfig.js';
import { verifySmtpConnection } from './smtpMailer.js';

export const SMTP_VERIFY_TTL_MS = 5 * 60 * 1000;

const CONNECTION_OR_TLS = new Set(['CONNECTION_REFUSED', 'CONNECTION_TIMEOUT', 'TLS_ERROR']);

let cache = null;
let inflight = null;

export function resetSmtpVerifyCacheForTests() {
  cache = null;
  inflight = null;
}

export function peekSmtpVerifyCache() {
  return cache;
}

function publicMeta(cfg) {
  return {
    host: cfg.host || null,
    port: cfg.port || null,
    secure: typeof cfg.secure === 'boolean' ? cfg.secure : null,
  };
}

function shouldProbeStarttls(cfg, classification) {
  if (!cfg?.isConfigured) return false;
  const host = String(cfg.host || '').toLowerCase();
  const hostinger = host.includes('hostinger');
  const implicitTls = Number(cfg.port) === 465 && cfg.secure === true;
  return hostinger && implicitTls && CONNECTION_OR_TLS.has(classification);
}

function toHealthSnapshot(primary, alternate, cfg) {
  const meta = publicMeta(cfg);
  return {
    directSmtpConfigured: Boolean(cfg.isConfigured),
    directSmtpVerified: primary?.classification === 'SUCCESS',
    directSmtpVerifyCode: primary?.classification || (cfg.isConfigured ? 'PENDING' : 'CONFIG_ERROR'),
    directSmtpVerifyErrorCode: primary?.errorCode || null,
    directSmtpVerifyResponseCode: primary?.responseCode || null,
    directSmtpVerifyCommand: primary?.command || null,
    directSmtpHost: meta.host,
    directSmtpPort: meta.port,
    directSmtpSecure: meta.secure,
    directSmtpAlternatePort: alternate ? alternate.port : null,
    directSmtpAlternateVerified: alternate ? alternate.classification === 'SUCCESS' : null,
    directSmtpAlternateVerifyCode: alternate?.classification || null,
  };
}

function pendingSnapshot() {
  const cfg = getSmtpConfig();
  return toHealthSnapshot(null, null, cfg);
}

export function getPublicSmtpVerifyHealth() {
  if (cache?.health) return cache.health;
  return pendingSnapshot();
}

async function runDiagnose() {
  const cfg = getSmtpConfig();
  const primary = await verifySmtpConnection();
  let alternate = null;
  if (!primary.ok && shouldProbeStarttls(cfg, primary.classification)) {
    alternate = await verifySmtpConnection({ port: 587, secure: false, persistCache: false });
  }

  const health = toHealthSnapshot(primary, alternate, {
    ...cfg,
    host: primary.host || cfg.host,
    port: primary.port || cfg.port,
    secure: primary.secure,
  });

  cache = {
    at: Date.now(),
    primary,
    alternate,
    health,
  };

  console.log(
    `[smtp-verify] ok=${primary.ok} class=${primary.classification} host=${health.directSmtpHost} port=${health.directSmtpPort} secure=${health.directSmtpSecure}`,
  );
  if (alternate) {
    console.log(`[smtp-verify] alternate-587 class=${alternate.classification}`);
  }
  return cache;
}

export async function refreshSmtpVerifyCache({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < SMTP_VERIFY_TTL_MS) {
    return cache;
  }
  if (inflight) return inflight;
  inflight = runDiagnose().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function scheduleSmtpVerifyOnStartup() {
  refreshSmtpVerifyCache({ force: true }).catch((err) => {
    console.error('[smtp-verify] startup failed', String(err?.code || err?.message || 'unknown'));
  });
}
