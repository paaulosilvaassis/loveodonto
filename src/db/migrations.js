import { DB_VERSION, defaultDbState } from './schema.js';
import { buildPermissionsCatalog } from '../permissions/catalog.js';
import { ROLE_DEFAULT_PERMISSIONS, ROLES_FOR_SEED } from '../permissions/roleDefaults.js';

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrations.js:11',message:'Migration 11 start',data:{hasDb:!!db,version:db?.version,appointmentsCount:Array.isArray(db?.appointments) ? db.appointments.length : 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrations.js:11',message:'Migrating appointment',data:{aptId:apt?.id,aptStatus:apt?.status,hasCheckInAt:!!apt?.checkInAt},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrations.js:11',message:'Migration 11 appointments migrated',data:{migratedCount:migratedAppointments.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrations.js:11',message:'Migration 11 error',data:{error:err?.message,stack:err?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      throw err;
    }
    const result = {
      ...base,
      ...rest,
      appointments: migratedAppointments,
      version: 11,
    };
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrations.js:11',message:'Migration 11 complete',data:{resultVersion:result.version,resultAppointmentsCount:result.appointments.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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
};

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

  let current = db;
  const targetVersion = DB_VERSION;
  const startVersion = Number(current.version || 0);

  if (!migrations[targetVersion]) {
    console.warn(`Migration ${targetVersion} não encontrada. Retornando estado atual.`);
    return {
      ...current,
      version: targetVersion,
    };
  }

  if (startVersion === targetVersion) {
    return current;
  }

  if (startVersion < 2 && targetVersion === 3) {
    const v2 = migrations[2](current);
    return migrations[3](v2);
  }

  if (startVersion === 2 && targetVersion === 3) return migrations[3](current);
  if (startVersion === 3 && targetVersion === 4) return migrations[4](current);
  if (startVersion === 4 && targetVersion === 5) return migrations[5](current);
  if (startVersion === 5 && targetVersion === 6) return migrations[6](current);
  if (startVersion === 6 && targetVersion === 7) return migrations[7](current);
  if (startVersion === 7 && targetVersion === 8) return migrations[8](current);
  if (startVersion === 8 && targetVersion === 9) return migrations[9](current);
  if (startVersion === 9 && targetVersion === 10) return migrations[10](current);
  if (startVersion < 4 && targetVersion === 4) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    return migrations[4](v3);
  }

  if (startVersion < 5 && targetVersion === 5) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    return migrations[5](v4);
  }

  if (startVersion < 6 && targetVersion === 6) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    return migrations[6](v5);
  }

  if (startVersion < 7 && targetVersion === 7) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    const v6 = (startVersion < 6 ? migrations[6](v5) : v5);
    return migrations[7](v6);
  }

  if (startVersion < 8 && targetVersion === 8) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    const v6 = (startVersion < 6 ? migrations[6](v5) : v5);
    const v7 = (startVersion < 7 ? migrations[7](v6) : v6);
    return migrations[8](v7);
  }

  if (startVersion < 9 && targetVersion === 9) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    const v6 = (startVersion < 6 ? migrations[6](v5) : v5);
    const v7 = (startVersion < 7 ? migrations[7](v6) : v6);
    const v8 = (startVersion < 8 ? migrations[8](v7) : v7);
    return migrations[9](v8);
  }

  if (startVersion < 10 && targetVersion === 10) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    const v6 = (startVersion < 6 ? migrations[6](v5) : v5);
    const v7 = (startVersion < 7 ? migrations[7](v6) : v6);
    const v8 = (startVersion < 8 ? migrations[8](v7) : v7);
    const v9 = (startVersion < 9 ? migrations[9](v8) : v8);
    return migrations[10](v9);
  }

  if (startVersion === 10 && targetVersion === 11) return migrations[11](current);
  if (startVersion === 11 && targetVersion === 12) return migrations[12](current);
  if (startVersion === 12 && targetVersion === 13) return migrations[13](current);
  if (startVersion === 13 && targetVersion === 14) return migrations[14](current);
  if (startVersion === 14 && targetVersion === 15) return migrations[15](current);

  if (startVersion < 11 && targetVersion === 11) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    const v6 = (startVersion < 6 ? migrations[6](v5) : v5);
    const v7 = (startVersion < 7 ? migrations[7](v6) : v6);
    const v8 = (startVersion < 8 ? migrations[8](v7) : v7);
    const v9 = (startVersion < 9 ? migrations[9](v8) : v8);
    const v10 = (startVersion < 10 ? migrations[10](v9) : v9);
    return migrations[11](v10);
  }

  if (startVersion < 12 && targetVersion === 12) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    const v6 = (startVersion < 6 ? migrations[6](v5) : v5);
    const v7 = (startVersion < 7 ? migrations[7](v6) : v6);
    const v8 = (startVersion < 8 ? migrations[8](v7) : v7);
    const v9 = (startVersion < 9 ? migrations[9](v8) : v8);
    const v10 = (startVersion < 10 ? migrations[10](v9) : v9);
    const v11 = (startVersion < 11 ? migrations[11](v10) : v10);
    return migrations[12](v11);
  }

  if (startVersion < 13 && targetVersion === 13) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    const v6 = (startVersion < 6 ? migrations[6](v5) : v5);
    const v7 = (startVersion < 7 ? migrations[7](v6) : v6);
    const v8 = (startVersion < 8 ? migrations[8](v7) : v7);
    const v9 = (startVersion < 9 ? migrations[9](v8) : v8);
    const v10 = (startVersion < 10 ? migrations[10](v9) : v9);
    const v11 = (startVersion < 11 ? migrations[11](v10) : v10);
    const v12 = (startVersion < 12 ? migrations[12](v11) : v11);
    return migrations[13](v12);
  }

  if (startVersion < 14 && targetVersion === 14) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    const v6 = (startVersion < 6 ? migrations[6](v5) : v5);
    const v7 = (startVersion < 7 ? migrations[7](v6) : v6);
    const v8 = (startVersion < 8 ? migrations[8](v7) : v7);
    const v9 = (startVersion < 9 ? migrations[9](v8) : v8);
    const v10 = (startVersion < 10 ? migrations[10](v9) : v9);
    const v11 = (startVersion < 11 ? migrations[11](v10) : v10);
    const v12 = (startVersion < 12 ? migrations[12](v11) : v11);
    const v13 = (startVersion < 13 ? migrations[13](v12) : v12);
    return migrations[14](v13);
  }

  if (startVersion < 15 && targetVersion === 15) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    const v6 = (startVersion < 6 ? migrations[6](v5) : v5);
    const v7 = (startVersion < 7 ? migrations[7](v6) : v6);
    const v8 = (startVersion < 8 ? migrations[8](v7) : v7);
    const v9 = (startVersion < 9 ? migrations[9](v8) : v8);
    const v10 = (startVersion < 10 ? migrations[10](v9) : v9);
    const v11 = (startVersion < 11 ? migrations[11](v10) : v10);
    const v12 = (startVersion < 12 ? migrations[12](v11) : v11);
    const v13 = (startVersion < 13 ? migrations[13](v12) : v12);
    const v14 = (startVersion < 14 ? migrations[14](v13) : v13);
    return migrations[15](v14);
  }

  if (startVersion < 16 && targetVersion === 16) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    const v6 = (startVersion < 6 ? migrations[6](v5) : v5);
    const v7 = (startVersion < 7 ? migrations[7](v6) : v6);
    const v8 = (startVersion < 8 ? migrations[8](v7) : v7);
    const v9 = (startVersion < 9 ? migrations[9](v8) : v8);
    const v10 = (startVersion < 10 ? migrations[10](v9) : v9);
    const v11 = (startVersion < 11 ? migrations[11](v10) : v10);
    const v12 = (startVersion < 12 ? migrations[12](v11) : v11);
    const v13 = (startVersion < 13 ? migrations[13](v12) : v12);
    const v14 = (startVersion < 14 ? migrations[14](v13) : v13);
    const v15 = (startVersion < 15 ? migrations[15](v14) : v14);
    return migrations[16](v15);
  }

  if (startVersion < 17 && targetVersion === 17) {
    const v2 = startVersion < 2 ? migrations[2](current) : current;
    const v3 = (startVersion < 3 ? migrations[3](v2) : v2);
    const v4 = (startVersion < 4 ? migrations[4](v3) : v3);
    const v5 = (startVersion < 5 ? migrations[5](v4) : v4);
    const v6 = (startVersion < 6 ? migrations[6](v5) : v5);
    const v7 = (startVersion < 7 ? migrations[7](v6) : v6);
    const v8 = (startVersion < 8 ? migrations[8](v7) : v7);
    const v9 = (startVersion < 9 ? migrations[9](v8) : v8);
    const v10 = (startVersion < 10 ? migrations[10](v9) : v9);
    const v11 = (startVersion < 11 ? migrations[11](v10) : v10);
    const v12 = (startVersion < 12 ? migrations[12](v11) : v11);
    const v13 = (startVersion < 13 ? migrations[13](v12) : v12);
    const v14 = (startVersion < 14 ? migrations[14](v13) : v13);
    const v15 = (startVersion < 15 ? migrations[15](v14) : v14);
    const v16 = (startVersion < 16 ? migrations[16](v15) : v15);
    return migrations[17](v16);
  }

  // Fallback: tentar aplicar a migration diretamente
  try {
    return migrations[targetVersion](current);
  } catch (error) {
    console.error(`Erro ao aplicar migration ${targetVersion}:`, error);
    // Retornar o estado atual sem aplicar a migration em caso de erro
    return {
      ...current,
      version: targetVersion,
    };
  }
};
