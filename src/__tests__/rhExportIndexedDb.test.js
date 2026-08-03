import { describe, expect, it } from 'vitest';
import {
  STORAGE_CONFIG,
  buildRhExportPayload,
  detectInputFormat,
  extractCollaboratorsFromInput,
  isBase64Photo,
  parseInputJson,
  sanitizeCollaboratorForExport,
} from '../../server/lib/rhExportIndexedDb.js';

const TENANT = 'b2f95268-101c-42cb-8a8e-8d3681aa7dfa';

function sampleRow(overrides = {}) {
  return {
    id: 'col-1',
    tenant_id: TENANT,
    apelido: 'Ana',
    nomeCompleto: 'Ana Silva',
    rhCategoria: 'Corpo Clínico',
    cargo: 'Dentista',
    email: 'ana@clinic.com',
    ...overrides,
  };
}

describe('rhExportIndexedDb', () => {
  it('detecta dump completo do app (localStorage legado)', () => {
    const fmt = detectInputFormat({ version: 50, collaborators: [], patients: [] });
    expect(fmt.format).toBe('full_app_db');
  });

  it('detecta dump do store IndexedDB', () => {
    const fmt = detectInputFormat([{ k: 'collaborators', v: [sampleRow()] }]);
    expect(fmt.format).toBe('indexeddb_store_dump');
    const { collaborators } = extractCollaboratorsFromInput([{ k: 'collaborators', v: [sampleRow()] }]);
    expect(collaborators).toHaveLength(1);
  });

  it('remove base64 de fotoUrl e marca has_base64_photo', () => {
    const item = sanitizeCollaboratorForExport(
      sampleRow({ fotoUrl: 'data:image/png;base64,abc' }),
      { tenantId: TENANT },
    );
    expect(item.fotoUrl).toBe('');
    expect(item.has_base64_photo).toBe(true);
    expect(isBase64Photo('data:image/jpeg;base64,x')).toBe(true);
  });

  it('filtra por tenant_id e rejeita sem tenant', () => {
    const { report } = buildRhExportPayload({
      rawCollaborators: [
        sampleRow(),
        sampleRow({ id: 'col-2', tenant_id: 'outro' }),
        sampleRow({ id: 'col-3', tenant_id: '' }),
      ],
      tenantId: TENANT,
      source: 'test',
      sourceFormat: 'test',
    });
    expect(report.summary.total_found).toBe(3);
    expect(report.summary.total_exported).toBe(1);
    expect(report.summary.total_ignored).toBe(2);
  });

  it('ignora e-mail duplicado no export', () => {
    const { report } = buildRhExportPayload({
      rawCollaborators: [
        sampleRow({ id: 'col-a', email: 'dup@x.com' }),
        sampleRow({ id: 'col-b', email: 'dup@x.com' }),
      ],
      tenantId: TENANT,
      source: 'test',
      sourceFormat: 'test',
    });
    expect(report.summary.total_exported).toBe(1);
    expect(report.summary.duplicate_emails).toBe(1);
  });

  it('parseInputJson lê export prior', () => {
    const json = JSON.stringify({
      tenant_id: TENANT,
      exported_at: new Date().toISOString(),
      collaborators: [sampleRow()],
    });
    const { collaborators, detection } = parseInputJson(json);
    expect(detection.format).toBe('collaborators_export');
    expect(collaborators).toHaveLength(1);
  });

  it('expõe referência correta do IndexedDB', () => {
    expect(STORAGE_CONFIG.idbDatabase).toBe('appgestaoodonto');
    expect(STORAGE_CONFIG.idbCollaboratorsKey).toBe('collaborators');
    expect(STORAGE_CONFIG.legacyLocalStorageKey).toBe('appgestaoodonto.db');
  });
});
