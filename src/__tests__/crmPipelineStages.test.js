import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, loadDb, withDb } from '../db/index.js';
import {
  STAGE_TYPE,
  ensurePipelineStagesForTenant,
  listPipelineStagesForTenant,
  savePipelineStagesForTenant,
  deletePipelineStage,
  setPipelineStageActive,
} from '../services/crmPipelineStageService.js';
import {
  createLead,
  moveLeadToStage,
  convertLeadToPatient,
  listLeadEvents,
} from '../services/crmService.js';

const userA = { id: 'user-a', role: 'admin', tenant_id: 'tenant-a' };
const userB = { id: 'user-b', role: 'admin', tenant_id: 'tenant-b' };

const stagesAsInput = (stages) =>
  stages.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    isActive: s.isActive,
    stageType: s.stageType,
  }));

describe('Pipeline personalizável (fases por tenant)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [
        ...(db.tenants || []),
        { id: 'tenant-a', name: 'Clínica A', status: 'active' },
        { id: 'tenant-b', name: 'Clínica B', status: 'active' },
      ];
    });
  });

  it('adota fases legadas para o primeiro tenant e mantém keys dos leads', () => {
    const stages = ensurePipelineStagesForTenant(userA);
    expect(stages.length).toBeGreaterThan(0);
    expect(stages.every((s) => s.tenant_id === 'tenant-a')).toBe(true);
    expect(stages.some((s) => s.stageType === STAGE_TYPE.CONVERSION)).toBe(true);
    expect(stages.some((s) => s.stageType === STAGE_TYPE.LOST)).toBe(true);
    expect(stages.some((s) => s.key === 'novo_lead')).toBe(true);
  });

  it('cria fases padrão para um segundo tenant sem misturar pipelines (isolamento)', () => {
    ensurePipelineStagesForTenant(userA);
    const stagesB = ensurePipelineStagesForTenant(userB);
    expect(stagesB.every((s) => s.tenant_id === 'tenant-b')).toBe(true);

    const listA = listPipelineStagesForTenant('tenant-a', { includeInactive: true });
    const listB = listPipelineStagesForTenant('tenant-b', { includeInactive: true });
    const idsA = new Set(listA.map((s) => s.id));
    expect(listB.some((s) => idsA.has(s.id))).toBe(false);
  });

  it('cria, renomeia, recolore e reordena fases mantendo a key estável', () => {
    const stages = ensurePipelineStagesForTenant(userA);
    const input = stagesAsInput(stages);

    // renomeia e recolore a primeira fase
    const originalKey = stages[0].key;
    input[0] = { ...input[0], label: 'WhatsApp recebido', color: '#123456' };
    // nova fase no fim
    input.push({ id: null, label: 'Orçamento enviado', color: '#ff8800', isActive: true, stageType: STAGE_TYPE.NORMAL });
    // move a última criada para a segunda posição
    const created = input.pop();
    input.splice(1, 0, created);

    const saved = savePipelineStagesForTenant(userA, input);
    expect(saved[0].label).toBe('WhatsApp recebido');
    expect(saved[0].color).toBe('#123456');
    expect(saved[0].key).toBe(originalKey);
    expect(saved[1].label).toBe('Orçamento enviado');
    expect(saved[1].key).toBeTruthy();
    expect(saved.map((s) => s.order)).toEqual(saved.map((_, i) => i + 1));
  });

  it('valida regras mínimas: precisa de fase ativa, de conversão e de perda', () => {
    const stages = ensurePipelineStagesForTenant(userA);
    const semConversao = stagesAsInput(stages).map((s) => ({
      ...s,
      stageType: s.stageType === STAGE_TYPE.CONVERSION ? STAGE_TYPE.NORMAL : s.stageType,
    }));
    expect(() => savePipelineStagesForTenant(userA, semConversao)).toThrow(/conversão/i);

    const semPerda = stagesAsInput(stages).map((s) => ({
      ...s,
      stageType: s.stageType === STAGE_TYPE.LOST ? STAGE_TYPE.NORMAL : s.stageType,
    }));
    expect(() => savePipelineStagesForTenant(userA, semPerda)).toThrow(/perda/i);

    const todasInativas = stagesAsInput(stages).map((s) => ({ ...s, isActive: false }));
    expect(() => savePipelineStagesForTenant(userA, todasInativas)).toThrow(/ativa/i);
  });

  it('exclui fase vazia e bloqueia exclusão de fase com leads', () => {
    const stages = ensurePipelineStagesForTenant(userA);
    const emNegociacao = stages.find((s) => s.key === 'em_negociacao');
    createLead(userA, { name: 'Lead Teste', phone: '11999990000', stageKey: 'em_negociacao' });

    expect(() => deletePipelineStage(userA, emNegociacao.id)).toThrow(/possui leads/i);

    const vazia = stages.find((s) => s.key === 'contato_realizado');
    expect(deletePipelineStage(userA, vazia.id)).toBe(true);
    const remaining = listPipelineStagesForTenant('tenant-a', { includeInactive: true });
    expect(remaining.some((s) => s.id === vazia.id)).toBe(false);
  });

  it('ativa/desativa fase respeitando regras mínimas', () => {
    const stages = ensurePipelineStagesForTenant(userA);
    const normal = stages.find((s) => s.stageType === STAGE_TYPE.NORMAL);
    const toggled = setPipelineStageActive(userA, normal.id, false);
    expect(toggled.isActive).toBe(false);

    const lost = stages.find((s) => s.stageType === STAGE_TYPE.LOST);
    expect(() => setPipelineStageActive(userA, lost.id, false)).toThrow(/perda/i);
  });

  it('move lead entre fases com evento e grava motivo de perda', () => {
    ensurePipelineStagesForTenant(userA);
    const lead = createLead(userA, { name: 'Maria', phone: '11988887777' });

    moveLeadToStage(userA, lead.id, 'em_negociacao');
    const movedLead = loadDb().crmLeads.find((l) => l.id === lead.id);
    expect(movedLead.stageKey).toBe('em_negociacao');

    expect(() => moveLeadToStage(userA, lead.id, 'fase_inexistente')).toThrow(/não encontrada/i);

    moveLeadToStage(userA, lead.id, 'perdido', { lossReason: 'Fechou com outra clínica' });
    const lostLead = loadDb().crmLeads.find((l) => l.id === lead.id);
    expect(lostLead.stageKey).toBe('perdido');
    expect(lostLead.lossReason).toBe('Fechou com outra clínica');

    const events = listLeadEvents(lead.id).filter((e) => e.type === 'status_change');
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it('converte lead manualmente para a fase de conversão do tenant', () => {
    ensurePipelineStagesForTenant(userA);
    const lead = createLead(userA, { name: 'João', phone: '11977776666', estimatedValue: 1500 });
    expect(lead.estimatedValue).toBe(1500);

    convertLeadToPatient(userA, lead.id, 'patient-1');
    const converted = loadDb().crmLeads.find((l) => l.id === lead.id);
    expect(converted.patientId).toBe('patient-1');

    const conversionStage = listPipelineStagesForTenant('tenant-a').find(
      (s) => s.stageType === STAGE_TYPE.CONVERSION
    );
    expect(converted.stageKey).toBe(conversionStage.key);
  });
});
