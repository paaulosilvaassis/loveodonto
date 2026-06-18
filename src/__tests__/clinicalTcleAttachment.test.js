import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';
import {
  resolveAttachedTcleIdsFromClinicalDocuments,
  mapDocumentTemplateToTcleId,
  mergeContractAttachedTcleIds,
} from '../services/clinicalTcleAttachmentService.js';
import { validateRequiredTcles } from '../contracts/contractTcleRegistry.js';
import { TREATMENT_TYPES } from '../contracts/contractConstants.js';

describe('clinicalTcleAttachmentService', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('mapeia template de implante para tcle_implante', () => {
    expect(mapDocumentTemplateToTcleId('consent_implante')).toBe('tcle_implante');
  });

  it('resolve TCLE a partir de documento salvo na aba Consentimentos', () => {
    withDb((db) => {
      db.documentRecords = [{
        id: 'doc-1',
        patientId: 'p1',
        appointmentId: 'apt-1',
        category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
        templateKey: 'consent_implante',
        title: 'Implante',
        content: 'termo',
        createdAt: new Date().toISOString(),
      }];
    });

    const ids = resolveAttachedTcleIdsFromClinicalDocuments({
      patientId: 'p1',
      appointmentId: 'apt-1',
    });
    expect(ids).toContain('tcle_implante');
  });

  it('validação de TCLE passa quando documento de implante foi salvo', () => {
    withDb((db) => {
      db.documentRecords = [{
        id: 'doc-1',
        patientId: 'p1',
        appointmentId: 'apt-1',
        category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
        templateKey: 'consent_implante',
        title: 'Implante',
        content: 'termo',
        createdAt: new Date().toISOString(),
      }];
    });

    const attached = resolveAttachedTcleIdsFromClinicalDocuments({ patientId: 'p1', appointmentId: 'apt-1' });
    const result = validateRequiredTcles(
      [TREATMENT_TYPES.PROTOCOLO_TOTAL],
      attached,
    );
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('mergeContractAttachedTcleIds une metadata existente com documentos clínicos', () => {
    withDb((db) => {
      db.documentRecords = [{
        id: 'doc-1',
        patientId: 'p1',
        appointmentId: 'apt-1',
        category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
        templateKey: 'consent_ortodontia',
        title: 'Ortodontia',
        content: 'termo',
        createdAt: new Date().toISOString(),
      }];
    });

    const merged = mergeContractAttachedTcleIds(
      { metadata: { attachedTcleIds: ['tcle_implante'] } },
      { patientId: 'p1', appointmentId: 'apt-1' },
    );
    expect(merged).toContain('tcle_implante');
    expect(merged).toContain('tcle_ortodontia');
  });
});
