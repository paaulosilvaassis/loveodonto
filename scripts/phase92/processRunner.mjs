/**
 * Phase 9.2 — helpers de processo seguros (opt-in integration only).
 * Sem shell:true; sem npx; timeout + kill do filho.
 *
 * Callers must pass cwd explicitly (Phase 9.2E: supabase-local/ for CLI).
 * Não define workdir padrão — evita apontar acidentalmente para supabase/ do app.
 */
import { spawn } from 'node:child_process';

const MAX_OUTPUT = 100_000;
const SECRET_PATTERNS = [
  /service_role/gi,
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  /password[=:]\s*\S+/gi,
  /SECRET[=:]\s*\S+/gi,
];

export function sanitizeOutput(text = '') {
  let out = String(text || '').slice(0, MAX_OUTPUT);
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ timeoutMs?: number, cwd?: string, env?: NodeJS.ProcessEnv, stdin?: string }} [options]
 */
export function runProcess(command, args = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 15_000;
  const started = Date.now();
  const argsSanitized = args.map((a) => sanitizeOutput(String(a)));

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      windowsHide: true,
      shell: false,
    });

    if (typeof options.stdin === 'string' && child.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, 1000).unref?.();
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      if (stdout.length < MAX_OUTPUT) stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < MAX_OUTPUT) stderr += String(chunk);
    });

    const finish = (exitCode, errorMessage) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        argsSanitized,
        exitCode: timedOut ? null : exitCode,
        timedOut,
        stdoutSanitized: sanitizeOutput(stdout),
        stderrSanitized: sanitizeOutput(stderr || errorMessage || ''),
        durationMs: Date.now() - started,
      });
    };

    child.on('error', (err) => finish(null, err.message));
    child.on('close', (code) => finish(code, ''));
  });
}
