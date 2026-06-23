import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, loadDb, withDb } from '../db/index.js';
import {
  ensureClinicalGuidesSeeded,
  getClinicalGuideBySlug,
  listClinicalGuides,
  matchGuidesForProcedures,
  createClinicalGuide,
  duplicateClinicalGuide,
} from '../services/clinicalGuide/clinicalGuideService.js';

const mockUser = { id: 'user-1', role: 'admin', tenantId: 'tenant-1' };

describe('clinicalGuideService', () => {
  beforeEach(async () => {
    await initDb();
    withDb((db) => {
      db.clinicalGuides = [];
      db.clinicalGuideImages = [];
      db.version = 53;
      return db;
    });
    ensureClinicalGuidesSeeded();
  });

  it('seeds guias padrão incluindo Protocolo Total', () => {
    const guides = listClinicalGuides(mockUser);
    expect(guides.length).toBeGreaterThanOrEqual(18);
    const protocolo = getClinicalGuideBySlug('protocolo-total', mockUser);
    expect(protocolo?.title).toBe('Protocolo Total');
    expect(protocolo?.treatmentSteps?.length).toBeGreaterThan(3);
    expect(protocolo?.coverImageUrl).toContain('images.unsplash.com');
    const db = loadDb();
    const protocoloImages = (db.clinicalGuideImages || []).filter((img) => img.guideId === protocolo.id);
    expect(protocoloImages.length).toBeGreaterThanOrEqual(6);
    expect(protocolo.beforeAfter?.before).toContain('images.unsplash.com');
  });

  it('sugere guia a partir do nome do procedimento no orçamento', () => {
    const matches = matchGuidesForProcedures(mockUser, ['Protocolo Total superior']);
    expect(matches.some((g) => g.slug === 'protocolo-total')).toBe(true);
  });

  it('permite criar e duplicar guia personalizado', () => {
    const source = getClinicalGuideBySlug('protocolo-total', mockUser);
    const copy = duplicateClinicalGuide(source.id, mockUser);
    expect(copy.isCustom).toBe(true);
    expect(copy.title).toContain('cópia');

    const custom = createClinicalGuide(mockUser, {
      title: 'Meu Tratamento',
      category: 'dentistica_estetica',
      patientDescription: 'Descrição educativa.',
    });
    expect(custom.slug).toContain('meu-tratamento');
    expect(loadDb().clinicalGuides.some((g) => g.id === custom.id)).toBe(true);
  });
});
