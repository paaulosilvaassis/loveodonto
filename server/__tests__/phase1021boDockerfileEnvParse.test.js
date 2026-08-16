/**
 * PHASE_10.21BO — Dockerfile estático não pode emitir ENV com nome em branco.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('PHASE_10.21BO Dockerfile ENV parse', () => {
  it('usa Dockerfile versionado, não ENV gerado pelo Nixpacks', () => {
    expect(existsSync(path.join(ROOT, 'Dockerfile'))).toBe(true);
    const railway = JSON.parse(read('railway.json'));
    expect(railway.build.builder).toBe('DOCKERFILE');
    expect(railway.build.dockerfilePath).toBe('Dockerfile');
  });

  it('nenhuma instrução ENV tem nome em branco', () => {
    const dockerfile = read('Dockerfile');
    const envLines = dockerfile.split('\n').filter((line) => /^\s*ENV\b/.test(line));
    expect(envLines.length).toBeGreaterThan(0);
    for (const line of envLines) {
      expect(line).not.toMatch(/^\s*ENV\s+=/);
      expect(line).not.toMatch(/^\s*ENV\s+""=/);
      expect(line).not.toMatch(/^\s*ENV\s+$/);
      const body = line.replace(/^\s*ENV\s+/, '');
      for (const token of body.split(/\s+/).filter(Boolean)) {
        const key = token.split('=')[0];
        expect(key.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('não interpola secrets SMTP/Supabase/PLATFORM no Dockerfile', () => {
    const dockerfile = read('Dockerfile');
    const instructions = dockerfile
      .split('\n')
      .filter((line) => /^\s*(ENV|ARG)\b/.test(line))
      .join('\n');
    expect(instructions).not.toMatch(/SMTP_PASSWORD|SMTP_USER|SMTP_HOST/);
    expect(instructions).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|PLATFORM_API_KEY|EMAIL_API_KEY/);
    expect(instructions).not.toMatch(/ENV\s+=\$/);
    expect(instructions).not.toMatch(/ARG\s+.*=\$/);
    expect(instructions).toMatch(/ENV NODE_ENV=production/);
  });

  it('dockerignore impede copiar .env para a imagem', () => {
    const ignore = read('.dockerignore');
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toContain('node_modules');
  });
});
