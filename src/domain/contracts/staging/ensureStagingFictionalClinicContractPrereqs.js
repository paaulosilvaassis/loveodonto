/**
 * PHASE_10.21AA — Seed fictício staging para pré-requisitos de contrato (fail-closed).
 * Só roda com STAGING_TEST_MODE. Não bypassa canGenerate — apenas completa dados
 * que a clínica/colaborador ainda não têm no IndexedDB limpo de staging.
 */
import { withDb, loadDb } from '../../../db/index.js';
import { createId } from '../../../services/helpers.js';
import { isStagingTestModeEnabled } from './staging-browser-test-mode.ts';
import { ensureStagingFictionalPriceBase } from './ensureStagingFictionalPriceBase.js';

const STAGING_CLINIC_ADDRESS_ID = 'clinic-addr-staging-1021aa';

/**
 * Completa endereço + responsável técnico da clínica e CRO de colaboradores sem registro.
 * Valores 100% fictícios / staging.
 */
export function ensureStagingFictionalClinicContractPrereqs() {
  if (!isStagingTestModeEnabled()) {
    return { seeded: false, reason: 'staging_test_mode_off' };
  }

  const changes = {
    clinicAddress: false,
    technicalResponsible: false,
    collaboratorCro: 0,
  };

  withDb((db) => {
    if (!Array.isArray(db.clinicAddresses)) db.clinicAddresses = [];
    const hasUsableAddress = db.clinicAddresses.some((a) => {
      const city = String(a?.cidade || a?.city || '').trim();
      const uf = String(a?.uf || a?.state || '').trim();
      const street = String(a?.logradouro || a?.street || '').trim();
      return city && uf && street;
    });
    if (!hasUsableAddress) {
      db.clinicAddresses = db.clinicAddresses.map((a) => ({ ...a, principal: false }));
      db.clinicAddresses.push({
        id: STAGING_CLINIC_ADDRESS_ID,
        principal: true,
        logradouro: 'Rua Fictícia Staging',
        numero: '100',
        complemento: 'Sala Smoke',
        bairro: 'Centro',
        cidade: 'São Paulo',
        uf: 'SP',
        cep: '01001-000',
        createdAt: new Date().toISOString(),
      });
      changes.clinicAddress = true;
    }

    if (!db.clinicDocumentation || typeof db.clinicDocumentation !== 'object') {
      db.clinicDocumentation = {};
    }
    const doc = db.clinicDocumentation;
    const techName = String(doc.responsavelTecnico || doc.responsavel_tecnico || '').trim();
    const techCro = String(
      doc.croResponsavelTecnico || doc.cro_responsavel || doc.conselhoRegionalNumero || '',
    ).trim();
    if (!techName || !techCro) {
      db.clinicDocumentation = {
        ...doc,
        responsavelTecnico: techName || 'Dr. Responsável Técnico Staging',
        croResponsavelTecnico: techCro || 'CRO-SP 99999',
        conselhoRegionalNumero: doc.conselhoRegionalNumero || techCro || 'CRO-SP 99999',
      };
      changes.technicalResponsible = true;
    }

    if (!Array.isArray(db.collaborators)) db.collaborators = [];
    db.collaborators = db.collaborators.map((c) => {
      const cro = String(c.cro || c.conselhoNumero || c.registroProfissional || '').trim();
      if (cro) return c;
      changes.collaboratorCro += 1;
      return {
        ...c,
        cro: 'CRO-SP 88888',
        conselhoNumero: c.conselhoNumero || '88888',
        conselho: c.conselho || 'CRO',
        conselhoUf: c.conselhoUf || 'SP',
      };
    });

    return db;
  });

  const after = loadDb();
  return {
    seeded: changes.clinicAddress || changes.technicalResponsible || changes.collaboratorCro > 0,
    reason: 'ok',
    changes,
    clinicAddresses: (after.clinicAddresses || []).length,
  };
}

/** Boot staging: price base + clinic contract prereqs. */
export function ensureStagingFictionalCommercialBootstrap() {
  if (!isStagingTestModeEnabled()) {
    return { seeded: false, reason: 'staging_test_mode_off' };
  }
  const price = ensureStagingFictionalPriceBase();
  const clinic = ensureStagingFictionalClinicContractPrereqs();
  return {
    seeded: Boolean(price.seeded || clinic.seeded),
    price,
    clinic,
    seedId: createId('stg-boot'),
  };
}
