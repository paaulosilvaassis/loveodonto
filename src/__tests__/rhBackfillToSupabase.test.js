import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  buildRhBackfillPlan,
  canApplyPlan,
  classifyCollaboratorRow,
  findDuplicateKeys,
  isBase64Photo,
  mapExportRowToCollaboratorPayload,
  normalizeEmail,
  shouldApplyCollaboratorRow,
  validateExportTenant,
} from '../../server/lib/rhBackfillToSupabase.js';

const TENANT = 'b2f95268-101c-42cb-8a8e-8d3681aa7dfa';

function sampleExport(overrides = {}) {
  return {
    id: 'col-abc123',
    tenant_id: TENANT,
    apelido: 'Ana',
    nomeCompleto: 'Ana Silva',
    rhCategoria: 'Corpo Clínico',
    cargo: 'Cirurgião-Dentista',
    tipoVinculo: 'CLT',
    setor: 'Clínico',
    email: 'ana@clinic.com',
    status: 'ativo',
    especialidades: ['Ortodontia'],
    updatedAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('rhBackfillToSupabase', () => {
  it('detecta foto base64', () => {
    expect(isBase64Photo('data:image/png;base64,abc')).toBe(true);
    expect(isBase64Photo('https://cdn.example/a.png')).toBe(false);
  });

  it('rejeita tenant_id divergente no export', () => {
    const result = validateExportTenant(
      [sampleExport({ tenant_id: 'outro-tenant' })],
      TENANT,
    );
    expect(result.ok).toBe(false);
  });

  it('detecta e-mail duplicado no export', () => {
    const { emailDups } = findDuplicateKeys([
      sampleExport({ id: 'col-a', email: 'dup@clinic.com' }),
      sampleExport({ id: 'col-b', email: 'dup@clinic.com' }),
    ]);
    expect(emailDups.length).toBe(1);
  });

  it('classifica INSERT_PROPOSED quando ausente no Supabase', () => {
    const row = classifyCollaboratorRow(sampleExport(), TENANT, []);
    expect(row.action).toBe(ACTIONS.INSERT_PROPOSED);
    expect(row.payload.legacy_id).toBe('col-abc123');
  });

  it('classifica SKIP_BASE64_PHOTO e não inclui data URI no payload', () => {
    const row = classifyCollaboratorRow(
      sampleExport({ fotoUrl: 'data:image/jpeg;base64,xxx' }),
      TENANT,
      [],
    );
    expect(row.action).toBe(ACTIONS.SKIP_BASE64_PHOTO);
    expect(row.payload.foto_url).toBeNull();
    expect(shouldApplyCollaboratorRow(row, [])).toBe(true);
  });

  it('classifica CONFLICT quando Supabase é mais recente', () => {
    const remote = {
      id: 'uuid-1',
      legacy_id: 'col-abc123',
      email: 'ana@clinic.com',
      apelido: 'Ana',
      nome_completo: 'Ana Silva',
      rh_categoria: 'Corpo Clínico',
      cargo: 'Cirurgião-Dentista',
      tipo_vinculo: 'CLT',
      setor: 'Clínico',
      status: 'ativo',
      especialidades: ['Ortodontia'],
      updated_at: '2026-06-29T10:00:00.000Z',
    };
    const row = classifyCollaboratorRow(sampleExport(), TENANT, [remote]);
    expect(row.action).toBe(ACTIONS.CONFLICT);
  });

  it('classifica LINK_PROPOSED por legacy_id pendente de insert', () => {
    const plan = buildRhBackfillPlan({
      tenantId: TENANT,
      exportRows: [sampleExport()],
      remoteCollaborators: [],
      tenantUsers: [{
        id: 'tu-1',
        email: 'ana@clinic.com',
        collaborator_id: 'col-abc123',
        collaborator_uuid: null,
      }],
    });
    expect(plan.link_rows[0].action).toBe(ACTIONS.LINK_PROPOSED);
    expect(plan.link_rows[0].pending_legacy_id).toBe('col-abc123');
  });

  it('bloqueia apply quando há duplicidade no export', () => {
    const plan = buildRhBackfillPlan({
      tenantId: TENANT,
      exportRows: [
        sampleExport({ id: 'col-a', email: 'dup@x.com' }),
        sampleExport({ id: 'col-b', email: 'dup@x.com' }),
      ],
      remoteCollaborators: [],
      tenantUsers: [],
    });
    const gate = canApplyPlan(plan);
    expect(gate.ok).toBe(false);
    expect(gate.blocking_actions.ERROR).toBeGreaterThan(0);
  });

  it('libera apply com NOT_FOUND em vínculos', () => {
    const plan = buildRhBackfillPlan({
      tenantId: TENANT,
      exportRows: [sampleExport()],
      remoteCollaborators: [],
      tenantUsers: [{
        id: 'tu-orphan',
        email: 'sem-match@clinic.com',
        collaborator_id: null,
        collaborator_uuid: null,
      }],
    });
    const gate = canApplyPlan(plan);
    expect(plan.link_summary.NOT_FOUND).toBe(1);
    expect(gate.ok).toBe(true);
  });

  it('mapExportRowToCollaboratorPayload normaliza e-mail', () => {
    const { payload } = mapExportRowToCollaboratorPayload(
      sampleExport({ email: '  Ana@Clinic.COM ' }),
      TENANT,
    );
    expect(payload.email).toBe(normalizeEmail('Ana@Clinic.COM'));
  });

  it('classifica LINK_PROPOSED por e-mail quando collaborator_id text diverge (Juliana)', () => {
    const exportLegacyId = 'col-f93e5dbf-juliana';
    const plan = buildRhBackfillPlan({
      tenantId: TENANT,
      exportRows: [sampleExport({
        id: exportLegacyId,
        email: 'drajuliana@implanprime.com.br',
        apelido: 'Juliana',
      })],
      remoteCollaborators: [],
      tenantUsers: [{
        id: 'tu-juliana',
        email: 'drajuliana@implanprime.com.br',
        collaborator_id: 'col-saas-c9a3cc7e-divergente',
        collaborator_uuid: null,
      }],
    });
    expect(plan.link_rows[0].action).toBe(ACTIONS.LINK_PROPOSED);
    expect(plan.link_rows[0].match_source).toBe('email_pending_insert');
    expect(plan.link_rows[0].pending_legacy_id).toBe(exportLegacyId);
    expect(plan.link_rows[0].collaborator_id_text).toBe('col-saas-c9a3cc7e-divergente');
  });

  it('classifica LINK_PROPOSED por e-mail quando collaborator_id text diverge (Renata)', () => {
    const exportLegacyId = 'col-6b85c4cb-renata';
    const plan = buildRhBackfillPlan({
      tenantId: TENANT,
      exportRows: [sampleExport({
        id: exportLegacyId,
        email: 'renataassis@implanprime.com.br',
        apelido: 'Renata',
      })],
      remoteCollaborators: [],
      tenantUsers: [{
        id: 'tu-renata',
        email: 'renataassis@implanprime.com.br',
        collaborator_id: 'col-c92cf731-divergente',
        collaborator_uuid: null,
      }],
    });
    expect(plan.link_rows[0].action).toBe(ACTIONS.LINK_PROPOSED);
    expect(plan.link_rows[0].match_source).toBe('email_pending_insert');
    expect(plan.link_rows[0].pending_legacy_id).toBe(exportLegacyId);
  });

  it('marca AMBIGUOUS quando e-mail duplicado no export', () => {
    const dupEmail = 'dup@implanprime.com.br';
    const plan = buildRhBackfillPlan({
      tenantId: TENANT,
      exportRows: [
        sampleExport({ id: 'col-a', email: dupEmail }),
        sampleExport({ id: 'col-b', email: dupEmail }),
      ],
      remoteCollaborators: [],
      tenantUsers: [{
        id: 'tu-dup',
        email: dupEmail,
        collaborator_id: 'col-saas-qualquer',
        collaborator_uuid: null,
      }],
    });
    expect(plan.link_rows[0].action).toBe(ACTIONS.AMBIGUOUS);
    expect(canApplyPlan(plan).ok).toBe(false);
  });

  it('mantém NOT_FOUND quando e-mail do tenant_user não existe no export', () => {
    const plan = buildRhBackfillPlan({
      tenantId: TENANT,
      exportRows: [sampleExport({ email: 'outro@clinic.com' })],
      remoteCollaborators: [],
      tenantUsers: [{
        id: 'tu-sem-match',
        email: 'inexistente@clinic.com',
        collaborator_id: 'col-saas-orphan',
        collaborator_uuid: null,
      }],
    });
    expect(plan.link_rows[0].action).toBe(ACTIONS.NOT_FOUND);
  });
});
