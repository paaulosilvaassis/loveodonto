import { migrateLegacyCollaboratorRow } from '../constants/collaboratorRhCatalog.js';
import { DB_VERSION, defaultDbState } from './schema.js';
import { buildPermissionsCatalog, permissionId } from '../permissions/catalog.js';
import { ROLE_DEFAULT_PERMISSIONS, ROLES_FOR_SEED } from '../permissions/roleDefaults.js';
import { seedDefaultContractsForDb } from '../contracts/defaultContractSeed.js';

const migrations = {
  1: (db) => ({
    ...defaultDbState(),
    ...db,
    version: 1,
  }),
  2: (db) => {
    const base = defaultDbState();
    return {
      ...base,
      ...db,
      clinicProfile: { ...base.clinicProfile, ...(db.clinicProfile || {}) },
      clinicDocumentation: { ...base.clinicDocumentation, ...(db.clinicDocumentation || {}) },
      clinicPhones: db.clinicPhones || [],
      clinicAddresses: db.clinicAddresses || [],
      clinicBusinessHours: db.clinicBusinessHours || [],
      clinicFiles: db.clinicFiles || [],
      clinicMailServers: db.clinicMailServers || [],
      clinicCorrespondence: { ...base.clinicCorrespondence, ...(db.clinicCorrespondence || {}) },
      clinicAdditional: { ...base.clinicAdditional, ...(db.clinicAdditional || {}) },
      clinicNfse: { ...base.clinicNfse, ...(db.clinicNfse || {}) },
      clinicIntegrations: { ...base.clinicIntegrations, ...(db.clinicIntegrations || {}) },
      clinicWebPresence: { ...base.clinicWebPresence, ...(db.clinicWebPresence || {}) },
      clinicLicense: { ...base.clinicLicense, ...(db.clinicLicense || {}) },
      version: 2,
    };
  },
  3: (db) => {
    const base = defaultDbState();
    return {
      ...base,
      ...db,
      clinicProfile: { ...base.clinicProfile, ...(db.clinicProfile || {}) },
      clinicDocumentation: { ...base.clinicDocumentation, ...(db.clinicDocumentation || {}) },
      clinicPhones: db.clinicPhones || [],
      clinicAddresses: db.clinicAddresses || [],
      clinicBusinessHours: db.clinicBusinessHours || [],
      clinicFiles: db.clinicFiles || [],
      clinicMailServers: db.clinicMailServers || [],
      clinicCorrespondence: { ...base.clinicCorrespondence, ...(db.clinicCorrespondence || {}) },
      clinicAdditional: { ...base.clinicAdditional, ...(db.clinicAdditional || {}) },
      clinicNfse: { ...base.clinicNfse, ...(db.clinicNfse || {}) },
      clinicIntegrations: { ...base.clinicIntegrations, ...(db.clinicIntegrations || {}) },
      clinicWebPresence: { ...base.clinicWebPresence, ...(db.clinicWebPresence || {}) },
      clinicLicense: { ...base.clinicLicense, ...(db.clinicLicense || {}) },
      collaborators: db.collaborators || [],
      collaboratorDocuments: db.collaboratorDocuments || [],
      collaboratorEducation: db.collaboratorEducation || [],
      collaboratorNationality: db.collaboratorNationality || [],
      collaboratorPhones: db.collaboratorPhones || [],
      collaboratorAddresses: db.collaboratorAddresses || [],
      collaboratorRelationships: db.collaboratorRelationships || [],
      collaboratorCharacteristics: db.collaboratorCharacteristics || [],
      collaboratorAdditional: db.collaboratorAdditional || [],
      collaboratorInsurances: db.collaboratorInsurances || [],
      collaboratorAccess: db.collaboratorAccess || [],
      collaboratorWorkHours: db.collaboratorWorkHours || [],
      collaboratorFinance: db.collaboratorFinance || [],
      version: 3,
    };
  },
  4: (db) => {
    const base = defaultDbState();
    const onlyDigits = (value) => (value || '').replace(/\D/g, '');
    const normalizePatient = (patient, index) => {
      const createdAt = patient.created_at || patient.createdAt || new Date().toISOString();
      const updatedAt = patient.updated_at || patient.updatedAt || createdAt;
      return {
        id: patient.id || `patient-${crypto.randomUUID()}`,
        guid: patient.guid || crypto.randomUUID(),
        full_name: patient.full_name || patient.name || '',
        nickname: patient.nickname || patient.apelido || '',
        social_name: patient.social_name || patient.nomeSocial || '',
        sex: patient.sex || patient.sexo || '',
        birth_date: patient.birth_date || patient.birthDate || '',
        cpf: patient.cpf || '',
        photo_url: patient.photo_url || patient.fotoUrl || '',
        status: patient.status || 'active',
        blocked: Boolean(patient.blocked),
        block_reason: patient.block_reason || '',
        block_at: patient.block_at || '',
        tags: patient.tags || [],
        lead_source: patient.lead_source || '',
        created_at: createdAt,
        updated_at: updatedAt,
        created_by_user_id: patient.created_by_user_id || '',
        updated_by_user_id: patient.updated_by_user_id || '',
        legacy_email: patient.email || '',
        legacy_phone: patient.phone || '',
        legacy_address: patient.address || '',
        legacy_notes: patient.notes || '',
        legacyIndex: index,
      };
    };

    const mappedPatients = (db.patients || []).map(normalizePatient);
    const patientIds = new Set(mappedPatients.map((item) => item.id));

    const patientRecords = db.patientRecords || [];
    const nextRecordNumber = () => {
      const max = patientRecords.reduce((acc, item) => {
        const value = Number(String(item.record_number || '').replace(/\D/g, '')) || 0;
        return Math.max(acc, value);
      }, 0);
      return String(max + 1).padStart(8, '0');
    };

    const ensureRecord = (patientId) => {
      if (patientRecords.some((item) => item.patient_id === patientId)) return;
      patientRecords.push({
        patient_id: patientId,
        record_number: nextRecordNumber(),
        label_number: '',
        preferred_dentist_id: '',
        internal_or_company: 'INTERNAL',
        company_partner_id: '',
        insurance_id: '',
        insurance_extra_data: '',
      });
    };

    const patientDocuments = db.patientDocuments || [];
    const patientBirth = db.patientBirth || [];
    const patientEducation = db.patientEducation || [];
    const patientPhones = db.patientPhones || [];
    const patientAddresses = db.patientAddresses || [];
    const patientRelationships = db.patientRelationships || [];
    const patientInsurances = db.patientInsurances || [];
    const patientAccess = db.patientAccess || [];
    const patientActivitySummary = db.patientActivitySummary || [];
    const patientSensitive = db.patientSensitive || [];

    mappedPatients.forEach((patient) => {
      ensureRecord(patient.id);
      if (!patientDocuments.some((item) => item.patient_id === patient.id)) {
        patientDocuments.push({
          patient_id: patient.id,
          rg: '',
          pis: '',
          municipal_registration: '',
          personal_email: patient.legacy_email || '',
          marital_status: '',
          responsible_name: '',
          responsible_relation: '',
          responsible_phone: '',
          mother_name: '',
          father_name: '',
        });
      }
      if (!patientBirth.some((item) => item.patient_id === patient.id)) {
        patientBirth.push({ patient_id: patient.id, nationality: '', birth_city: '', birth_state: '' });
      }
      if (!patientEducation.some((item) => item.patient_id === patient.id)) {
        patientEducation.push({ patient_id: patient.id, education_level: '', profession: '', other_profession: '' });
      }
      if (!patientRelationships.some((item) => item.patient_id === patient.id)) {
        patientRelationships.push({
          patient_id: patient.id,
          emergency_contact_name: '',
          emergency_contact_phone: '',
          dependents: [],
          notes: patient.legacy_notes || '',
          marital_status: '',
          preferred_contact_period: '',
          preferred_contact_channel: '',
          lgpd_whatsapp_opt_in: false,
        });
      }
      if (!patientActivitySummary.some((item) => item.patient_id === patient.id)) {
        patientActivitySummary.push({
          patient_id: patient.id,
          total_appointments: 0,
          last_appointment_at: '',
          total_procedures: 0,
          last_procedure_at: '',
        });
      }
      if (!patientSensitive.some((item) => item.patient_id === patient.id)) {
        patientSensitive.push({
          patient_id: patient.id,
          clinical_notes: '',
          allergies: '',
          conditions: '',
          last_access_at: '',
          last_access_by: '',
        });
      }
      if (patient.legacy_phone && !patientPhones.some((item) => item.patient_id === patient.id)) {
        const digits = onlyDigits(patient.legacy_phone);
        const ddd = digits.slice(0, 2);
        const number = digits.slice(2);
        patientPhones.push({
          id: `phone-${crypto.randomUUID()}`,
          patient_id: patient.id,
          type: 'celular',
          country_code: '55',
          ddd,
          number,
          is_whatsapp: true,
          is_primary: true,
          e164: digits ? `+55${digits}` : '',
        });
      }
      if (patient.legacy_address && !patientAddresses.some((item) => item.patient_id === patient.id)) {
        patientAddresses.push({
          id: `addr-${crypto.randomUUID()}`,
          patient_id: patient.id,
          type: 'residencial',
          cep: '',
          street: patient.legacy_address,
          number: '',
          complement: '',
          neighborhood: '',
          city: '',
          state: '',
          is_primary: true,
        });
      }
    });

    const cleanPatients = mappedPatients.map(({ legacyIndex, legacy_email, legacy_phone, legacy_address, legacy_notes, ...rest }) => {
      void legacyIndex;
      void legacy_email;
      void legacy_phone;
      void legacy_address;
      void legacy_notes;
      return rest;
    });
    const filtered = (arr, key) => arr.filter((item) => patientIds.has(item[key]));

    return {
      ...base,
      ...db,
      clinicProfile: { ...base.clinicProfile, ...(db.clinicProfile || {}) },
      clinicDocumentation: { ...base.clinicDocumentation, ...(db.clinicDocumentation || {}) },
      clinicPhones: db.clinicPhones || [],
      clinicAddresses: db.clinicAddresses || [],
      clinicBusinessHours: db.clinicBusinessHours || [],
      clinicFiles: db.clinicFiles || [],
      clinicMailServers: db.clinicMailServers || [],
      clinicCorrespondence: { ...base.clinicCorrespondence, ...(db.clinicCorrespondence || {}) },
      clinicAdditional: { ...base.clinicAdditional, ...(db.clinicAdditional || {}) },
      clinicNfse: { ...base.clinicNfse, ...(db.clinicNfse || {}) },
      clinicIntegrations: { ...base.clinicIntegrations, ...(db.clinicIntegrations || {}) },
      clinicWebPresence: { ...base.clinicWebPresence, ...(db.clinicWebPresence || {}) },
      clinicLicense: { ...base.clinicLicense, ...(db.clinicLicense || {}) },
      collaborators: db.collaborators || [],
      collaboratorDocuments: db.collaboratorDocuments || [],
      collaboratorEducation: db.collaboratorEducation || [],
      collaboratorNationality: db.collaboratorNationality || [],
      collaboratorPhones: db.collaboratorPhones || [],
      collaboratorAddresses: db.collaboratorAddresses || [],
      collaboratorRelationships: db.collaboratorRelationships || [],
      collaboratorCharacteristics: db.collaboratorCharacteristics || [],
      collaboratorAdditional: db.collaboratorAdditional || [],
      collaboratorInsurances: db.collaboratorInsurances || [],
      collaboratorAccess: db.collaboratorAccess || [],
      collaboratorWorkHours: db.collaboratorWorkHours || [],
      collaboratorFinance: db.collaboratorFinance || [],
      patients: cleanPatients,
      patientRecords: filtered(patientRecords, 'patient_id'),
      patientDocuments: filtered(patientDocuments, 'patient_id'),
      patientBirth: filtered(patientBirth, 'patient_id'),
      patientEducation: filtered(patientEducation, 'patient_id'),
      patientPhones: filtered(patientPhones, 'patient_id'),
      patientAddresses: filtered(patientAddresses, 'patient_id'),
      patientRelationships: filtered(patientRelationships, 'patient_id'),
      patientInsurances: filtered(patientInsurances, 'patient_id'),
      patientAccess: filtered(patientAccess, 'patient_id'),
      patientActivitySummary: filtered(patientActivitySummary, 'patient_id'),
      patientSensitive: filtered(patientSensitive, 'patient_id'),
      version: 4,
    };
  },
  5: (db) => {
    const base = defaultDbState();
    const patients = db.patients || [];
    const ensureItems = (list, patientId, factory) => {
      if (list.some((item) => item.patient_id === patientId)) return;
      list.push(factory(patientId));
    };
    const defaultClinicalItems = () => [
      { id: 'vicios', label: 'Vícios', answer: 'nao_respondido', details: '' },
      { id: 'medicamentos', label: 'Uso de Medicamentos', answer: 'nao_respondido', details: '' },
      { id: 'cicatrizacao', label: 'Cicatrização', answer: 'nao_respondido', details: '' },
      { id: 'anestesia', label: 'Reação a Anestesia', answer: 'nao_respondido', details: '' },
      { id: 'antibiotico', label: 'Reação a Antibiótico', answer: 'nao_respondido', details: '' },
      { id: 'alergias', label: 'Alergias', answer: 'nao_respondido', details: '' },
      { id: 'reacao_medicamentos', label: 'Reação a Medicamentos', answer: 'nao_respondido', details: '' },
      { id: 'diabetes', label: 'Diabetes', answer: 'nao_respondido', details: '' },
      { id: 'hepatite', label: 'Hepatite', answer: 'nao_respondido', details: '' },
      { id: 'doenca_familiar', label: 'Doença Familiar', answer: 'nao_respondido', details: '' },
      { id: 'doencas_infecciosas', label: 'Doenças Infecciosas', answer: 'nao_respondido', details: '' },
      { id: 'asma_bronquite', label: 'Asma ou Bronquite', answer: 'nao_respondido', details: '' },
      { id: 'pressao_alta', label: 'Pressão Alta', answer: 'nao_respondido', details: '' },
      { id: 'cardiopatia', label: 'Cardiopatia', answer: 'nao_respondido', details: '' },
      { id: 'deficiencia_imune', label: 'Deficiência Imunológica', answer: 'nao_respondido', details: '' },
      { id: 'hemorragia', label: 'Hemorragia', answer: 'nao_respondido', details: '' },
      { id: 'ulcera', label: 'Úlcera', answer: 'nao_respondido', details: '' },
      { id: 'epilepsia', label: 'Epilepsia', answer: 'nao_respondido', details: '' },
      { id: 'tumor_neoplasia', label: 'Tumor/Neoplasia', answer: 'nao_respondido', details: '' },
      { id: 'febre_reumatica', label: 'Febre Reumática', answer: 'nao_respondido', details: '' },
      { id: 'sinusite', label: 'Sinusite', answer: 'nao_respondido', details: '' },
      { id: 'anemia', label: 'Anemia', answer: 'nao_respondido', details: '' },
      { id: 'herpes', label: 'Herpes', answer: 'nao_respondido', details: '' },
      { id: 'enxaqueca', label: 'Enxaqueca (com frequência/mês)', answer: 'nao_respondido', details: '' },
      { id: 'glaucoma', label: 'Glaucoma', answer: 'nao_respondido', details: '' },
    ];
    const defaultAtmItems = () => [
      { id: 'bruxismo', label: 'Bruxismo', answer: 'nao_respondido', details: '' },
      { id: 'dor_muscular', label: 'Dor Muscular', answer: 'nao_respondido', details: '' },
      { id: 'dor_atms', label: 'Dor ATMS', answer: 'nao_respondido', details: '' },
      { id: 'barulho_atms', label: 'Barulho nas ATMS', answer: 'nao_respondido', details: '' },
      { id: 'deslizes_rc_mih', label: 'Deslizes de RC para MIH', answer: 'nao_respondido', details: '' },
      { id: 'desvio_abertura', label: 'Desvio Durante a Abertura', answer: 'nao_respondido', details: '' },
    ];
    const patientCharts = db.patientCharts || [];
    const patientCharacteristics = db.patientCharacteristics || [];
    const patientAnamneseClinical = db.patientAnamneseClinical || [];
    const patientAnamneseAtm = db.patientAnamneseAtm || [];
    const patientOdontograms = db.patientOdontograms || [];
    const patientFiles = db.patientFiles || [];
    const patientConfidentialFiles = db.patientConfidentialFiles || [];
    const patientPhotoAlbums = db.patientPhotoAlbums || [];
    const patientPhotos = db.patientPhotos || [];

    patients.forEach((patient) => {
      const patientId = patient.id;
      if (!patientCharts.some((item) => item.patient_id === patientId)) {
        patientCharts.push({
          id: `chart-${crypto.randomUUID()}`,
          patient_id: patientId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      ensureItems(patientCharacteristics, patientId, (id) => ({
        patient_id: id,
        blood_type: '',
        skin_color: '',
        hair_color: '',
        eye_color: '',
        face_shape: '',
      }));
      ensureItems(patientAnamneseClinical, patientId, (id) => ({
        patient_id: id,
        items: defaultClinicalItems(),
      }));
      ensureItems(patientAnamneseAtm, patientId, (id) => ({
        patient_id: id,
        items: defaultAtmItems(),
      }));
      ensureItems(patientOdontograms, patientId, (id) => ({
        patient_id: id,
        teeth: {},
        history: [],
      }));
    });

    return {
      ...base,
      ...db,
      clinicProfile: { ...base.clinicProfile, ...(db.clinicProfile || {}) },
      clinicDocumentation: { ...base.clinicDocumentation, ...(db.clinicDocumentation || {}) },
      clinicPhones: db.clinicPhones || [],
      clinicAddresses: db.clinicAddresses || [],
      clinicBusinessHours: db.clinicBusinessHours || [],
      clinicFiles: db.clinicFiles || [],
      clinicMailServers: db.clinicMailServers || [],
      clinicCorrespondence: { ...base.clinicCorrespondence, ...(db.clinicCorrespondence || {}) },
      clinicAdditional: { ...base.clinicAdditional, ...(db.clinicAdditional || {}) },
      clinicNfse: { ...base.clinicNfse, ...(db.clinicNfse || {}) },
      clinicIntegrations: { ...base.clinicIntegrations, ...(db.clinicIntegrations || {}) },
      clinicWebPresence: { ...base.clinicWebPresence, ...(db.clinicWebPresence || {}) },
      clinicLicense: { ...base.clinicLicense, ...(db.clinicLicense || {}) },
      collaborators: db.collaborators || [],
      collaboratorDocuments: db.collaboratorDocuments || [],
      collaboratorEducation: db.collaboratorEducation || [],
      collaboratorNationality: db.collaboratorNationality || [],
      collaboratorPhones: db.collaboratorPhones || [],
      collaboratorAddresses: db.collaboratorAddresses || [],
      collaboratorRelationships: db.collaboratorRelationships || [],
      collaboratorCharacteristics: db.collaboratorCharacteristics || [],
      collaboratorAdditional: db.collaboratorAdditional || [],
      collaboratorInsurances: db.collaboratorInsurances || [],
      collaboratorAccess: db.collaboratorAccess || [],
      collaboratorWorkHours: db.collaboratorWorkHours || [],
      collaboratorFinance: db.collaboratorFinance || [],
      patients: db.patients || [],
      patientRecords: db.patientRecords || [],
      patientDocuments: db.patientDocuments || [],
      patientBirth: db.patientBirth || [],
      patientEducation: db.patientEducation || [],
      patientPhones: db.patientPhones || [],
      patientAddresses: db.patientAddresses || [],
      patientRelationships: db.patientRelationships || [],
      patientInsurances: db.patientInsurances || [],
      patientAccess: db.patientAccess || [],
      patientActivitySummary: db.patientActivitySummary || [],
      patientSensitive: db.patientSensitive || [],
      patientCharts,
      patientCharacteristics,
      patientAnamneseClinical,
      patientAnamneseAtm,
      patientOdontograms,
      patientFiles,
      patientConfidentialFiles,
      patientPhotoAlbums,
      patientPhotos,
      version: 5,
    };
  },
  6: (db) => {
    const base = defaultDbState();
    const {
      patientCharts,
      patientCharacteristics,
      patientAnamneseClinical,
      patientAnamneseAtm,
      patientOdontograms,
      patientFiles,
      patientConfidentialFiles,
      patientPhotoAlbums,
      patientPhotos,
      patientRecords,
      patientSensitive,
      records,
      version,
      ...rest
    } = db || {};
    void patientCharts;
    void patientCharacteristics;
    void patientAnamneseClinical;
    void patientAnamneseAtm;
    void patientOdontograms;
    void patientFiles;
    void patientConfidentialFiles;
    void patientPhotoAlbums;
    void patientPhotos;
    void patientRecords;
    void patientSensitive;
    void records;
    void version;
    return {
      ...base,
      ...rest,
      version: 6,
    };
  },
  7: (db) => {
    const base = defaultDbState();
    const {
      patientOdontograms,
      patientOdontogramHistory,
      version,
      ...rest
    } = db || {};
    void version;
    return {
      ...base,
      ...rest,
      patientOdontograms: Array.isArray(patientOdontograms) ? patientOdontograms : [],
      patientOdontogramHistory: Array.isArray(patientOdontogramHistory) ? patientOdontogramHistory : [],
      version: 7,
    };
  },
  8: (db) => {
    const base = defaultDbState();
    const {
      patientCharts,
      patientCharacteristics,
      patientAnamnesisClinical,
      patientAnamnesisAtm,
      patientOdontograms,
      patientOdontogramHistory,
      patientFiles,
      patientConfidentialFiles,
      patientPhotoAlbums,
      patientAlbumPhotos,
      accessAuditLogs,
      patientOdontogramsV2,
      version,
      ...rest
    } = db || {};
    void version;
    return {
      ...base,
      ...rest,
      patientCharts: Array.isArray(patientCharts) ? patientCharts : [],
      patientCharacteristics: Array.isArray(patientCharacteristics) ? patientCharacteristics : [],
      patientAnamnesisClinical: Array.isArray(patientAnamnesisClinical) ? patientAnamnesisClinical : [],
      patientAnamnesisAtm: Array.isArray(patientAnamnesisAtm) ? patientAnamnesisAtm : [],
      patientOdontograms: Array.isArray(patientOdontograms) ? patientOdontograms : [],
      patientOdontogramHistory: Array.isArray(patientOdontogramHistory) ? patientOdontogramHistory : [],
      patientFiles: Array.isArray(patientFiles) ? patientFiles : [],
      patientConfidentialFiles: Array.isArray(patientConfidentialFiles) ? patientConfidentialFiles : [],
      patientPhotoAlbums: Array.isArray(patientPhotoAlbums) ? patientPhotoAlbums : [],
      patientAlbumPhotos: Array.isArray(patientAlbumPhotos) ? patientAlbumPhotos : [],
      accessAuditLogs: Array.isArray(accessAuditLogs) ? accessAuditLogs : [],
      patientOdontogramsV2: Array.isArray(patientOdontogramsV2) ? patientOdontogramsV2 : [],
      version: 8,
    };
  },
  9: (db) => {
    const base = defaultDbState();
    const {
      patientOdontogramsV2,
      version,
      ...rest
    } = db || {};
    void version;
    return {
      ...base,
      ...rest,
      patientOdontogramsV2: Array.isArray(patientOdontogramsV2) ? patientOdontogramsV2 : [],
      version: 9,
    };
  },
  10: (db) => {
    const base = defaultDbState();
    const {
      patientRecords,
      version,
      ...rest
    } = db || {};
    void version;
    return {
      ...base,
      ...rest,
      patientRecords: Array.isArray(patientRecords) ? patientRecords : [],
      version: 10,
    };
  },
  11: (db) => {
    const base = defaultDbState();
    const {
      appointments,
      version,
      ...rest
    } = db || {};
    void version;
    // Migrar appointments para incluir novos campos do workflow
    let migratedAppointments = [];
    try {
      migratedAppointments = Array.isArray(appointments)
        ? appointments.map((apt) => {
            return {
              ...apt,
              checkInAt: apt.checkInAt || null,
              calledAt: apt.calledAt || null,
              startedAt: apt.startedAt || null,
              finishedAt: apt.finishedAt || null,
              consultorioId: apt.consultorioId || apt.roomId || null,
              dentistId: apt.dentistId || apt.professionalId || null,
              workflowNotes: apt.workflowNotes || null,
              delayReason: apt.delayReason || null,
              checkInPreviousStatus: apt.checkInPreviousStatus || null,
              // Corrigir inconsistências: se tem checkInAt mas status não é EM_ESPERA/EM_ATENDIMENTO/FINALIZADO
              status:
                apt.checkInAt && !['em_espera', 'em_atendimento', 'finalizado', 'chamado'].includes(apt.status)
                  ? 'em_espera'
                  : apt.status || 'agendado',
            };
          })
        : [];
    } catch (err) {
      throw err;
    }
    const result = {
      ...base,
      ...rest,
      appointments: migratedAppointments,
      version: 11,
    };
    return result;
  },
  12: (db) => {
    if (!db || typeof db !== 'object') {
      return defaultDbState();
    }
    return {
      ...db,
      clinicalAppointments: Array.isArray(db.clinicalAppointments) ? db.clinicalAppointments : [],
      clinicalEvents: Array.isArray(db.clinicalEvents) ? db.clinicalEvents : [],
      version: 12,
    };
  },
  13: (db) => {
    if (!db || typeof db !== 'object') {
      return defaultDbState();
    }
    return {
      ...db,
      priceTables: Array.isArray(db.priceTables) ? db.priceTables : [],
      procedureCatalog: Array.isArray(db.procedureCatalog) ? db.procedureCatalog : [],
      procedurePriceOverrides: Array.isArray(db.procedurePriceOverrides) ? db.procedurePriceOverrides : [],
      version: 13,
    };
  },
  14: (db) => {
    if (!db || typeof db !== 'object') {
      return defaultDbState();
    }
    // Migração: converter procedureCatalog + procedurePriceOverrides para priceTableProcedures
    const priceTableProcedures = [];
    const oldCatalog = Array.isArray(db.procedureCatalog) ? db.procedureCatalog : [];
    const oldOverrides = Array.isArray(db.procedurePriceOverrides) ? db.procedurePriceOverrides : [];
    const priceTables = Array.isArray(db.priceTables) ? db.priceTables : [];
    
    // Se não há tabelas, criar uma padrão
    let defaultTableId = null;
    if (priceTables.length === 0) {
      defaultTableId = 'pricetable-default-1';
      priceTables.push({
        id: defaultTableId,
        name: 'Tabela Padrão',
        type: null,
        isDefault: true,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      const defaultTable = priceTables.find(t => t.isDefault) || priceTables[0];
      defaultTableId = defaultTable.id;
    }
    
    // Migrar procedimentos do catálogo para a tabela padrão
    oldCatalog.forEach((proc) => {
      // Buscar override se existir
      const override = oldOverrides.find(o => o.procedureId === proc.id);
      
      priceTableProcedures.push({
        id: proc.id,
        priceTableId: override?.priceTableId || defaultTableId,
        title: proc.title,
        status: proc.status || 'ATIVO',
        segment: proc.segment || 'ODONTOLOGIA',
        specialty: proc.specialty,
        tussCode: proc.tussCode || null,
        internalCode: proc.internalCode || null,
        shortcut: proc.shortcut || null,
        costPrice: proc.costPrice || null,
        price: override?.overridePrice || proc.defaultPrice,
        minPrice: proc.minPrice || null,
        maxPrice: proc.maxPrice || null,
        priceRestriction: proc.priceRestriction || 'LIVRE',
        commissionType: proc.commissionType || 'NENHUMA',
        commissionValue: proc.commissionValue || null,
        notes: proc.notes || null,
        createdAt: proc.createdAt || new Date().toISOString(),
        updatedAt: proc.updatedAt || new Date().toISOString(),
        createdByUserId: proc.createdByUserId || null,
        updatedByUserId: proc.updatedByUserId || null,
      });
    });
    
    return {
      ...db,
      priceTables,
      priceTableProcedures,
      version: 14,
    };
  },
  15: (db) => {
    if (!db || typeof db !== 'object') {
      return defaultDbState();
    }
    return {
      ...db,
      patientJourneyEntries: Array.isArray(db.patientJourneyEntries) ? db.patientJourneyEntries : [],
      version: 15,
    };
  },
  16: (db) => {
    if (!db || typeof db !== 'object') {
      return defaultDbState();
    }
    const defaultPipelineStages = [
      { id: 'crm-stage-1', key: 'novo_lead', label: 'Novo Lead', order: 1, color: '#94a3b8' },
      { id: 'crm-stage-2', key: 'contato_realizado', label: 'Contato Realizado', order: 2, color: '#60a5fa' },
      { id: 'crm-stage-3', key: 'avaliacao_agendada', label: 'Avaliação Agendada', order: 3, color: '#a78bfa' },
      { id: 'crm-stage-4', key: 'avaliacao_realizada', label: 'Avaliação Realizada', order: 4, color: '#c084fc' },
      { id: 'crm-stage-5', key: 'orcamento_apresentado', label: 'Orçamento Apresentado', order: 5, color: '#f59e0b' },
      { id: 'crm-stage-6', key: 'em_negociacao', label: 'Em Negociação', order: 6, color: '#fbbf24' },
      { id: 'crm-stage-7', key: 'aprovado', label: 'Aprovado', order: 7, color: '#34d399' },
      { id: 'crm-stage-8', key: 'em_tratamento', label: 'Em Tratamento', order: 8, color: '#22c55e' },
      { id: 'crm-stage-9', key: 'finalizado', label: 'Finalizado', order: 9, color: '#10b981' },
      { id: 'crm-stage-10', key: 'perdido', label: 'Perdido', order: 10, color: '#ef4444' },
    ];
    return {
      ...db,
      crmLeads: Array.isArray(db.crmLeads) ? db.crmLeads : [],
      crmPipelineStages: Array.isArray(db.crmPipelineStages) && db.crmPipelineStages.length > 0
        ? db.crmPipelineStages
        : defaultPipelineStages,
      crmLeadEvents: Array.isArray(db.crmLeadEvents) ? db.crmLeadEvents : [],
      crmFollowUps: Array.isArray(db.crmFollowUps) ? db.crmFollowUps : [],
      crmAutomations: Array.isArray(db.crmAutomations) ? db.crmAutomations : [],
      version: 16,
    };
  },
  17: (db) => {
    if (!db || typeof db !== 'object') {
      return defaultDbState();
    }
    const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const next = {
      ...db,
      crmMessageLogs: Array.isArray(db.crmMessageLogs) ? db.crmMessageLogs : [],
      crmBudgetLinks: Array.isArray(db.crmBudgetLinks) ? db.crmBudgetLinks : [],
      version: 17,
    };
    if (Array.isArray(next.crmLeads) && next.crmLeads.length === 0 && Array.isArray(next.crmPipelineStages) && next.crmPipelineStages.length > 0) {
      const now = new Date().toISOString();
      next.crmLeads = [
        { id: createId('crmlead'), name: 'Maria Silva', phone: '11999990001', source: 'whatsapp', interest: 'implante', notes: 'Lead seed', assignedToUserId: null, stageKey: 'novo_lead', patientId: null, tags: ['Quente'], lastContactAt: null, createdAt: now, updatedAt: now, createdByUserId: null },
        { id: createId('crmlead'), name: 'João Santos', phone: '11999990002', source: 'site', interest: 'estetica', notes: 'Lead seed', assignedToUserId: null, stageKey: 'contato_realizado', patientId: null, tags: [], lastContactAt: now, createdAt: now, updatedAt: now, createdByUserId: null },
        { id: createId('crmlead'), name: 'Ana Costa', phone: '11999990003', source: 'indicacao', interest: 'ortodontia', notes: 'Lead seed', assignedToUserId: null, stageKey: 'avaliacao_agendada', patientId: null, tags: ['Alto Ticket'], lastContactAt: null, createdAt: now, updatedAt: now, createdByUserId: null },
      ];
      next.crmLeadEvents = next.crmLeadEvents || [];
      next.crmLeadEvents.push({ id: createId('crmev'), leadId: next.crmLeads[0].id, type: 'status_change', userId: null, data: { fromStage: null, toStage: 'novo_lead', description: 'Lead criado' }, createdAt: now });
    }
    return next;
  },
  18: (db) => {
    if (!db || typeof db !== 'object') {
      return defaultDbState();
    }
    const base = defaultDbState();
    return {
      ...base,
      ...db,
      clinicProfile: { ...base.clinicProfile, ...(db.clinicProfile || {}) },
      clinicDocumentation: { ...base.clinicDocumentation, ...(db.clinicDocumentation || {}) },
      clinicAdditional: { ...base.clinicAdditional, ...(db.clinicAdditional || {}) },
      clinicPricing: { ...base.clinicPricing, ...(db.clinicPricing || {}) },
      version: 18,
    };
  },
  19: (db) => {
    if (!db || typeof db !== 'object') {
      return defaultDbState();
    }
    const base = defaultDbState();
    const prevPricing = db.clinicPricing || {};
    const prevTaxConfig = prevPricing.taxConfig || {};
    const prevRates = prevTaxConfig.rates || {};
    const migratedTax = db.clinicTax
      ? { ...base.clinicTax, ...db.clinicTax }
      : {
          ...base.clinicTax,
          regime: prevTaxConfig.regime || base.clinicTax.regime,
          uf: prevTaxConfig.state || base.clinicTax.uf,
          iss: prevTaxConfig.customISS ?? base.clinicTax.iss,
          baseTributavel: base.clinicTax.baseTributavel,
          simplesAnexo: prevRates.anexo || base.clinicTax.simplesAnexo,
          simplesFaixa: prevRates.faixaSelecionada ?? base.clinicTax.simplesFaixa,
          aliquotaNominal: prevRates.totalRate ?? base.clinicTax.aliquotaNominal,
          fatorR: base.clinicTax.fatorR,
          deducaoPermitida: base.clinicTax.deducaoPermitida,
          tipoCalculo: prevTaxConfig.calculationMethod || base.clinicTax.tipoCalculo,
        };
    const { taxConfig: _removed, ...pricingWithoutTax } = prevPricing;
    return {
      ...base,
      ...db,
      clinicTax: migratedTax,
      clinicPricing: { ...base.clinicPricing, ...pricingWithoutTax },
      version: 19,
    };
  },
  20: (db) => {
    if (!db || typeof db !== 'object') return defaultDbState();
    return {
      ...db,
      followUps: Array.isArray(db.followUps) ? db.followUps : [],
      version: 20,
    };
  },
  21: (db) => {
    if (!db || typeof db !== 'object') return defaultDbState();
    const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const clinicId = db.clinicProfile?.id || 'clinic-1';
    const now = new Date().toISOString();
    const crmTags = getSeedCrmTags(createId, clinicId, now);
    return {
      ...db,
      crmTags: Array.isArray(db.crmTags) && db.crmTags.length > 0 ? db.crmTags : crmTags,
      leadTags: Array.isArray(db.leadTags) ? db.leadTags : [],
      version: 21,
    };
  },
  22: (db) => {
    if (!db || typeof db !== 'object') return defaultDbState();
    return {
      ...db,
      crmTasks: Array.isArray(db.crmTasks) ? db.crmTasks : [],
      version: 22,
    };
  },
  23: (db) => {
    if (!db || typeof db !== 'object') return defaultDbState();
    return {
      ...db,
      crmBudgets: Array.isArray(db.crmBudgets) ? db.crmBudgets : [],
      version: 23,
    };
  },
  24: (db) => {
    if (!db || typeof db !== 'object') return defaultDbState();
    const users = Array.isArray(db.users) ? db.users.map((u) => ({
      ...u,
      has_system_access: u.has_system_access !== false,
    })) : [];
    const permissionsCatalog = buildPermissionsCatalog();
    const rolePermissions = [];
    for (const role of ROLES_FOR_SEED) {
      const permIds = ROLE_DEFAULT_PERMISSIONS[role] || [];
      for (const permission_id of permIds) {
        rolePermissions.push({ role, permission_id });
      }
    }
    const userPermissions = Array.isArray(db.userPermissions) ? db.userPermissions : [];
    const accessAuditLogs = Array.isArray(db.accessAuditLogs) ? db.accessAuditLogs : [];
    return {
      ...db,
      users,
      permissionsCatalog,
      rolePermissions,
      userPermissions,
      accessAuditLogs,
      version: 24,
    };
  },
  25: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 25 };
    const now = new Date().toISOString();
    let tenants = Array.isArray(db.tenants) ? db.tenants : [];
    let users_profile = Array.isArray(db.users_profile) ? db.users_profile : [];
    let memberships = Array.isArray(db.memberships) ? db.memberships : [];
    const invitations = Array.isArray(db.invitations) ? db.invitations : [];

    if (tenants.length === 0 && db.clinicProfile) {
      const clinic = db.clinicProfile;
      tenants = [
        {
          id: 'tenant-1',
          name: (clinic.nomeClinica || clinic.nomeFantasia || 'Minha Clínica').trim() || 'Minha Clínica',
          logo_url: clinic.logoUrl || null,
          created_at: now,
          updated_at: now,
        },
      ];
    }

    const defaultTenantId = tenants[0]?.id || 'tenant-1';
    const existingUserIds = new Set(users_profile.map((p) => p.id));

    if (Array.isArray(db.users)) {
      for (const u of db.users) {
        if (!u.id) continue;
        if (!existingUserIds.has(u.id)) {
          users_profile.push({
            id: u.id,
            full_name: (u.name || '').trim() || 'Usuário',
            email: (u.email || '').trim(),
            phone: (u.phone || '').trim(),
            created_at: now,
            updated_at: now,
          });
          existingUserIds.add(u.id);
        }
      }
    }

    const membershipByKey = new Set(memberships.map((m) => `${m.tenant_id}:${m.user_id}`));
    if (Array.isArray(db.users) && defaultTenantId) {
      for (const u of db.users) {
        if (!u.id) continue;
        const key = `${defaultTenantId}:${u.id}`;
        if (membershipByKey.has(key)) continue;
        const role = u.role === 'admin' ? 'master' : (u.role || 'atendimento');
        memberships.push({
          id: `memb-${crypto.randomUUID()}`,
          tenant_id: defaultTenantId,
          user_id: u.id,
          role,
          has_system_access: u.has_system_access !== false,
          status: 'active',
          created_at: now,
          updated_at: now,
        });
        membershipByKey.add(key);
      }
    }

    return {
      ...db,
      tenants,
      users_profile,
      memberships,
      invitations,
      version: 25,
    };
  },
  26: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 26 };
    const now = new Date().toISOString();
    let tenants = Array.isArray(db.tenants) ? db.tenants : [];
    if (tenants.length === 0 && db.clinicProfile) {
      tenants = [{
        id: 'tenant-1',
        name: (db.clinicProfile.nomeClinica || db.clinicProfile.nomeFantasia || 'Minha Clínica').trim() || 'Minha Clínica',
        logo_url: db.clinicProfile.logoUrl || null,
        status: 'active',
        plan_id: null,
        created_at: now,
        updated_at: now,
      }];
    }
    const plans = Array.isArray(db.plans) ? db.plans : [];
    const subscriptions = Array.isArray(db.subscriptions) ? db.subscriptions : [];
    const invoices = Array.isArray(db.invoices) ? db.invoices : [];
    const payments = Array.isArray(db.payments) ? db.payments : [];
    const usage_events = Array.isArray(db.usage_events) ? db.usage_events : [];

    tenants = tenants.map((t) => ({
      ...t,
      status: t.status || 'active',
      plan_id: t.plan_id || null,
    }));

    let plansOut = plans;
    if (plansOut.length === 0) {
      plansOut = [
        { id: 'plan-free', name: 'Gratuito', price: 0, interval: 'month', limits_json: { users: 2, patients: 100 }, features_json: [], is_active: true, created_at: now },
        { id: 'plan-pro', name: 'Pro', price: 19900, interval: 'month', limits_json: { users: 10, patients: 1000 }, features_json: ['crm', 'agenda', 'financeiro'], is_active: true, created_at: now },
        { id: 'plan-enterprise', name: 'Enterprise', price: 49900, interval: 'month', limits_json: { users: -1, patients: -1 }, features_json: ['*'], is_active: true, created_at: now },
      ];
    }

    return {
      ...db,
      tenants,
      plans: plansOut,
      subscriptions,
      invoices,
      payments,
      usage_events,
      version: 26,
    };
  },
  27: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 27 };
    return {
      ...db,
      userAuth: Array.isArray(db.userAuth) ? db.userAuth : [],
      version: 27,
    };
  },
  28: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 28 };
    return {
      ...db,
      userInvites: Array.isArray(db.userInvites) ? db.userInvites : [],
      version: 28,
    };
  },
  29: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 29 };
    return {
      ...db,
      adminSecurity: Array.isArray(db.adminSecurity) ? db.adminSecurity : [],
      adminGateSessions: Array.isArray(db.adminGateSessions) ? db.adminGateSessions : [],
      version: 29,
    };
  },
  30: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 30 };
    return {
      ...db,
      supportTickets: Array.isArray(db.supportTickets) ? db.supportTickets : [],
      version: 30,
    };
  },
  31: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 31 };
    return {
      ...db,
      transactions: Array.isArray(db.transactions) ? db.transactions : [],
      installmentPlans: Array.isArray(db.installmentPlans) ? db.installmentPlans : [],
      cashRegisters: Array.isArray(db.cashRegisters) ? db.cashRegisters : [],
      supportTickets: Array.isArray(db.supportTickets) ? db.supportTickets : [],
      version: 31,
    };
  },
  32: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 32 };
    const now = new Date().toISOString();
    let expenseCategories = Array.isArray(db.expenseCategories) ? db.expenseCategories : [];
    if (expenseCategories.length === 0) {
      expenseCategories = DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({
        id: `exp-cat-${i + 1}`,
        name,
        status: 'active',
        created_at: now,
        updated_at: now,
      }));
    }
    return {
      ...db,
      expenseCategories,
      expenseSuppliers: Array.isArray(db.expenseSuppliers) ? db.expenseSuppliers : [],
      payables: Array.isArray(db.payables) ? db.payables : [],
      cashTransactions: Array.isArray(db.cashTransactions) ? db.cashTransactions : [],
      version: 32,
    };
  },
  33: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 33 };
    const payables = Array.isArray(db.payables) ? db.payables : [];
    const migrated = payables.map((p) => {
      if (p.expenseType) return p;
      const expenseType = p.expenseType || (p.isRecurring || p.parentId ? 'fixed' : 'variable');
      return { ...p, expenseType };
    });
    return {
      ...db,
      payables: migrated,
      version: 33,
    };
  },
  34: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 34 };
    return {
      ...db,
      accountsReceivable: Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [],
      receivablePayments: Array.isArray(db.receivablePayments) ? db.receivablePayments : [],
      receivableCharges: Array.isArray(db.receivableCharges) ? db.receivableCharges : [],
      version: 34,
    };
  },
  35: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 35 };
    return {
      ...db,
      financings: Array.isArray(db.financings) ? db.financings : [],
      financingInstallments: Array.isArray(db.financingInstallments) ? db.financingInstallments : [],
      boletoCharges: Array.isArray(db.boletoCharges) ? db.boletoCharges : [],
      financingEvents: Array.isArray(db.financingEvents) ? db.financingEvents : [],
      boletoReminderEvents: Array.isArray(db.boletoReminderEvents) ? db.boletoReminderEvents : [],
      financingRenegotiations: Array.isArray(db.financingRenegotiations) ? db.financingRenegotiations : [],
      version: 35,
    };
  },
  36: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 36 };
    const now = new Date().toISOString();
    const financings = (Array.isArray(db.financings) ? db.financings : []).map((item) => ({
      ...item,
      status: item.status || 'draft',
      approval_status: item.approval_status || 'pending',
      credit_analysis_status: item.credit_analysis_status || 'not_required',
      updated_at: item.updated_at || item.created_at || now,
    }));
    const financingInstallments = (Array.isArray(db.financingInstallments) ? db.financingInstallments : []).map((item) => {
      const net = Number(item.net_amount ?? item.original_amount ?? 0);
      const paid = Number(item.paid_amount || 0);
      return {
        ...item,
        status: item.status || 'pending',
        net_amount: net,
        paid_amount: paid,
        remaining_amount: item.remaining_amount !== undefined ? Number(item.remaining_amount || 0) : Math.max(net - paid, 0),
        updated_at: item.updated_at || item.created_at || now,
      };
    });
    const boletoCharges = (Array.isArray(db.boletoCharges) ? db.boletoCharges : []).map((item) => ({
      ...item,
      status: item.status || 'draft',
      updated_at: item.updated_at || item.created_at || now,
    }));
    const financingEvents = (Array.isArray(db.financingEvents) ? db.financingEvents : []).map((item) => ({
      ...item,
      financing_id: item.financing_id || null,
      installment_id: item.installment_id || null,
      receivable_id: item.receivable_id || null,
      boleto_charge_id: item.boleto_charge_id || null,
      event_type: item.event_type || 'financing_event',
      created_at: item.created_at || now,
    }));
    return {
      ...db,
      financings,
      financingInstallments,
      boletoCharges,
      financingEvents,
      financingPaymentAllocations: Array.isArray(db.financingPaymentAllocations) ? db.financingPaymentAllocations : [],
      boletoChargeStatusHistory: Array.isArray(db.boletoChargeStatusHistory) ? db.boletoChargeStatusHistory : [],
      version: 36,
    };
  },
  /**
   * Remove colaboradores placeholder criados pelo botão "Novo Colaborador" (fluxo antigo:
   * create imediato com apelido/nome "Novo colaborador" e cargo Recepção), sem e-mail nem registro.
   */
  37: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 37 };
    const collaborators = Array.isArray(db.collaborators) ? db.collaborators : [];
    const toRemove = new Set();
    collaborators.forEach((c) => {
      if (!c || typeof c !== 'object') return;
      const ap = String(c.apelido || '').trim();
      const nc = String(c.nomeCompleto || '').trim();
      const cargo = String(c.cargo || '').trim();
      if (ap !== 'Novo colaborador' || nc !== 'Novo colaborador' || cargo !== 'Recepção') return;
      if (String(c.email || '').trim()) return;
      if (String(c.registroProfissional || '').trim()) return;
      toRemove.add(c.id);
    });
    if (toRemove.size === 0) {
      return { ...db, version: 37 };
    }
    const keepCollab = (id) => !toRemove.has(id);
    const filterByCollab = (arr) => (Array.isArray(arr) ? arr : []).filter((item) => item && !toRemove.has(item.collaboratorId));
    return {
      ...db,
      collaborators: collaborators.filter((c) => keepCollab(c.id)),
      collaboratorDocuments: filterByCollab(db.collaboratorDocuments),
      collaboratorEducation: filterByCollab(db.collaboratorEducation),
      collaboratorNationality: filterByCollab(db.collaboratorNationality),
      collaboratorPhones: filterByCollab(db.collaboratorPhones),
      collaboratorAddresses: filterByCollab(db.collaboratorAddresses),
      collaboratorRelationships: filterByCollab(db.collaboratorRelationships),
      collaboratorCharacteristics: filterByCollab(db.collaboratorCharacteristics),
      collaboratorAdditional: filterByCollab(db.collaboratorAdditional),
      collaboratorInsurances: filterByCollab(db.collaboratorInsurances),
      collaboratorAccess: filterByCollab(db.collaboratorAccess),
      collaboratorWorkHours: filterByCollab(db.collaboratorWorkHours),
      collaboratorFinance: filterByCollab(db.collaboratorFinance),
      version: 37,
    };
  },
  38: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 38 };
    const collaborators = (Array.isArray(db.collaborators) ? db.collaborators : []).map((row) =>
      migrateLegacyCollaboratorRow(row)
    );
    return {
      ...db,
      collaborators,
      version: 38,
    };
  },
  39: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 39 };
    const now = new Date().toISOString();
    const commissionRules = (Array.isArray(db.commissionRules) ? db.commissionRules : []).map((r, index) => ({
      id: r.id || `comrule-${crypto.randomUUID()}`,
      name: String(r.name || `Regra ${index + 1}`),
      type: r.type || 'production',
      percentage: Number(r.percentage || 0),
      fixed_amount: Number(r.fixed_amount || 0),
      apply_on: r.apply_on || 'total_value',
      professional_id: r.professional_id || null,
      role: r.role || 'dentista',
      specialty: r.specialty || null,
      procedure_id: r.procedure_id || null,
      lead_source: r.lead_source != null && r.lead_source !== '' ? r.lead_source : null,
      active: r.active !== false,
      priority: Number(r.priority || 100),
      created_at: r.created_at || now,
      updated_at: r.updated_at || r.created_at || now,
      metadata: r.metadata && typeof r.metadata === 'object' ? r.metadata : {},
    }));
    const commissions = (Array.isArray(db.commissions) ? db.commissions : []).map((c) => ({
      ...c,
      id: c.id || `comm-${crypto.randomUUID()}`,
      professional_id: c.professional_id || null,
      role: c.role || 'dentista',
      source_type: c.source_type || 'receivable',
      source_id: c.source_id || '',
      amount_base: Number(c.amount_base || 0),
      commission_amount: Number(c.commission_amount || 0),
      rule_id: c.rule_id || null,
      status: c.status || 'pending',
      reference_date: c.reference_date || now.slice(0, 10),
      payment_date: c.payment_date || null,
      metadata: c.metadata && typeof c.metadata === 'object' ? c.metadata : {},
      created_at: c.created_at || now,
      updated_at: c.updated_at || c.created_at || now,
    }));
    return {
      ...db,
      commissionRules,
      commissions,
      version: 39,
    };
  },
  40: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 40 };
    const commissionRules = (Array.isArray(db.commissionRules) ? db.commissionRules : []).map((r) => ({
      ...r,
      lead_source: r.lead_source != null && r.lead_source !== '' ? String(r.lead_source) : null,
    }));
    return {
      ...db,
      commissionRules,
      version: 40,
    };
  },
  41: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 41 };
    const commissionRules = (Array.isArray(db.commissionRules) ? db.commissionRules : []).map((r) => {
      const type = r.type === 'patient_conversion' ? 'patient_closing' : r.type;
      return { ...r, type };
    });
    const commissions = (Array.isArray(db.commissions) ? db.commissions : []).map((c) => {
      const meta = c.metadata && typeof c.metadata === 'object' ? { ...c.metadata } : {};
      if (meta.commission_basis === 'patient_conversion') {
        meta.commission_basis = 'patient_closing';
      }
      return { ...c, metadata: meta };
    });
    return {
      ...db,
      commissionRules,
      commissions,
      version: 41,
    };
  },
  42: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 42 };
    return {
      ...db,
      marketingChatAccounts: Array.isArray(db.marketingChatAccounts) ? db.marketingChatAccounts : [],
      marketingChatChannels: Array.isArray(db.marketingChatChannels) ? db.marketingChatChannels : [],
      marketingChatContacts: Array.isArray(db.marketingChatContacts) ? db.marketingChatContacts : [],
      marketingChatConversations: Array.isArray(db.marketingChatConversations) ? db.marketingChatConversations : [],
      marketingChatMessages: Array.isArray(db.marketingChatMessages) ? db.marketingChatMessages : [],
      marketingChatAssignments: Array.isArray(db.marketingChatAssignments) ? db.marketingChatAssignments : [],
      marketingChatNotes: Array.isArray(db.marketingChatNotes) ? db.marketingChatNotes : [],
      marketingChatTags: Array.isArray(db.marketingChatTags) ? db.marketingChatTags : [],
      marketingChatCampaigns: Array.isArray(db.marketingChatCampaigns) ? db.marketingChatCampaigns : [],
      marketingChatAutomations: Array.isArray(db.marketingChatAutomations) ? db.marketingChatAutomations : [],
      marketingChatFunnels: Array.isArray(db.marketingChatFunnels) ? db.marketingChatFunnels : [],
      marketingChatSettings: db.marketingChatSettings && typeof db.marketingChatSettings === 'object' ? db.marketingChatSettings : {},
      marketingChatWebhookLogs: Array.isArray(db.marketingChatWebhookLogs) ? db.marketingChatWebhookLogs : [],
      marketingChatMetricsSnapshots: Array.isArray(db.marketingChatMetricsSnapshots) ? db.marketingChatMetricsSnapshots : [],
      version: 42,
    };
  },
  43: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 43 };
    return {
      ...db,
      marketingChatDepartments: Array.isArray(db.marketingChatDepartments) ? db.marketingChatDepartments : [],
      marketingChatAttendants: Array.isArray(db.marketingChatAttendants) ? db.marketingChatAttendants : [],
      marketingChatApiConfig: db.marketingChatApiConfig && typeof db.marketingChatApiConfig === 'object' ? db.marketingChatApiConfig : {},
      version: 43,
    };
  },
  44: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 44 };
    return {
      ...db,
      marketingAutomationEvents: Array.isArray(db.marketingAutomationEvents) ? db.marketingAutomationEvents : [],
      marketingAutomationRuns: Array.isArray(db.marketingAutomationRuns) ? db.marketingAutomationRuns : [],
      marketingAutomationRunSteps: Array.isArray(db.marketingAutomationRunSteps) ? db.marketingAutomationRunSteps : [],
      marketingScheduledJobs: Array.isArray(db.marketingScheduledJobs) ? db.marketingScheduledJobs : [],
      marketingJobAttempts: Array.isArray(db.marketingJobAttempts) ? db.marketingJobAttempts : [],
      marketingAutomationMetricsDaily: Array.isArray(db.marketingAutomationMetricsDaily) ? db.marketingAutomationMetricsDaily : [],
      version: 44,
    };
  },
  45: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 45 };
    return {
      ...db,
      tenantModules: Array.isArray(db.tenantModules) ? db.tenantModules : [],
      featureFlags: Array.isArray(db.featureFlags) ? db.featureFlags : [],
      tenantLimits: Array.isArray(db.tenantLimits) ? db.tenantLimits : [],
      version: 45,
    };
  },
  46: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 46 };
    const usersProfile = Array.isArray(db.users_profile) ? db.users_profile : [];
    const memberships = Array.isArray(db.memberships) ? db.memberships : [];
    const nextProfiles = usersProfile.map((profile) => {
      const existingTenant = String(profile?.tenant_id || '').trim();
      if (existingTenant) return profile;
      const membership = memberships.find((m) => m.user_id === profile.id && m.status === 'active');
      return {
        ...profile,
        tenant_id: membership?.tenant_id || null,
      };
    });
    return {
      ...db,
      users_profile: nextProfiles,
      tenantModules: Array.isArray(db.tenantModules) ? db.tenantModules : [],
      featureFlags: Array.isArray(db.featureFlags) ? db.featureFlags : [],
      tenantLimits: Array.isArray(db.tenantLimits) ? db.tenantLimits : [],
      version: 46,
    };
  },
  47: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 47 };
    const patients = Array.isArray(db.patients)
      ? db.patients.map((p) => ({
          ...p,
          has_financial_responsible: Boolean(p.has_financial_responsible),
          dependent_full_name: String(p.dependent_full_name || '').trim(),
        }))
      : [];
    const next = {
      ...db,
      patients,
      contractTemplates: Array.isArray(db.contractTemplates) ? db.contractTemplates : [],
      contractBlocks: Array.isArray(db.contractBlocks) ? db.contractBlocks : [],
      generatedContracts: Array.isArray(db.generatedContracts) ? db.generatedContracts : [],
      contractAuditLogs: Array.isArray(db.contractAuditLogs) ? db.contractAuditLogs : [],
      contractSeqByClinic:
        db.contractSeqByClinic && typeof db.contractSeqByClinic === 'object' ? db.contractSeqByClinic : {},
      permissionsCatalog: buildPermissionsCatalog(),
      version: 47,
    };
    seedDefaultContractsForDb(next);
    const catalog = buildPermissionsCatalog();
    const adminContractPermIds = catalog.filter((c) => c.module_key === 'admin_contratos').map((c) => c.id);
    const generateId = permissionId('admin_contratos', 'generate');
    const merged = Array.isArray(next.rolePermissions) ? [...next.rolePermissions] : [];
    const rpSet = new Set(merged.map((r) => `${r.role}|${r.permission_id}`));
    const pushIf = (role, pid) => {
      const key = `${role}|${pid}`;
      if (!rpSet.has(key)) {
        merged.push({ role, permission_id: pid });
        rpSet.add(key);
      }
    };
    for (const pid of adminContractPermIds) {
      pushIf('administrativo', pid);
      pushIf('gerente', pid);
    }
    pushIf('comercial', generateId);
    next.rolePermissions = merged;
    return next;
  },
  /**
   * 48: Pipeline personalizável por tenant.
   * Enriquece crmPipelineStages com isActive, stageType ('normal'|'conversion'|'lost') e tenant_id.
   * Estágios legados sem tenant_id permanecem null (são adotados pelo tenant no primeiro acesso ao Pipeline).
   */
  48: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 48 };
    const inferStageType = (key) => {
      if (key === 'aprovado') return 'conversion';
      if (key === 'perdido') return 'lost';
      return 'normal';
    };
    const stages = (Array.isArray(db.crmPipelineStages) ? db.crmPipelineStages : []).map((s) => ({
      ...s,
      isActive: s.isActive !== false,
      stageType: ['normal', 'conversion', 'lost'].includes(s.stageType) ? s.stageType : inferStageType(s.key),
      tenant_id: s.tenant_id ?? null,
    }));
    return {
      ...db,
      crmPipelineStages: stages,
      version: 48,
    };
  },
  /**
   * 49: Configurações administrativas CRM por tenant.
   * Inicializa stores vazios; seeds ocorrem no primeiro acesso via ensureCrmSettingsForTenant.
   */
  49: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 49 };
    const ensureArray = (key) => (Array.isArray(db[key]) ? db[key] : []);
    const automations = ensureArray('crmAutomations').map((a) => ({
      ...a,
      tenant_id: a.tenant_id ?? null,
    }));
    return {
      ...db,
      crmLeadSources: ensureArray('crmLeadSources'),
      crmLeadInterests: ensureArray('crmLeadInterests'),
      crmCommercialTeam: ensureArray('crmCommercialTeam'),
      crmCommercialGoals: ensureArray('crmCommercialGoals'),
      crmFollowUpSettings: ensureArray('crmFollowUpSettings'),
      crmLossReasons: ensureArray('crmLossReasons'),
      crmWhatsAppSettings: ensureArray('crmWhatsAppSettings'),
      crmConversionSettings: ensureArray('crmConversionSettings'),
      crmAutomations: automations,
      version: 49,
    };
  },
  /**
   * 50: Módulo Convênios — operadoras, planos, guias TISS, glosas, faturamento.
   */
  50: (db) => {
    if (!db || typeof db !== 'object') return { ...db, version: 50 };
    const ensureArray = (key) => (Array.isArray(db[key]) ? db[key] : []);
    const patientInsurances = ensureArray('patientInsurances').map((row) => ({
      ...row,
      tenant_id: row.tenant_id ?? null,
      provider_id: row.provider_id ?? null,
      plan_id: row.plan_id ?? null,
      holder_cpf: row.holder_cpf ?? null,
      status: row.status ?? 'ativo',
    }));
    return {
      ...db,
      patientInsurances,
      insuranceProviders: ensureArray('insuranceProviders'),
      insurancePlans: ensureArray('insurancePlans'),
      insuranceAuthorizations: ensureArray('insuranceAuthorizations'),
      insuranceGuides: ensureArray('insuranceGuides'),
      insuranceGlosas: ensureArray('insuranceGlosas'),
      insuranceBillingBatches: ensureArray('insuranceBillingBatches'),
      insuranceReceipts: ensureArray('insuranceReceipts'),
      version: 50,
    };
  },
};

/** Categorias padrão para Contas a Pagar (usado em migration 32 e applyPostMigrationFixes) */
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Aluguel', 'Energia', 'Internet', 'Sistema', 'Marketing', 'Material odontológico',
  'Laboratório', 'Salários', 'Comissões', 'Manutenção', 'Impostos', 'Limpeza',
  'Equipamentos', 'Administrativo', 'Outros',
];

const SEED_TAGS_DATA = [
  { category: 'Origem', name: 'Instagram Orgânico', color: '#E1306C' },
  { category: 'Origem', name: 'Instagram Ads', color: '#C13584' },
  { category: 'Origem', name: 'Facebook Ads', color: '#1877F2' },
  { category: 'Origem', name: 'Google Ads', color: '#4285F4' },
  { category: 'Origem', name: 'Indicação', color: '#10B981' },
  { category: 'Origem', name: 'Site', color: '#6366F1' },
  { category: 'Interesse', name: 'Implante', color: '#8B5CF6' },
  { category: 'Interesse', name: 'Lente', color: '#A78BFA' },
  { category: 'Interesse', name: 'Ortodontia', color: '#06B6D4' },
  { category: 'Interesse', name: 'Clareamento', color: '#FBBF24' },
  { category: 'Interesse', name: 'Prótese', color: '#F59E0B' },
  { category: 'Temperatura', name: 'Quente', color: '#EF4444' },
  { category: 'Temperatura', name: 'Morno', color: '#F97316' },
  { category: 'Temperatura', name: 'Frio', color: '#3B82F6' },
  { category: 'Temperatura', name: 'Inativo', color: '#94A3B8' },
  { category: 'Financeiro', name: 'À vista', color: '#22C55E' },
  { category: 'Financeiro', name: 'Parcelado', color: '#14B8A6' },
  { category: 'Financeiro', name: 'Convênio', color: '#6366F1' },
  { category: 'Urgência', name: 'Dor', color: '#DC2626' },
  { category: 'Urgência', name: 'Estético urgente', color: '#EA580C' },
  { category: 'Urgência', name: 'Emergência', color: '#B91C1C' },
];

export function getSeedCrmTags(createId, clinicId, now) {
  return SEED_TAGS_DATA.map((t) => ({
    id: createId('crtag'),
    clinicId,
    name: t.name,
    category: t.category,
    color: t.color,
    createdAt: now,
  }));
}

export const migrateDb = (db) => {
  if (!db || typeof db !== 'object') {
    return defaultDbState();
  }

  const targetVersion = Number(DB_VERSION || 0);
  const startVersionRaw = Number(db.version || 0);
  const startVersion = Number.isFinite(startVersionRaw) && startVersionRaw > 0 ? startVersionRaw : 0;
  let current = { ...db };

  if (startVersion >= targetVersion) {
    return {
      ...current,
      version: targetVersion,
    };
  }

  for (let version = startVersion + 1; version <= targetVersion; version += 1) {
    const migrate = migrations[version];
    if (typeof migrate !== 'function') {
      console.warn(`Migration ${version} não encontrada. Mantendo estado atual e avançando versão.`);
      current = {
        ...current,
        version,
      };
      continue;
    }
    try {
      current = migrate(current);
    } catch (error) {
      console.error(`Erro ao aplicar migration ${version}:`, error);
      return {
        ...current,
        version: targetVersion,
      };
    }
  }

  return {
    ...current,
    version: targetVersion,
  };
};
