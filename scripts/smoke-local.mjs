import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPO_ROOT,
  validateEnvAppOrExit,
  validateEnvStackOrExit,
  hostOf,
  getAppPlatformSupabaseUrl,
  getConsoleViteSupabaseUrl,
  getBackendSupabaseUrl,
} from './preflight-local.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function runStep(name, fn) {
  process.stdout.write(`[smoke] ${name}... `);
  fn();
  process.stdout.write('OK\n');
}

function assertFileContains(filePath, needle, label) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(needle)) {
    throw new Error(`${label}: não encontrou "${needle}" em ${path.relative(root, filePath)}.`);
  }
}

function collectJsLikeFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', '.cursor'].includes(entry.name)) continue;
      collectJsLikeFiles(full, files);
      continue;
    }
    if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function assertNoUnsafeLocalhostHardcode() {
  const files = collectJsLikeFiles(path.join(root, 'src'));
  const offenders = [];
  const allowlistedPaths = new Set([
    'src/pages/LoginPage.jsx',
    'src/services/tenantContextService.js',
    'src/services/collaboratorAccessProvisionService.js',
  ]);
  for (const file of files) {
    const relativePath = path.relative(root, file).replaceAll('\\', '/');
    if (allowlistedPaths.has(relativePath)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.includes('localhost') && !line.includes('127.0.0.1')) continue;
      const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join('\n');
      const hasDevGuard = /import\.meta\.env\.DEV|NODE_ENV|DEV/.test(context);
      if (!hasDevGuard) {
        offenders.push(`${relativePath}:${i + 1}`);
      }
    }
  }
  if (offenders.length > 0) {
    throw new Error(`localhost hardcoded sem guard de DEV: ${offenders.slice(0, 8).join(', ')}`);
  }
}

function assertSupabaseNotMixed() {
  const appHost = hostOf(getAppPlatformSupabaseUrl());
  const consoleHost = hostOf(getConsoleViteSupabaseUrl());
  const backendHost = hostOf(getBackendSupabaseUrl());
  if (!appHost || !consoleHost || !backendHost) {
    throw new Error('Hosts Supabase ausentes para validação.');
  }
  if (appHost !== consoleHost || appHost !== backendHost) {
    throw new Error(`Supabase misturado: app=${appHost} console=${consoleHost} backend=${backendHost}`);
  }
}

function buildApp() {
  execSync('npm run build', {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
  });
}

function main() {
  runStep('validar env stack (api+console)', () => validateEnvStackOrExit());
  runStep('validar env app (app+api)', () => validateEnvAppOrExit());
  runStep('validar Supabase nao misturado', () => assertSupabaseNotMixed());
  runStep('validar cliente de login existe', () => {
    assertFileContains(path.join(root, 'src/lib/supabaseClients.js'), 'supabasePlatformClient', 'Supabase client');
    assertFileContains(path.join(root, 'src/pages/LoginPage.jsx'), 'signInSaasWithPassword', 'Login SaaS');
  });
  runStep('validar rotas principais', () => {
    assertFileContains(path.join(root, 'src/App.jsx'), '/login', 'Rotas app');
    assertFileContains(path.join(root, 'src/ProtectedApp.jsx'), '/gestao/dashboard', 'Rotas protegidas');
    assertFileContains(path.join(root, 'src/ProtectedApp.jsx'), '/configuracoes/usuarios', 'Rotas protegidas');
    assertFileContains(
      path.join(root, 'src/pages/ConfiguracoesUsuariosPage.jsx'),
      'listCollaborators',
      'ConfiguracoesUsuariosPage',
    );
  });
  runStep('bloquear localhost sem guard de DEV', () => assertNoUnsafeLocalhostHardcode());
  runStep('compilar app', () => buildApp());
  process.stdout.write('[smoke] concluido com sucesso.\n');
}

main();

