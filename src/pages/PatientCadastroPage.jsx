import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { canManageAccess } from '../services/accessService.js';
import { Section } from '../components/Section.jsx';
import { SectionCard } from '../components/SectionCard.jsx';
import ImportExportButtons from '../components/ImportExportButtons.jsx';
import { useCepAutofill } from '../hooks/useCepAutofill.js';
import {
  addPatientAddress,
  addPatientInsurance,
  addPatientPhone,
  createPatientQuick,
  getPatient,
  PENDING_FIELDS_MAP,
  recalcAndPersistPendingData,
  removePatientAddress,
  removePatientInsurance,
  updatePatientAccess,
  updatePatientBirth,
  updatePatientDocuments,
  updatePatientEducation,
  updatePatientPhone,
  updatePatientProfile,
  updatePatientRelationships,
  updatePatientStatus,
  uploadPatientPhoto,
} from '../services/patientService.js';
import { getPatientRecord, updatePatientRecord } from '../services/patientRecordService.js';
import { formatCep, formatCpf, formatPhone, onlyDigits } from '../utils/validators.js';

/** Campos que não são obrigatórios; removidos da lista de pendências ao exibir (compatível com dados antigos). */
const PENDING_OPTIONAL_KEYS = ['preferred_dentist', 'insurance_name'];
const filterOptionalPending = (arr) => (arr || []).filter((k) => !PENDING_OPTIONAL_KEYS.includes(k));

const TAB_CONFIG = [
  { id: 'dados', label: 'Dados Principais' },
  { id: 'documentacao', label: 'Documentação' },
  { id: 'pessoais', label: 'Dados Pessoais' },
  { id: 'formacao', label: 'Formação / Profissão' },
  { id: 'telefones', label: 'Telefones' },
  { id: 'enderecos', label: 'Endereços' },
  { id: 'relacionamentos', label: 'Relacionamentos' },
  { id: 'convenios', label: 'Convênios' },
  { id: 'acesso', label: 'Dados de Acesso' },
  { id: 'prontuario', label: 'Prontuário' },
  { id: 'situacao', label: 'Situação do Cadastro' },
];

const emptyDraft = () => ({
  profile: {
    full_name: '',
    nickname: '',
    social_name: '',
    sex: '',
    birth_date: '',
    cpf: '',
    status: 'active',
    blocked: false,
    photo_url: '',
    created_at: '',
    created_by_user_id: '',
  },
  documents: {
    rg: '',
    pis: '',
    marital_status: '',
    mother_name: '',
    father_name: '',
    responsible_name: '',
    responsible_relation: '',
    responsible_cpf: '',
    personal_email: '',
  },
  birth: {
    nationality: '',
    birth_city: '',
    birth_state: '',
  },
  education: {
    education_level: '',
    profession: '',
  },
  phones: {
    primary: '',
    secondary: '',
    whatsapp: '',
    refs: { primary: null, secondary: null, whatsapp: null },
  },
  address: {
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
  },
  relationships: {
    financial_responsible_name: '',
    financial_responsible_relation: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  },
  insurance: {
    insurance_name: '',
    membership_number: '',
    validity: '',
    company_partner: '',
  },
  access: {
    access_email: '',
    access_status: '',
  },
  record: {
    record_number: '',
    preferred_dentist: '',
    patient_type: '',
  },
});

const calculateAge = (birthDate) => {
  if (!birthDate) return '';
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? `${age} anos` : '';
};

const parseBirthPlace = (value) => {
  const parts = String(value || '').split('-').map((item) => item.trim()).filter(Boolean);
  if (parts.length === 0) return { city: '', state: '' };
  if (parts.length === 1) return { city: parts[0], state: '' };
  const state = parts[parts.length - 1].slice(0, 2).toUpperCase();
  const city = parts.slice(0, -1).join(' - ');
  return { city, state };
};

const mapPhones = (phones) => {
  const primary = phones.find((item) => item.is_primary) || phones.find((item) => item.type === 'celular');
  const whatsapp = phones.find((item) => item.is_whatsapp) || phones.find((item) => item.type === 'whatsapp');
  const secondary = phones.find((item) => !item.is_primary && item.id !== primary?.id && !item.is_whatsapp);
  const format = (phone) => (phone ? formatPhone(`${phone.ddd}${phone.number}`) : '');
  return {
    primary: format(primary),
    secondary: format(secondary),
    whatsapp: format(whatsapp),
    refs: { primary, secondary, whatsapp },
  };
};

const mapPatientToDraft = (patient, record) => {
  const phones = mapPhones(patient.phones || []);
  const address = patient.addresses?.[0] || {};
  return {
    profile: {
      ...emptyDraft().profile,
      full_name: patient.profile?.full_name || '',
      nickname: patient.profile?.nickname || '',
      social_name: patient.profile?.social_name || '',
      sex: patient.profile?.sex || '',
      birth_date: patient.profile?.birth_date || '',
      cpf: patient.profile?.cpf || '',
      status: patient.profile?.status || 'active',
      blocked: Boolean(patient.profile?.blocked),
      photo_url: patient.profile?.photo_url || '',
      created_at: patient.profile?.created_at || '',
      created_by_user_id: patient.profile?.created_by_user_id || '',
    },
    documents: {
      ...emptyDraft().documents,
      rg: patient.documents?.rg || '',
      pis: patient.documents?.pis || '',
      marital_status: patient.documents?.marital_status || '',
      mother_name: patient.documents?.mother_name || '',
      father_name: patient.documents?.father_name || '',
      responsible_name: patient.documents?.responsible_name || '',
      responsible_relation: patient.documents?.responsible_relation || '',
      responsible_cpf: patient.documents?.responsible_cpf || '',
      personal_email: patient.documents?.personal_email || '',
    },
    birth: {
      ...emptyDraft().birth,
      nationality: patient.birth?.nationality || '',
      birth_city: patient.birth?.birth_city || '',
      birth_state: patient.birth?.birth_state || '',
    },
    education: {
      ...emptyDraft().education,
      education_level: patient.education?.education_level || '',
      profession: patient.education?.profession || '',
    },
    phones: {
      primary: phones.primary,
      secondary: phones.secondary,
      whatsapp: phones.whatsapp,
      refs: phones.refs,
    },
    address: {
      ...emptyDraft().address,
      cep: formatCep(address.cep || ''),
      street: address.street || '',
      number: address.number || '',
      complement: address.complement || '',
      neighborhood: address.neighborhood || '',
      city: address.city || '',
      state: address.state || '',
      id: address.id || '',
    },
    relationships: {
      ...emptyDraft().relationships,
      financial_responsible_name: patient.relationships?.financial_responsible_name || '',
      financial_responsible_relation: patient.relationships?.financial_responsible_relation || '',
      emergency_contact_name: patient.relationships?.emergency_contact_name || '',
      emergency_contact_phone: patient.relationships?.emergency_contact_phone || '',
    },
    insurance: {
      ...emptyDraft().insurance,
      insurance_name: patient.insurances?.[0]?.insurance_name || '',
      membership_number: patient.insurances?.[0]?.membership_number || '',
      validity: patient.insurances?.[0]?.validity || '',
      company_partner: patient.insurances?.[0]?.company_partner || '',
      id: patient.insurances?.[0]?.id || '',
    },
    access: {
      ...emptyDraft().access,
      access_email: patient.access?.access_email || '',
      access_status: patient.access?.access_status || '',
    },
    record: {
      ...emptyDraft().record,
      record_number: record?.record_number || '',
      preferred_dentist: record?.preferred_dentist || '',
      patient_type: record?.patient_type || '',
    },
  };
};

const normalizePhonePayload = (value) => {
  const digits = onlyDigits(value);
  if (!digits || digits.length < 10) return null;
  return { ddd: digits.slice(0, 2), number: digits.slice(2) };
};

const hasAddressContent = (address) => {
  const values = [address.cep, address.street, address.number, address.neighborhood, address.city, address.state];
  return values.some((value) => Boolean((value || '').trim()));
};

export default function PatientCadastroPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const highlightPending = searchParams.get('highlight') === 'pending';
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dados');
  const [editMode, setEditMode] = useState(!patientId);
  const [status, setStatus] = useState({ error: '', success: '' });
  const [draft, setDraft] = useState(emptyDraft);
  const originalRef = useRef(null);
  const photoInputRef = useRef(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pendingData, setPendingData] = useState({
    hasPendingData: false,
    pendingFields: [],
    pendingCriticalFields: [],
  });
  const [showPendingHighlight, setShowPendingHighlight] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);

  // Ler query params para retorno à agenda
  const returnToAgenda = searchParams.get('returnTo') === 'agenda';
  const prefillName = searchParams.get('prefillName') || '';
  const slotDate = searchParams.get('slotDate') || '';
  const startTime = searchParams.get('startTime') || '';
  const professionalId = searchParams.get('professionalId') || '';

  const handleAvatarDebugClick = (source) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:260',message:'avatar click',data:{source,patientId:patientId || null,editMode,hasPhotoUrl:!!draft.profile.photo_url,hasFileInput:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
  };

  const ageDisplay = useMemo(() => calculateAge(draft.profile.birth_date), [draft.profile.birth_date]);
  const createdAtDisplay = useMemo(() => {
    if (!draft.profile.created_at) return '';
    return new Date(draft.profile.created_at).toLocaleDateString('pt-BR');
  }, [draft.profile.created_at]);
  const statusLabel = draft.profile.status === 'inactive'
    ? 'Inativo'
    : draft.profile.status === 'pending'
      ? 'Pendente'
      : draft.profile.status === 'blocked'
        ? 'Bloqueado'
        : 'Ativo';
  const statusClass = draft.profile.status === 'inactive'
    ? 'inactive'
    : draft.profile.status === 'pending' || draft.profile.status === 'blocked'
      ? 'pending'
      : 'active';

  const addressFields = useMemo(() => ({
    cep: 'cep',
    street: 'street',
    neighborhood: 'neighborhood',
    city: 'city',
    state: 'state',
  }), []);

  const {
    cepError,
    handleCepBlur,
    handleCepChange,
    handleFieldChange,
    loading: cepLoading,
  } = useCepAutofill({
    enabled: editMode,
    fields: addressFields,
    getAddress: () => draft.address,
    setAddress: (updater) => {
      setDraft((prev) => ({
        ...prev,
        address: typeof updater === 'function' ? updater(prev.address) : updater,
      }));
    },
  });

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:298',message:'cadastro mount',data:{mode:patientId ? 'EDIT' : 'CREATE',patientId:patientId || null,pathname:location.pathname,search:location.search},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    if (!patientId) {
      const next = emptyDraft();
      // Pré-preencher nome se vier da agenda
      if (prefillName) {
        next.profile.full_name = prefillName;
      }
      originalRef.current = next;
      setDraft(next);
      setEditMode(true);
      setStatus({ error: '', success: '' });
      setPendingData({ hasPendingData: false, pendingFields: [], pendingCriticalFields: [] });
      setShowPendingHighlight(false);
      setShowPendingModal(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:305',message:'cadastro create init',data:{patientId:null,clearedStatus:true,prefillName,returnToAgenda},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      return;
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:311',message:'cadastro edit load',data:{patientId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    const patient = getPatient(patientId);
    if (!patient) {
      setStatus({ error: 'Paciente não encontrado.', success: '' });
      setEditMode(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:318',message:'cadastro edit not found',data:{patientId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      return;
    }
    const record = getPatientRecord(patientId);
    const next = mapPatientToDraft(patient, record);
    originalRef.current = next;
    setDraft(next);
    const rawFields = Array.isArray(patient.profile?.pendingFields) ? patient.profile.pendingFields : [];
    const rawCritical = Array.isArray(patient.profile?.pendingCriticalFields) ? patient.profile.pendingCriticalFields : [];
    const pendingFields = filterOptionalPending(rawFields);
    const pendingCriticalFields = filterOptionalPending(rawCritical);
    setPendingData({
      hasPendingData: pendingFields.length > 0,
      pendingFields,
      pendingCriticalFields,
    });
    if (highlightPending && patient.profile?.hasPendingData) {
      setShowPendingModal(true);
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:327',message:'cadastro edit loaded',data:{patientId,hasProfile:Boolean(patient?.profile?.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
  }, [patientId]);

  const updateDraft = (section, field, value) => {
    setDraft((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const handlePhotoUpload = (event) => {
    const file = event.target.files?.[0];
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:358',message:'cadastro photo input change',data:{hasFile:!!file,type:file?.type || null,size:file?.size || null,patientId:patientId || null,editMode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    if (!file) {
      setPhotoPreview(null);
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setStatus({ error: 'Tipo de arquivo inválido. Use apenas imagens PNG, JPG, JPEG ou WEBP.', success: '' });
      setPhotoPreview(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setStatus({ error: 'Arquivo muito grande. O tamanho máximo é 5MB.', success: '' });
      setPhotoPreview(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setPhotoPreview(dataUrl);
      updateDraft('profile', 'photo_url', dataUrl);
      setStatus({ error: '', success: '' });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:384',message:'cadastro photo reader load',data:{patientId:patientId || null,hasPreview:!!dataUrl,previewLength:typeof dataUrl === 'string' ? dataUrl.length : 0,editMode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion

      if (patientId) {
        try {
          setPhotoUploading(true);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:392',message:'cadastro photo upload start',data:{patientId,editMode,hasPreview:!!dataUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          uploadPatientPhoto(user, patientId, { type: file.type, size: file.size, dataUrl });
          setStatus({ error: '', success: 'Foto atualizada com sucesso.' });
        } catch (err) {
          setStatus({ error: err.message || 'Erro ao salvar a foto. Tente novamente.', success: '' });
        } finally {
          setPhotoUploading(false);
        }
      }
    };
    reader.onerror = () => {
      setStatus({ error: 'Erro ao ler o arquivo. Tente novamente.', success: '' });
      setPhotoPreview(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:409',message:'cadastro photo reader error',data:{patientId:patientId || null,editMode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarClick = () => {
    if (photoInputRef.current && editMode) {
      photoInputRef.current.click();
    }
  };

  const handleAvatarKeyDown = (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && editMode) {
      event.preventDefault();
      handleAvatarClick();
    }
  };

  const handleCancel = () => {
    if (!patientId) {
      navigate('/pacientes/busca');
      return;
    }
    setDraft(originalRef.current || emptyDraft());
    setEditMode(false);
    setStatus({ error: '', success: '' });
  };

  const handleOpenProntuario = () => {
    if (!patientId) return;
    navigate(`/prontuario/${patientId}`);
  };

  const upsertPhone = async (targetPatientId, phoneRef, value, meta) => {
    const payload = normalizePhonePayload(value);
    if (!payload) {
      return;
    }
    if (phoneRef?.id) {
      await updatePatientPhone(user, phoneRef.id, {
        ...payload,
        type: meta.type,
        is_whatsapp: meta.is_whatsapp,
        is_primary: meta.is_primary,
      });
      return;
    }
    await addPatientPhone(user, targetPatientId, {
      ...payload,
      type: meta.type,
      is_whatsapp: meta.is_whatsapp,
      is_primary: meta.is_primary,
    });
  };

  const handleSave = async () => {
    try {
      setStatus({ error: '', success: '' });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:365',message:'cadastro save start',data:{mode:patientId ? 'EDIT' : 'CREATE',patientId:patientId || null},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:369',message:'cadastro save with photo',data:{patientId:patientId || null,hasPhotoUrl:!!draft.profile.photo_url,photoUrlLength:typeof draft.profile.photo_url === 'string' ? draft.profile.photo_url.length : 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
      // #endregion
      if (!user) {
        setStatus({ error: 'Usuário não autenticado.', success: '' });
        return;
      }
      const payloadProfile = {
        full_name: draft.profile.full_name,
        nickname: draft.profile.nickname,
        social_name: draft.profile.social_name,
        sex: draft.profile.sex,
        birth_date: draft.profile.birth_date,
        cpf: draft.profile.cpf,
      };
      if (!payloadProfile.full_name || !payloadProfile.sex || !payloadProfile.birth_date || !payloadProfile.cpf) {
        setStatus({ error: 'Preencha os campos obrigatórios: Nome, Sexo, Data de nascimento e CPF.', success: '' });
        return;
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:379',message:'cadastro save payload summary',data:{nameLen:(payloadProfile.full_name || '').length,cpfLen:(payloadProfile.cpf || '').length,sexLen:(payloadProfile.sex || '').length,birthLen:(payloadProfile.birth_date || '').length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion

      const existingPatient = patientId ? getPatient(patientId) : null;
      let createdFromScratch = !patientId || !existingPatient;
      let nextPatientId = patientId;
      if (createdFromScratch) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:493',message:'cadastro create with photo',data:{hasPhotoUrl:!!draft.profile.photo_url,photoUrlLength:typeof draft.profile.photo_url === 'string' ? draft.profile.photo_url.length : 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
        // #endregion
        const created = createPatientQuick(user, {
          full_name: payloadProfile.full_name,
          sex: payloadProfile.sex,
          birth_date: payloadProfile.birth_date,
          cpf: payloadProfile.cpf,
          nickname: payloadProfile.nickname,
          social_name: payloadProfile.social_name,
        });
        nextPatientId = created.patientId || created.id;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:504',message:'cadastro create result',data:{nextPatientId:nextPatientId || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
        // #endregion
        // Garantir que o paciente foi persistido antes de continuar
        const verifyPatient = getPatient(nextPatientId);
        if (!verifyPatient) {
          throw new Error('Erro ao criar paciente. Tente novamente.');
        }
      } else {
        updatePatientProfile(user, patientId, payloadProfile);
        // Garantir que o paciente existe após update
        const verifyPatient = getPatient(patientId);
        if (!verifyPatient) {
          throw new Error('Erro ao atualizar paciente. Tente novamente.');
        }
      }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:409',message:'cadastro save resolved id',data:{nextPatientId,createdFromScratch,mode:patientId ? 'EDIT' : 'CREATE'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:411',message:'cadastro save before core updates',data:{nextPatientId,hasDraftDocs:!!draft.documents,hasDraftBirth:!!draft.birth,hasDraftEducation:!!draft.education},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion

      const runStep = async (step, fn) => {
        try {
          return await fn();
        } catch (error) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:419',message:'cadastro save step error',data:{step,nextPatientId,message:String(error?.message || error)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
          // #endregion
          throw error;
        }
      };

      await runStep('updatePatientDocuments', () => updatePatientDocuments(user, nextPatientId, {
        rg: draft.documents.rg,
        pis: draft.documents.pis,
        marital_status: draft.documents.marital_status,
        mother_name: draft.documents.mother_name,
        father_name: draft.documents.father_name,
        responsible_name: draft.documents.responsible_name,
        responsible_relation: draft.documents.responsible_relation,
        responsible_cpf: draft.documents.responsible_cpf,
        personal_email: draft.documents.personal_email,
      }));

      await runStep('updatePatientBirth', () => updatePatientBirth(user, nextPatientId, {
        nationality: draft.birth.nationality,
        birth_city: draft.birth.birth_city,
        birth_state: draft.birth.birth_state,
        birth_date: draft.profile.birth_date,
      }));

      await runStep('updatePatientEducation', () => updatePatientEducation(user, nextPatientId, {
        education_level: draft.education.education_level,
        profession: draft.education.profession,
      }));

      await runStep('updatePatientRelationships', () => updatePatientRelationships(user, nextPatientId, {
        emergency_contact_name: draft.relationships.emergency_contact_name,
        emergency_contact_phone: draft.relationships.emergency_contact_phone,
        financial_responsible_name: draft.relationships.financial_responsible_name,
        financial_responsible_relation: draft.relationships.financial_responsible_relation,
      }));

      await runStep('updatePatientAccess', () => updatePatientAccess(user, nextPatientId, {
        access_email: draft.access.access_email,
        access_status: draft.access.access_status,
      }));

      await runStep('updatePatientStatus', () => updatePatientStatus(user, nextPatientId, {
        status: draft.profile.status,
        blocked: draft.profile.blocked || draft.profile.status === 'blocked',
      }));

      await runStep('updatePatientRecord', () => updatePatientRecord(nextPatientId, {
        record_number: draft.record.record_number,
        preferred_dentist: draft.record.preferred_dentist,
        patient_type: draft.record.patient_type,
      }));

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:456',message:'cadastro save before phones',data:{hasPhonesRefs:!!draft.phones?.refs},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion

      if (draft.phones?.refs) {
        await runStep('upsertPhone:primary', () => upsertPhone(nextPatientId, draft.phones.refs.primary, draft.phones.primary, {
          type: 'celular',
          is_whatsapp: false,
          is_primary: true,
        }));
        await runStep('upsertPhone:secondary', () => upsertPhone(nextPatientId, draft.phones.refs.secondary, draft.phones.secondary, {
          type: 'residencial',
          is_whatsapp: false,
          is_primary: false,
        }));
        await runStep('upsertPhone:whatsapp', () => upsertPhone(nextPatientId, draft.phones.refs.whatsapp, draft.phones.whatsapp, {
          type: 'whatsapp',
          is_whatsapp: true,
          is_primary: false,
        }));
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:474',message:'cadastro save before address/insurance',data:{hasAddress:hasAddressContent(draft.address),hasInsurance:[draft.insurance?.insurance_name,draft.insurance?.membership_number,draft.insurance?.validity,draft.insurance?.company_partner].some((value)=>Boolean((value||'').trim()))},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion

      if (hasAddressContent(draft.address)) {
        if (draft.address.id) {
          await runStep('removePatientAddress', () => removePatientAddress(user, draft.address.id));
        }
        await runStep('addPatientAddress', () => addPatientAddress(user, nextPatientId, {
          type: 'residencial',
          cep: draft.address.cep,
          street: draft.address.street,
          number: draft.address.number,
          complement: draft.address.complement,
          neighborhood: draft.address.neighborhood,
          city: draft.address.city,
          state: draft.address.state,
          is_primary: true,
        }));
      }

      const hasInsurance = [
        draft.insurance.insurance_name,
        draft.insurance.membership_number,
        draft.insurance.validity,
        draft.insurance.company_partner,
      ].some((value) => Boolean((value || '').trim()));
      if (hasInsurance) {
        if (draft.insurance.id) {
          await runStep('removePatientInsurance', () => removePatientInsurance(user, draft.insurance.id));
        }
        await runStep('addPatientInsurance', () => addPatientInsurance(user, nextPatientId, {
          insurance_name: draft.insurance.insurance_name,
          membership_number: draft.insurance.membership_number,
          validity: draft.insurance.validity,
          company_partner: draft.insurance.company_partner,
        }));
      }

      // Recalcula e persiste pendências com todos os dados já salvos (profile, documents, record, phones, address)
      recalcAndPersistPendingData(nextPatientId);

      const refreshed = getPatient(nextPatientId);
      const record = getPatientRecord(nextPatientId);
      const nextDraft = mapPatientToDraft(refreshed, record);
      originalRef.current = nextDraft;
      setDraft(nextDraft);
      const rawFields = Array.isArray(refreshed?.profile?.pendingFields) ? refreshed.profile.pendingFields : [];
      const rawCritical = Array.isArray(refreshed?.profile?.pendingCriticalFields) ? refreshed.profile.pendingCriticalFields : [];
      const pendingFields = filterOptionalPending(rawFields);
      const pendingCriticalFields = filterOptionalPending(rawCritical);
      setPendingData({
        hasPendingData: pendingFields.length > 0,
        pendingFields,
        pendingCriticalFields,
      });
      setShowPendingHighlight(false);
      setEditMode(false);
      setStatus({
        error: '',
        success: createdFromScratch ? 'Cadastro criado com sucesso.' : 'Cadastro atualizado com sucesso.',
      });
      if (createdFromScratch) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:506',message:'cadastro save navigate',data:{nextPatientId,createdFromScratch,returnToAgenda,slotDate,startTime,professionalId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
        
        // Se veio da agenda, voltar para agenda e reabrir o fluxo
        if (returnToAgenda && slotDate && startTime) {
          const params = new URLSearchParams({
            returnPatientId: nextPatientId,
            slotDate,
            startTime,
            professionalId,
          });
          navigate(`/gestao/agenda?${params.toString()}`);
        } else {
          navigate(`/pacientes/cadastro/${nextPatientId}`);
        }
      }
    } catch (error) {
      setStatus({ error: error?.message || 'Falha ao salvar cadastro.', success: '' });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientCadastroPage.jsx:514',message:'cadastro save error',data:{patientId:patientId || null,message:String(error?.message || error)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
    }
  };

  return (
    <div className="stack cadastro-page">
      <Section title="Cadastro de Paciente">
        <SectionCard>
          <div className="cadastro-header">
            <div>
              <h1>Cadastro de Paciente</h1>
              <div className="cadastro-breadcrumb">
                <span>Pacientes</span>
                <span>/</span>
                <span className="active">Cadastro</span>
              </div>
            </div>
            <div className="cadastro-actions">
              <div className={`status-badge ${statusClass}`}>
                <span>● {statusLabel}</span>
              </div>
              {patientId ? (
                <button type="button" className="button secondary" onClick={handleOpenProntuario}>
                  Acessar Prontuário
                </button>
              ) : null}
              {!editMode ? (
                <button type="button" className="button secondary" onClick={() => setEditMode(true)}>
                  Editar
                </button>
              ) : (
                <>
                  <button type="button" className="button primary" onClick={handleSave}>
                    Salvar
                  </button>
                  <button type="button" className="button secondary" onClick={handleCancel}>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
          {status.error ? <div className="alert error">{status.error}</div> : null}
          {status.success ? <div className="alert success">{status.success}</div> : null}

          {pendingData.hasPendingData ? (
            <div className="alert alert-warning pending-data-alert">
              <span>⚠️ Cadastro com informações pendentes. Atualize para liberar contratos e documentos.</span>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="button secondary button-sm"
                  onClick={() => setShowPendingModal(true)}
                >
                  Ver campos pendentes
                </button>
                <button
                  type="button"
                  className="button primary button-sm"
                  onClick={() => {
                    setEditMode(true);
                    setShowPendingHighlight(true);
                    setShowPendingModal(false);
                    setTimeout(() => {
                      const first = document.querySelector('.field-pending');
                      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                  }}
                >
                  Atualizar agora
                </button>
              </div>
            </div>
          ) : null}
          {showPendingModal && (
            <div
              className="modal-overlay pending-fields-modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pending-fields-modal-title"
              onClick={(e) => e.target === e.currentTarget && setShowPendingModal(false)}
            >
              <div className="modal-content pending-fields-modal">
                <h3 id="pending-fields-modal-title" className="pending-fields-modal-title">
                  Campos pendentes
                </h3>
                <p className="pending-fields-modal-desc">
                  Preencha estes campos para completar o cadastro e liberar a geração de contratos.
                </p>
                {pendingData.pendingCriticalFields?.length > 0 && (
                  <div className="pending-fields-section-critical">
                    <div className="pending-fields-section-title">Obrigatórios para contrato:</div>
                    <ul className="pending-fields-list">
                      {pendingData.pendingCriticalFields.map((key) => (
                        <li key={key}>{PENDING_FIELDS_MAP[key] || key}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="pending-fields-section-all">
                  <div className="pending-fields-section-title">Todos os campos faltando:</div>
                  <ul className="pending-fields-list pending-fields-list-scroll">
                    {(pendingData.pendingFields || []).map((key) => (
                      <li key={key}>{PENDING_FIELDS_MAP[key] || key}</li>
                    ))}
                  </ul>
                </div>
                <div className="pending-fields-footer">
                  <button type="button" className="button secondary" onClick={() => setShowPendingModal(false)}>
                    Fechar
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      setShowPendingModal(false);
                      setEditMode(true);
                      setShowPendingHighlight(true);
                      setTimeout(() => {
                        const first = document.querySelector('.field-pending');
                        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 100);
                    }}
                  >
                    Preencher agora
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="cadastro-card">
            <div className="cadastro-avatar">
              <label
                htmlFor={editMode ? 'cadastroPhotoInput' : undefined}
                className="avatar-upload"
                onClick={() => {
                  handleAvatarDebugClick('click');
                  handleAvatarClick();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleAvatarDebugClick('keydown');
                    handleAvatarKeyDown(event);
                  }
                }}
                tabIndex={editMode ? 0 : -1}
                role={editMode ? 'button' : undefined}
                aria-label={editMode ? 'Enviar foto do paciente' : 'Foto do paciente'}
                style={{ cursor: editMode ? 'pointer' : 'default' }}
              >
                {photoPreview ? (
                  <img className="avatar-upload-image" src={photoPreview} alt="Preview da foto do paciente" />
                ) : draft.profile.photo_url ? (
                  <img className="avatar-upload-image" src={draft.profile.photo_url} alt="Foto do paciente" />
                ) : (
                  <div className="avatar-placeholder" />
                )}
                {editMode && (
                  <div className="avatar-overlay">
                    <span>{photoUploading ? 'Enviando...' : 'Alterar'}</span>
                  </div>
                )}
              </label>
              <input
                ref={photoInputRef}
                id="cadastroPhotoInput"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
                aria-label="Enviar foto do paciente"
              />
            </div>
            <div className="cadastro-grid">
              <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('full_name') ? 'field-pending' : ''}`}>
                <label>Nome Completo *</label>
                <input
                  type="text"
                  value={draft.profile.full_name}
                  onChange={(event) => updateDraft('profile', 'full_name', event.target.value)}
                  disabled={!editMode}
                />
              </div>
              <div className="form-field">
                <label>Apelido / Nome Social</label>
                <input
                  type="text"
                  value={draft.profile.nickname}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateDraft('profile', 'nickname', value);
                    updateDraft('profile', 'social_name', value);
                  }}
                  disabled={!editMode}
                />
              </div>
              <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('sex') ? 'field-pending' : ''}`}>
                <label>Sexo *</label>
                <select
                  value={draft.profile.sex}
                  onChange={(event) => updateDraft('profile', 'sex', event.target.value)}
                  disabled={!editMode}
                >
                  <option value="">Selecione</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                  <option value="O">Outro</option>
                </select>
              </div>
              <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('birth_date') ? 'field-pending' : ''}`}>
                <label>Data de Nascimento *</label>
                <input
                  type="date"
                  value={draft.profile.birth_date}
                  onChange={(event) => updateDraft('profile', 'birth_date', event.target.value)}
                  disabled={!editMode}
                />
              </div>
              <div className="form-field">
                <label>Idade</label>
                <input type="text" value={ageDisplay} readOnly disabled />
              </div>
              <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('cpf') ? 'field-pending' : ''}`}>
                <label>CPF *</label>
                <input
                  type="text"
                  value={formatCpf(draft.profile.cpf)}
                  onChange={(event) => updateDraft('profile', 'cpf', formatCpf(event.target.value))}
                  disabled={!editMode}
                />
              </div>
            </div>
          </div>

          <div className="cadastro-tabs">
            {TAB_CONFIG.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="cadastro-tab-content">
            {activeTab === 'dados' ? (
              <div className="tab-content">
                <h3>Informações Gerais do Paciente</h3>
                <div className="cadastro-grid">
                  <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('personal_email') ? 'field-pending' : ''}`}>
                    <label>E-mail Principal</label>
                    <input
                      type="email"
                      value={draft.documents.personal_email}
                      onChange={(event) => updateDraft('documents', 'personal_email', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Telefone Principal</label>
                    <input
                      type="tel"
                      value={formatPhone(draft.phones.primary)}
                      onChange={(event) => updateDraft('phones', 'primary', formatPhone(event.target.value))}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Status</label>
                    <select
                      value={draft.profile.status}
                      onChange={(event) => updateDraft('profile', 'status', event.target.value)}
                      disabled={!editMode}
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                      <option value="pending">Pendente</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'documentacao' ? (
              <div className="tab-content">
                <h3>Documentação</h3>
                <div className="cadastro-grid">
                  <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('cpf_or_rg') ? 'field-pending' : ''}`}>
                    <label>RG (ou CPF acima)</label>
                    <input
                      type="text"
                      value={draft.documents.rg}
                      onChange={(event) => updateDraft('documents', 'rg', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>PIS / NIS</label>
                    <input
                      type="text"
                      value={draft.documents.pis}
                      onChange={(event) => updateDraft('documents', 'pis', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Estado Civil</label>
                    <select
                      value={draft.documents.marital_status}
                      onChange={(event) => updateDraft('documents', 'marital_status', event.target.value)}
                      disabled={!editMode}
                    >
                      <option value="">Selecione</option>
                      <option value="solteiro">Solteiro(a)</option>
                      <option value="casado">Casado(a)</option>
                      <option value="divorciado">Divorciado(a)</option>
                      <option value="viuvo">Viúvo(a)</option>
                      <option value="uniao_estavel">União Estável</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Nome da Mãe</label>
                    <input
                      type="text"
                      value={draft.documents.mother_name}
                      onChange={(event) => updateDraft('documents', 'mother_name', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Nome do Pai</label>
                    <input
                      type="text"
                      value={draft.documents.father_name}
                      onChange={(event) => updateDraft('documents', 'father_name', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('responsible_name') ? 'field-pending' : ''}`}>
                    <label>Responsável Legal (se menor)</label>
                    <input
                      type="text"
                      value={draft.documents.responsible_name}
                      onChange={(event) => updateDraft('documents', 'responsible_name', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('responsible_cpf') ? 'field-pending' : ''}`}>
                    <label>CPF do Responsável (se menor)</label>
                    <input
                      type="text"
                      value={formatCpf(draft.documents.responsible_cpf || '')}
                      onChange={(event) => updateDraft('documents', 'responsible_cpf', formatCpf(event.target.value))}
                      disabled={!editMode}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'pessoais' ? (
              <div className="tab-content">
                <h3>Dados Pessoais</h3>
                <div className="cadastro-grid">
                  <div className="form-field">
                    <label>Nacionalidade</label>
                    <input
                      type="text"
                      value={draft.birth.nationality}
                      onChange={(event) => updateDraft('birth', 'nationality', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Local de Nascimento</label>
                    <input
                      type="text"
                      value={`${draft.birth.birth_city}${draft.birth.birth_state ? ` - ${draft.birth.birth_state}` : ''}`}
                      onChange={(event) => {
                        const parsed = parseBirthPlace(event.target.value);
                        updateDraft('birth', 'birth_city', parsed.city);
                        updateDraft('birth', 'birth_state', parsed.state);
                      }}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Data de Cadastro</label>
                    <input type="text" value={createdAtDisplay} readOnly disabled />
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'formacao' ? (
              <div className="tab-content">
                <h3>Formação e Profissão</h3>
                <div className="cadastro-grid">
                  <div className="form-field">
                    <label>Escolaridade</label>
                    <select
                      value={draft.education.education_level}
                      onChange={(event) => updateDraft('education', 'education_level', event.target.value)}
                      disabled={!editMode}
                    >
                      <option value="">Selecione</option>
                      <option value="fundamental_incompleto">Fundamental Incompleto</option>
                      <option value="fundamental_completo">Fundamental Completo</option>
                      <option value="medio_incompleto">Médio Incompleto</option>
                      <option value="medio_completo">Médio Completo</option>
                      <option value="superior_incompleto">Superior Incompleto</option>
                      <option value="superior_completo">Superior Completo</option>
                      <option value="pos_graduacao">Pós-Graduação</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Profissão</label>
                    <input
                      type="text"
                      value={draft.education.profession}
                      onChange={(event) => updateDraft('education', 'profession', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'telefones' ? (
              <div className="tab-content">
                <h3>Telefones de Contato</h3>
                <div className="cadastro-grid">
                  <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('phone') ? 'field-pending' : ''}`}>
                    <label>Telefone Principal</label>
                    <input
                      type="tel"
                      value={formatPhone(draft.phones.primary)}
                      onChange={(event) => updateDraft('phones', 'primary', formatPhone(event.target.value))}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Telefone Secundário</label>
                    <input
                      type="tel"
                      value={formatPhone(draft.phones.secondary)}
                      onChange={(event) => updateDraft('phones', 'secondary', formatPhone(event.target.value))}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>WhatsApp</label>
                    <input
                      type="tel"
                      value={formatPhone(draft.phones.whatsapp)}
                      onChange={(event) => updateDraft('phones', 'whatsapp', formatPhone(event.target.value))}
                      disabled={!editMode}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'enderecos' ? (
              <div className="tab-content">
                <h3>Endereço Residencial</h3>
                <div className="cadastro-grid">
                  <div className="form-field">
                    <label>CEP</label>
                    <input
                      type="text"
                      value={formatCep(draft.address.cep)}
                      onChange={(event) => handleCepChange(formatCep(event.target.value))}
                      onBlur={handleCepBlur}
                      disabled={!editMode}
                    />
                    {cepLoading ? <small className="muted">Buscando CEP...</small> : null}
                    {cepError ? <small className="error">{cepError}</small> : null}
                  </div>
                  <div className={`form-field full ${showPendingHighlight && pendingData.pendingFields.includes('street') ? 'field-pending' : ''}`}>
                    <label>Logradouro</label>
                    <input
                      type="text"
                      value={draft.address.street}
                      onChange={(event) => handleFieldChange('street', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Número</label>
                    <input
                      type="text"
                      value={draft.address.number}
                      onChange={(event) => updateDraft('address', 'number', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field full">
                    <label>Complemento</label>
                    <input
                      type="text"
                      value={draft.address.complement}
                      onChange={(event) => updateDraft('address', 'complement', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Bairro</label>
                    <input
                      type="text"
                      value={draft.address.neighborhood}
                      onChange={(event) => handleFieldChange('neighborhood', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className={`form-field full ${showPendingHighlight && pendingData.pendingFields.includes('city') ? 'field-pending' : ''}`}>
                    <label>Cidade</label>
                    <input
                      type="text"
                      value={draft.address.city}
                      onChange={(event) => handleFieldChange('city', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Estado</label>
                    <select
                      value={draft.address.state}
                      onChange={(event) => handleFieldChange('state', event.target.value)}
                      disabled={!editMode}
                    >
                      <option value="">UF</option>
                      {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((uf) => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'relacionamentos' ? (
              <div className="tab-content">
                <h3>Relacionamentos e Contatos</h3>
                <div className="cadastro-grid">
                  <div className="form-field">
                    <label>Responsável Financeiro</label>
                    <input
                      type="text"
                      value={draft.relationships.financial_responsible_name}
                      onChange={(event) => updateDraft('relationships', 'financial_responsible_name', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Parentesco</label>
                    <input
                      type="text"
                      value={draft.relationships.financial_responsible_relation}
                      onChange={(event) => updateDraft('relationships', 'financial_responsible_relation', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field full">
                    <label>Contato de Emergência</label>
                    <input
                      type="text"
                      value={draft.relationships.emergency_contact_name}
                      onChange={(event) => updateDraft('relationships', 'emergency_contact_name', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Telefone de Emergência</label>
                    <input
                      type="tel"
                      value={formatPhone(draft.relationships.emergency_contact_phone)}
                      onChange={(event) => updateDraft('relationships', 'emergency_contact_phone', formatPhone(event.target.value))}
                      disabled={!editMode}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'convenios' ? (
              <div className="tab-content">
                <h3>Convênios e Planos de Saúde</h3>
                <div className="cadastro-grid">
                  <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('insurance_name') ? 'field-pending' : ''}`}>
                    <label>Convênio</label>
                    <input
                      type="text"
                      value={draft.insurance.insurance_name}
                      onChange={(event) => updateDraft('insurance', 'insurance_name', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Nº da Carteirinha</label>
                    <input
                      type="text"
                      value={draft.insurance.membership_number}
                      onChange={(event) => updateDraft('insurance', 'membership_number', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Validade</label>
                    <input
                      type="date"
                      value={draft.insurance.validity}
                      onChange={(event) => updateDraft('insurance', 'validity', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Empresa / Titular</label>
                    <input
                      type="text"
                      value={draft.insurance.company_partner}
                      onChange={(event) => updateDraft('insurance', 'company_partner', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'acesso' ? (
              <div className="tab-content">
                <h3>Acesso ao Sistema</h3>
                <div className="cadastro-grid">
                  <div className="form-field">
                    <label>Usuário</label>
                    <input
                      type="text"
                      value={draft.access.access_email}
                      onChange={(event) => updateDraft('access', 'access_email', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Perfil de Acesso</label>
                    <select
                      value={draft.access.access_status}
                      onChange={(event) => updateDraft('access', 'access_status', event.target.value)}
                      disabled={!editMode}
                    >
                      <option value="">Selecione</option>
                      <option value="paciente">Paciente</option>
                      <option value="paciente_menor">Paciente (Menor de idade)</option>
                      <option value="responsavel">Responsável</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'prontuario' ? (
              <div className="tab-content">
                <h3>Informações de Prontuário</h3>
                <div className="cadastro-grid">
                  <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('record_number') ? 'field-pending' : ''}`}>
                    <label>Nº do Prontuário</label>
                    <input
                      type="text"
                      value={draft.record.record_number}
                      onChange={(event) => updateDraft('record', 'record_number', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className={`form-field ${showPendingHighlight && pendingData.pendingFields.includes('preferred_dentist') ? 'field-pending' : ''}`}>
                    <label>Dentista de Preferência</label>
                    <input
                      type="text"
                      value={draft.record.preferred_dentist}
                      onChange={(event) => updateDraft('record', 'preferred_dentist', event.target.value)}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="form-field">
                    <label>Tipo de Paciente</label>
                    <select
                      value={draft.record.patient_type}
                      onChange={(event) => updateDraft('record', 'patient_type', event.target.value)}
                      disabled={!editMode}
                    >
                      <option value="">Selecione</option>
                      <option value="particular">Particular</option>
                      <option value="convenio">Convênio</option>
                      <option value="cortesia">Cortesia</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'situacao' ? (
              <div className="tab-content">
                <h3>Situação do Cadastro</h3>
                <div className="cadastro-grid">
                  <div className="form-field">
                    <label>Status do Cadastro</label>
                    <select
                      value={draft.profile.status}
                      onChange={(event) => updateDraft('profile', 'status', event.target.value)}
                      disabled={!editMode}
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                      <option value="pending">Pendente</option>
                      <option value="blocked">Bloqueado</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Bloqueio</label>
                    <select
                      value={draft.profile.blocked ? 'true' : 'false'}
                      onChange={(event) => updateDraft('profile', 'blocked', event.target.value === 'true')}
                      disabled={!editMode}
                    >
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Data de Cadastro</label>
                    <input type="text" value={createdAtDisplay} readOnly disabled />
                  </div>
                  <div className="form-field">
                    <label>Usuário que Cadastrou</label>
                    <input type="text" value={draft.profile.created_by_user_id || ''} readOnly disabled />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <ImportExportButtons
          patientId={patientId}
          user={user}
          canUse={canManageAccess(user)}
        />
      </Section>
    </div>
  );
}
