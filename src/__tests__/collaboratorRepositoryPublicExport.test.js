/**
 * Sprint 1A Ticket 1.5 — Controle de exports públicos do barrel index.ts.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as collaboratorBarrel from '../repositories/collaborator/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SRC_ROOT, 'repositories/collaborator');
const INDEX_FILE = path.join(REPO_ROOT, 'index.ts');

/** Exports runtime permitidos no barrel (Ticket 1.5). */
const ALLOWED_RUNTIME_EXPORTS = new Set([
  'collaboratorRepository',
  'createCollaboratorRepository',
  'CollaboratorNotFoundError',
  'CollaboratorRepositoryLocalWriteDisabledError',
  'CollaboratorRepositoryNotImplementedError',
  'CollaboratorRepositoryRemoteReadDisabledError',
  'CollaboratorRepositoryRemoteWriteDisabledError',
  'CollaboratorRepositorySupabaseUnavailableError',
]);

/** Implementação interna que NÃO deve vazar pelo barrel. */
const FORBIDDEN_BARREL_EXPORTS = [
  'CollaboratorRepository',
  'CollaboratorSupabaseRepository',
  'collaboratorSupabaseRepository',
  'COLLABORATORS_TABLE',
  'CollaboratorIndexedDbRepository',
  'collaboratorIndexedDbRepository',
  'IDB_COLLABORATORS_COLLECTION',
  'collaboratorCache',
  'createCollaboratorCache',
  'COLLABORATOR_CACHE_TTL_MS',
  'COLLABORATOR_CACHE_NAMESPACE',
  'ICollaboratorCache',
  'mapSupabaseRowToCore',
  'mapCoreToSupabaseUpsert',
  'mapCreateDtoToSupabaseUpsert',
  'mapIndexedDbRowToCore',
  'mapCoreToIndexedDbMirror',
  'mapUpdateDtoToSupabaseUpsert',
  'toLegacyCollaboratorShape',
  'generateLegacyId',
  'isCollaboratorUuid',
  'isCollaboratorLegacyId',
  'assertValidTenantId',
  'CollaboratorMapperValidationError',
  'requireRepositoryTenantId',
  'requireUserTenantId',
  'getCollaboratorRepositoryFlags',
  'isRhSupabaseReadEnabled',
  'isRhSupabaseWriteEnabled',
  'RH_FLAG_KEYS',
  'COLLABORATOR_REPOSITORY_FLAG_DEFAULTS',
  'CollaboratorRepositoryFlagsValidationError',
  'CollaboratorSupabaseRow',
  'CollaboratorIndexedDbRow',
  'ICollaboratorSupabaseRepository',
  'ICollaboratorIndexedDbRepository',
  'CollaboratorRepositoryDeps',
];

function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (full.includes(`${path.sep}repositories${path.sep}collaborator`)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (/\.(js|jsx|ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe('collaboratorRepositoryPublicExport — Ticket 1.5', () => {
  it('exporta apenas facade, factory e erros públicos em runtime', () => {
    const runtimeKeys = Object.keys(collaboratorBarrel);
    expect(runtimeKeys.sort()).toEqual([...ALLOWED_RUNTIME_EXPORTS].sort());
    for (const key of runtimeKeys) {
      expect(ALLOWED_RUNTIME_EXPORTS.has(key)).toBe(true);
    }
  });

  it('não exporta implementação interna perigosa', () => {
    for (const forbidden of FORBIDDEN_BARREL_EXPORTS) {
      expect(collaboratorBarrel).not.toHaveProperty(forbidden);
    }
  });

  it('expõe facade singleton e factory segura', () => {
    expect(collaboratorBarrel.collaboratorRepository).toBeDefined();
    expect(typeof collaboratorBarrel.createCollaboratorRepository).toBe('function');
    const instance = collaboratorBarrel.createCollaboratorRepository();
    expect(instance).toBeDefined();
    expect(typeof instance.listCore).toBe('function');
  });

  it('index.ts documenta fase V3 e proibição de uso externo prematuro', () => {
    const content = readFileSync(INDEX_FILE, 'utf8');
    expect(content).toMatch(/Fase V3/i);
    expect(content).toMatch(/NÃO devem importar/i);
    expect(content).toMatch(/collaboratorService/i);
    expect(content).toMatch(/ticket explícito/i);
  });

  it('index.ts não re-exporta flags, mapper (runtime), cache nem sub-repositories', () => {
    const content = readFileSync(INDEX_FILE, 'utf8');
    expect(content).not.toMatch(/export\s+\{[^}]*\}\s+from\s+['"]\.\/collaboratorRepositoryFlags/);
    expect(content).not.toMatch(/export\s+\{[^}]*\}\s+from\s+['"]\.\/collaboratorSupabaseRepository/);
    expect(content).not.toMatch(/export\s+\{[^}]*\}\s+from\s+['"]\.\/collaboratorIndexedDbRepository/);
    expect(content).not.toMatch(/export\s+\{[^}]*\}\s+from\s+['"]\.\/collaboratorCache/);
    expect(content).not.toMatch(/export\s+\{[^}]*mapSupabaseRowToCore/);
    expect(content).toMatch(/export type \{ LegacyCollaboratorShape \} from '\.\/collaboratorMapper\.js'/);
  });

  it('nenhum arquivo fora do repository importa o barrel público', () => {
    const offenders = [];
    const allowed = new Set([
      'services/collaboratorServiceRepositoryBridge.js',
      'services/collaboratorServiceReadAdapter.js',
    ]);
    for (const file of collectSourceFiles(SRC_ROOT)) {
      const relative = path.relative(SRC_ROOT, file).replace(/\\/g, '/');
      if (allowed.has(relative)) continue;

      const content = readFileSync(file, 'utf8');
      if (
        /from ['"].*repositories\/collaborator['"]/.test(content)
        || /from ['"].*repositories\/collaborator\/index/.test(content)
      ) {
        offenders.push(relative);
      }
    }
    expect(offenders).toEqual([]);
  });
});
