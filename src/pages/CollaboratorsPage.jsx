import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Field } from '../components/Field.jsx';
import { Section } from '../components/Section.jsx';
import { Tabs } from '../components/Tabs.jsx';
import { SectionHeaderActions } from '../components/SectionHeaderActions.jsx';
import { loadDb } from '../db/index.js';
import {
  addCollaboratorAddress,
  addCollaboratorEducation,
  addCollaboratorInsurance,
  addCollaboratorPhone,
  getCollaborator,
  listCollaborators,
  removeCollaboratorAddress,
  removeCollaboratorEducation,
  removeCollaboratorInsurance,
  removeCollaboratorPhone,
  updateCollaborator,
  updateCollaboratorAccess,
  updateCollaboratorAdditional,
  updateCollaboratorCharacteristics,
  updateCollaboratorDocuments,
  updateCollaboratorFinance,
  updateCollaboratorNationality,
  updateCollaboratorRelationships,
  updateCollaboratorWorkHours,
  uploadCollaboratorPhoto,
} from '../services/collaboratorService.js';
import { useCepAutofill } from '../hooks/useCepAutofill.js';
import { formatCep, formatCpf, formatPhone, validateFileMeta } from '../utils/validators.js';
import { can } from '../permissions/permissions.js';
import { canManageAccess } from '../services/accessService.js';
import AccessTab from '../components/access/AccessTab.jsx';
import { getUserAccess } from '../services/accessService.js';
import { Eye, Pencil, UserCheck, UserX } from 'lucide-react';
import CollaboratorCreateModal from '../components/collaborators/CollaboratorCreateModal.jsx';
import { CollaboratorRhProfileFields } from '../components/collaborators/CollaboratorRhProfileFields.jsx';
import { getAllCargosFlat } from '../constants/collaboratorRhCatalog.js';

const topTabs = [
  { value: 'cadastro', label: 'Dados Cadastrais' },
  { value: 'admissao', label: 'Dados Admissionais' },
  { value: 'horarios', label: 'Horários' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'acessos', label: 'Acessos' },
];

const cadastroSections = [
  'Dados Principais',
  'Documentação',
  'Formação',
  'Naturalidade',
  'Telefones',
  'Endereços',
  'Relacionamentos',
  'Características',
  'Dados Adicionais',
  'Convênios',
  'Dados de Acesso',
];

const defaultHours = [
  { diaSemana: 0, inicio: '08:00', fim: '12:00', intervaloInicio: '13:00', intervaloFim: '18:00', ativo: false },
  { diaSemana: 1, inicio: '08:00', fim: '12:00', intervaloInicio: '13:00', intervaloFim: '18:00', ativo: true },
  { diaSemana: 2, inicio: '08:00', fim: '12:00', intervaloInicio: '13:00', intervaloFim: '18:00', ativo: true },
  { diaSemana: 3, inicio: '08:00', fim: '12:00', intervaloInicio: '13:00', intervaloFim: '18:00', ativo: true },
  { diaSemana: 4, inicio: '08:00', fim: '12:00', intervaloInicio: '13:00', intervaloFim: '18:00', ativo: true },
  { diaSemana: 5, inicio: '08:00', fim: '12:00', intervaloInicio: '13:00', intervaloFim: '18:00', ativo: true },
  { diaSemana: 6, inicio: '08:00', fim: '12:00', intervaloInicio: '13:00', intervaloFim: '18:00', ativo: false },
];

const normalizeWorkHours = (hours = []) => {
  // Sempre retornar exatamente 7 dias (um para cada dia da semana)
  const normalized = [];
  for (let diaSemana = 0; diaSemana < 7; diaSemana++) {
    const existing = hours.find((h) => h.diaSemana === diaSemana);
    if (existing) {
      normalized.push({
        diaSemana,
        inicio: existing.inicio && /^\d{2}:\d{2}$/.test(existing.inicio) ? existing.inicio : '08:00',
        fim: existing.fim && /^\d{2}:\d{2}$/.test(existing.fim) ? existing.fim : '12:00',
        intervaloInicio: existing.intervaloInicio && /^\d{2}:\d{2}$/.test(existing.intervaloInicio) ? existing.intervaloInicio : '13:00',
        intervaloFim: existing.intervaloFim && /^\d{2}:\d{2}$/.test(existing.intervaloFim) ? existing.intervaloFim : '18:00',
        ativo: existing.ativo !== undefined ? existing.ativo : defaultHours[diaSemana].ativo,
      });
    } else {
      normalized.push(defaultHours[diaSemana]);
    }
  }
  return normalized;
};

const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Alinhado à persistência no banco: sem status ou "ativo" → ativo; demais → inativo na listagem. */
const isCollaboratorActive = (collaborator) =>
  String(collaborator?.status || 'ativo').toLowerCase() === 'ativo';

export default function CollaboratorsPage() {
  const navigate = useNavigate();
  const matchCreate = useMatch({ path: '/admin/colaboradores/novo', end: true });
  const isCreateFlow = Boolean(matchCreate);
  const { user } = useAuth();
  const [collaborators, setCollaborators] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [directoryStatusTab, setDirectoryStatusTab] = useState('ativo');
  const [filter, setFilter] = useState({ cargo: '' });
  const [activeTab, setActiveTab] = useState('cadastro');
  const [activeSection, setActiveSection] = useState('Dados Principais');
  const [editingSection, setEditingSection] = useState('');
  const [editingTab, setEditingTab] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hoursConflictModal, setHoursConflictModal] = useState({ open: false, conflicts: [] });

  const [draft, setDraft] = useState({
    profile: {},
    documents: {},
    education: [],
    nationality: {},
    phones: [],
    addresses: [],
    relationships: {},
    characteristics: {},
    additional: { notes: '' },
    insurances: [],
    access: {},
    workHours: normalizeWorkHours([]),
    finance: {},
    newPhone: { tipo: '', ddd: '', numero: '', principal: false },
    newAddress: { tipo: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', principal: false },
    newEducation: { formacao: '', instituicao: '', anoConclusao: '', cursos: '' },
    newInsurance: { convenioNome: '', detalhes: '', validade: '' },
  });

  const isEditor = can(user, 'collaborators:write');
  const updateNewAddress = (updater) =>
    setDraft((prev) => ({
      ...prev,
      newAddress: typeof updater === 'function' ? updater(prev.newAddress) : updater,
    }));
  const {
    loading: cepLoading,
    cepError,
    handleCepChange,
    handleCepBlur,
    handleFieldChange: handleAddressFieldChange,
    isAutoFilled,
  } = useCepAutofill({
    enabled: isEditor && editingSection === 'Endereços',
    getAddress: () => draft.newAddress,
    setAddress: updateNewAddress,
    fields: {
      cep: 'cep',
      street: 'logradouro',
      neighborhood: 'bairro',
      city: 'cidade',
      state: 'uf',
    },
  });

  const canFinance = can(user, 'collaborators:finance');
  const canAccess = can(user, 'collaborators:access');
  const canEditAcessos = canManageAccess(user);
  const db = loadDb();

  /** Só atualiza a lista (sidebar); nunca reidrata o rascunho — evita apagar digitação ao clicar em Atualizar. */
  const refreshCollaboratorsListOnly = useCallback(() => {
    setCollaborators(listCollaborators());
  }, []);

  /**
   * Reidrata o draft a partir do DB. Com preserveCurrentEdits, mantém fatias em edição (ex.: Dados Principais).
   * forceMergeKeys: após add phone/education/etc., mescla essas chaves do servidor mesmo em modo preserve.
   */
  const refreshCollaboratorDraft = useCallback(
    (collaboratorIdOverride, options = {}) => {
      const { preserveCurrentEdits = false, forceMergeKeys = [] } = options;
      const force = new Set(forceMergeKeys);
      setCollaborators(listCollaborators());
      const id = collaboratorIdOverride ?? selectedId;
      if (!id) return;
      const data = getCollaborator(id);
      if (!data) return;

      setDraft((prev) => {
        if (!preserveCurrentEdits) {
          if (import.meta.env?.DEV) {
            console.debug('[CollaboratorsPage] refreshCollaboratorDraft:full', { collaboratorId: id });
          }
          return {
            ...prev,
            ...data,
            workHours: normalizeWorkHours(data.workHours),
            newPhone: prev.newPhone,
            newAddress: prev.newAddress,
            newEducation: prev.newEducation,
            newInsurance: prev.newInsurance,
          };
        }

        if (import.meta.env?.DEV) {
          console.debug('[CollaboratorsPage] refreshCollaboratorDraft:preserve', {
            collaboratorId: id,
            editingSection,
            editingTab,
            forceMergeKeys: [...force],
          });
        }

        const pickPhones = () =>
          force.has('phones')
            ? data.phones
            : editingSection === 'Telefones'
              ? prev.phones
              : data.phones;
        const pickEducation = () =>
          force.has('education')
            ? data.education
            : editingSection === 'Formação'
              ? prev.education
              : data.education;
        const pickAddresses = () =>
          force.has('addresses')
            ? data.addresses
            : editingSection === 'Endereços'
              ? prev.addresses
              : data.addresses;
        const pickInsurances = () =>
          force.has('insurances')
            ? data.insurances
            : editingSection === 'Convênios'
              ? prev.insurances
              : data.insurances;

        return {
          ...prev,
          ...data,
          profile: editingSection === 'Dados Principais' ? prev.profile : data.profile,
          documents:
            editingSection === 'Documentação' || editingTab === 'admissao' ? prev.documents : data.documents,
          nationality: editingSection === 'Naturalidade' ? prev.nationality : data.nationality,
          relationships: editingSection === 'Relacionamentos' ? prev.relationships : data.relationships,
          characteristics: editingSection === 'Características' ? prev.characteristics : data.characteristics,
          additional: editingSection === 'Dados Adicionais' ? prev.additional : data.additional,
          access: editingSection === 'Dados de Acesso' ? prev.access : data.access,
          education: pickEducation(),
          phones: pickPhones(),
          addresses: pickAddresses(),
          insurances: pickInsurances(),
          workHours:
            editingTab === 'horarios' ? prev.workHours : normalizeWorkHours(data.workHours),
          finance: editingTab === 'financeiro' ? prev.finance : data.finance,
          newPhone: prev.newPhone,
          newAddress: prev.newAddress,
          newEducation: prev.newEducation,
          newInsurance: prev.newInsurance,
        };
      });
    },
    [editingSection, editingTab, selectedId]
  );

  const formatDatePtBr = (value) => {
    if (!value) return '—';
    const [year, month, day] = String(value).split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  };

  const getConflictStatusClass = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (['confirmado', 'em_confirmacao'].includes(normalized)) return 'is-confirmed';
    if (['agendado'].includes(normalized)) return 'is-scheduled';
    if (['em_espera', 'chegou'].includes(normalized)) return 'is-waiting';
    if (['em_atendimento'].includes(normalized)) return 'is-in-progress';
    if (['finalizado', 'atendido'].includes(normalized)) return 'is-finished';
    return 'is-default';
  };

  useEffect(() => {
    refreshCollaboratorsListOnly();
  }, [refreshCollaboratorsListOnly]);

  useEffect(() => {
    if (isCreateFlow && !isEditor) {
      navigate('/admin/colaboradores', { replace: true });
    }
  }, [isCreateFlow, isEditor, navigate]);

  useEffect(() => {
    if (!isCreateFlow) return;
    setSelectedId('');
    setEditingSection('');
    setEditingTab('');
    setError('');
    setSuccess('');
  }, [isCreateFlow]);

  useEffect(() => {
    if (activeTab === 'acessos' && selectedId && import.meta.env?.DEV) {
      const data = getCollaborator(selectedId);
      console.debug('[Acessos] collaborator loaded', { access: data?.access, profileId: data?.profile?.id, targetUserId: data?.access?.userId ?? data?.profile?.user_id });
    }
  }, [activeTab, selectedId]);

  const directoryStatusCounts = useMemo(() => {
    let ativos = 0;
    let inativos = 0;
    for (const item of collaborators) {
      if (isCollaboratorActive(item)) ativos += 1;
      else inativos += 1;
    }
    return { ativos, inativos };
  }, [collaborators]);

  const filteredCollaborators = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return collaborators.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.nomeCompleto?.toLowerCase().includes(normalizedSearch) ||
        item.apelido?.toLowerCase().includes(normalizedSearch);
      const inActiveGroup =
        directoryStatusTab === 'ativo' ? isCollaboratorActive(item) : !isCollaboratorActive(item);
      const matchesCargo = !filter.cargo || item.cargo === filter.cargo;
      return matchesSearch && inActiveGroup && matchesCargo;
    });
  }, [collaborators, search, directoryStatusTab, filter.cargo]);

  const collaboratorPhonesById = useMemo(() => {
    return (db.collaboratorPhones || []).reduce((acc, item) => {
      if (!item?.collaboratorId) return acc;
      if (!acc[item.collaboratorId]) acc[item.collaboratorId] = [];
      acc[item.collaboratorId].push(item);
      return acc;
    }, {});
  }, [db.collaboratorPhones]);

  const openCreateCollaborator = () => {
    setError('');
    setSuccess('');
    navigate('/admin/colaboradores/novo');
  };

  const closeCreateCollaborator = () => {
    navigate('/admin/colaboradores', { replace: true });
  };

  const handleCollaboratorCreated = (newId) => {
    navigate('/admin/colaboradores', { replace: true });
    setSelectedId(newId);
    setActiveTab('cadastro');
    setActiveSection('Dados Principais');
    setEditingSection('');
    setEditingTab('');
    setError('');
    refreshCollaboratorDraft(newId);
    setSuccess('Colaborador cadastrado com sucesso.');
  };

  const selectCollaborator = (id) => {
    if (editingSection || editingTab) {
      if (!window.confirm('Existem alterações não salvas. Deseja sair?')) return;
    }
    setSelectedId(id);
    const data = getCollaborator(id);
    if (data) {
      setDraft((prev) => ({ ...prev, ...data, workHours: normalizeWorkHours(data.workHours) }));
    }
    setEditingSection('');
    setEditingTab('');
  };

  const getCollaboratorInitials = (collaborator) => {
    const name = collaborator?.nomeCompleto || collaborator?.apelido || '';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'CL';
  };

  const getCollaboratorContact = (collaborator) => {
    const phones = collaboratorPhonesById[collaborator.id] || [];
    const primaryPhone = phones.find((item) => item.principal) || phones[0];
    if (primaryPhone?.ddd && primaryPhone?.numero) {
      return formatPhone(`${primaryPhone.ddd}${primaryPhone.numero}`);
    }
    return collaborator.email || '—';
  };

  const getCollaboratorSpecialty = (collaborator) => {
    if (Array.isArray(collaborator.especialidades) && collaborator.especialidades.length > 0) {
      return collaborator.especialidades.filter(Boolean).join(', ');
    }
    return '—';
  };

  /** Nome principal + subtítulo (nome social ou apelido), sem duplicar o texto principal. */
  const getCollaboratorNameDisplay = (collaborator) => {
    const primaryRaw =
      (collaborator.nomeCompleto || collaborator.apelido || 'Colaborador').trim() || 'Colaborador';
    const social = (collaborator.nomeSocial || '').trim();
    const nick = (collaborator.apelido || '').trim();
    const full = (collaborator.nomeCompleto || '').trim();

    let subtitle = '';
    if (social && social !== primaryRaw) {
      subtitle = social;
    } else if (full && nick && nick !== full) {
      subtitle = nick;
    }

    return { primary: primaryRaw, subtitle };
  };

  const getStatusLabel = (status) => (String(status || '').toLowerCase() === 'ativo' ? 'Ativo' : 'Inativo');

  const handleViewCollaborator = (collaboratorId) => {
    selectCollaborator(collaboratorId);
  };

  const handleEditCollaborator = (collaboratorId) => {
    selectCollaborator(collaboratorId);
    setActiveTab('cadastro');
    setActiveSection('Dados Principais');
    setEditingTab('');
    setEditingSection('Dados Principais');
  };

  const handleToggleCollaboratorStatus = (collaborator) => {
    if (!isEditor) return;
    const nextStatus = isCollaboratorActive(collaborator) ? 'inativo' : 'ativo';
    const actionLabel = nextStatus === 'inativo' ? 'desativar' : 'ativar';
    if (!window.confirm(`Deseja ${actionLabel} este colaborador?`)) return;
    try {
      updateCollaborator(user, collaborator.id, { status: nextStatus });
      refreshCollaboratorsListOnly();
      if (selectedId === collaborator.id) {
        setDraft((prev) => ({
          ...prev,
          profile: { ...prev.profile, status: nextStatus },
        }));
      }
      setDirectoryStatusTab(nextStatus === 'ativo' ? 'ativo' : 'inativo');
      setSuccess(`Colaborador ${nextStatus === 'ativo' ? 'ativado' : 'desativado'} com sucesso.`);
    } catch (err) {
      setError(err.message || 'Erro ao alterar status do colaborador.');
    }
  };

  const startEdit = (section) => {
    if (!isEditor) return;
    if ((editingTab && editingTab !== '') || (editingSection && editingSection !== section)) {
      if (!window.confirm('Existem alterações não salvas. Deseja sair?')) return;
    }
    setEditingSection(section);
    setEditingTab('');
    setError('');
    setSuccess('');
  };

  const startTabEdit = (tab) => {
    if (!isEditor) return;
    if ((editingSection && editingSection !== '') || (editingTab && editingTab !== tab)) {
      if (!window.confirm('Existem alterações não salvas. Deseja sair?')) return;
    }
    setEditingSection('');
    setEditingTab(tab);
    setError('');
    setSuccess('');
  };

  const cancelEdit = () => {
    setEditingSection('');
    setEditingTab('');
    if (selectedId) {
      const data = getCollaborator(selectedId);
      if (data) setDraft((prev) => ({ ...prev, ...data, workHours: normalizeWorkHours(data.workHours) }));
    }
  };

  const saveSection = (section) => {
    setError('');
    setSuccess('');
    try {
      if (!selectedId) throw new Error('Selecione um colaborador.');
      if (section === 'Dados Principais') updateCollaborator(user, selectedId, draft.profile);
      if (section === 'Documentação') updateCollaboratorDocuments(user, selectedId, draft.documents);
      if (section === 'Naturalidade') updateCollaboratorNationality(user, selectedId, draft.nationality);
      if (section === 'Relacionamentos') updateCollaboratorRelationships(user, selectedId, draft.relationships);
      if (section === 'Características') updateCollaboratorCharacteristics(user, selectedId, draft.characteristics);
      if (section === 'Dados Adicionais') updateCollaboratorAdditional(user, selectedId, draft.additional);
      if (section === 'Dados de Acesso') {
        updateCollaboratorAccess(user, selectedId, draft.access);
        setActiveTab('acessos');
      }
      setEditingSection('');
      refreshCollaboratorDraft();
      setSuccess('Dados salvos com sucesso.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTabChange = (next) => {
    if (editingSection || editingTab) {
      if (!window.confirm('Existem alterações não salvas. Deseja sair?')) return;
      setEditingSection('');
      setEditingTab('');
    }
    setActiveTab(next);
  };

  const handlePhotoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateFileMeta(file, ['image/png', 'image/jpeg']);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      uploadCollaboratorPhoto(user, selectedId, { type: file.type, size: file.size, dataUrl });
      refreshCollaboratorsListOnly();
      setDraft((prev) => ({
        ...prev,
        profile: { ...prev.profile, fotoUrl: dataUrl },
      }));
    };
    reader.readAsDataURL(file);
  };

  const cadastroContent = (
    <div className="clinic-layout">
      <aside className="clinic-menu">
        {cadastroSections.map((section) => (
          <button
            key={section}
            type="button"
            className={`clinic-menu-item ${activeSection === section ? 'active' : ''}`}
            onClick={() => {
              if (editingSection) {
                if (!window.confirm('Existem alterações não salvas. Deseja sair?')) return;
              }
              setActiveSection(section);
              setEditingSection('');
            }}
          >
            {section}
          </button>
        ))}
      </aside>
      <div className="clinic-content">
        <SectionHeaderActions
          title={activeSection}
          isEditing={editingSection === activeSection}
          onEdit={isEditor ? () => startEdit(activeSection) : null}
          onSave={() => saveSection(activeSection)}
          onCancel={cancelEdit}
          loading={false}
        />

        {error ? <div className="error">{error}</div> : null}
        {success ? <div className="success">{success}</div> : null}

        {activeSection === 'Dados Principais' && (
          <CollaboratorRhProfileFields
            profile={draft.profile}
            disabled={editingSection !== 'Dados Principais'}
            onPatch={(partial) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, ...partial } }))}
            photoSlot={
              <Field label="Foto">
                {draft.profile.fotoUrl ? <img className="logo-preview" src={draft.profile.fotoUrl} alt="Foto" /> : null}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handlePhotoUpload}
                  disabled={editingSection !== 'Dados Principais'}
                />
              </Field>
            }
          />
        )}

        {activeSection === 'Documentação' && (
          <div className="form-grid">
            <Field label="CPF">
              <input
                value={formatCpf(draft.documents.cpf || '')}
                onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, cpf: event.target.value } }))}
                disabled={editingSection !== 'Documentação'}
              />
            </Field>
            <Field label="RG">
              <input
                value={draft.documents.rg || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, rg: event.target.value } }))}
                disabled={editingSection !== 'Documentação'}
              />
            </Field>
            <Field label="PIS/PASEP">
              <input
                value={draft.documents.pisPasep || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, pisPasep: event.target.value } }))}
                disabled={editingSection !== 'Documentação'}
              />
            </Field>
            <Field label="CTPS">
              <input
                value={draft.documents.ctps || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, ctps: event.target.value } }))}
                disabled={editingSection !== 'Documentação'}
              />
            </Field>
            <Field label="CNPJ (se PJ)">
              <input
                value={draft.documents.cnpj || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, cnpj: event.target.value } }))}
                disabled={editingSection !== 'Documentação'}
              />
            </Field>
            <Field label="Observações">
              <textarea
                value={draft.documents.observacoes || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, observacoes: event.target.value } }))}
                disabled={editingSection !== 'Documentação'}
              />
            </Field>
          </div>
        )}

        {activeSection === 'Formação' && (
          <div className="stack">
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                if (!selectedId) return;
                addCollaboratorEducation(user, selectedId, draft.newEducation);
                setDraft((prev) => ({ ...prev, newEducation: { formacao: '', instituicao: '', anoConclusao: '', cursos: '' } }));
                refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['education'] });
              }}
            >
              <Field label="Formação">
                <input
                  value={draft.newEducation.formacao}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newEducation: { ...prev.newEducation, formacao: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Formação'}
                />
              </Field>
              <Field label="Instituição">
                <input
                  value={draft.newEducation.instituicao}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newEducation: { ...prev.newEducation, instituicao: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Formação'}
                />
              </Field>
              <Field label="Ano">
                <input
                  value={draft.newEducation.anoConclusao}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newEducation: { ...prev.newEducation, anoConclusao: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Formação'}
                />
              </Field>
              <Field label="Cursos/Certificações">
                <input
                  value={draft.newEducation.cursos}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newEducation: { ...prev.newEducation, cursos: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Formação'}
                />
              </Field>
              <button className="button primary" type="submit" disabled={!isEditor || editingSection !== 'Formação'}>
                Adicionar formação
              </button>
            </form>
            <div className="card">
              <ul className="list">
                {draft.education.map((item) => (
                  <li key={item.id} className="list-item">
                    {item.formacao} · {item.instituicao}
                    {isEditor ? (
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => {
                          removeCollaboratorEducation(user, item.id);
                          refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['education'] });
                        }}
                      >
                        Remover
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'Naturalidade' && (
          <div className="form-grid">
            <Field label="Cidade">
              <input
                value={draft.nationality.naturalidadeCidade || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, nationality: { ...prev.nationality, naturalidadeCidade: event.target.value } }))}
                disabled={editingSection !== 'Naturalidade'}
              />
            </Field>
            <Field label="UF">
              <input
                value={draft.nationality.naturalidadeUf || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, nationality: { ...prev.nationality, naturalidadeUf: event.target.value } }))}
                disabled={editingSection !== 'Naturalidade'}
              />
            </Field>
            <Field label="Nacionalidade">
              <input
                value={draft.nationality.nacionalidade || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, nationality: { ...prev.nationality, nacionalidade: event.target.value } }))}
                disabled={editingSection !== 'Naturalidade'}
              />
            </Field>
          </div>
        )}

        {activeSection === 'Telefones' && (
          <div className="stack">
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                if (!selectedId) return;
                addCollaboratorPhone(user, selectedId, draft.newPhone);
                setDraft((prev) => ({ ...prev, newPhone: { tipo: '', ddd: '', numero: '', principal: false } }));
                refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['phones'] });
              }}
            >
              <Field label="Tipo">
                <select
                  value={draft.newPhone.tipo}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, tipo: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Telefones'}
                >
                  <option value="">Selecione</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="celular">Celular</option>
                  <option value="comercial">Comercial</option>
                  <option value="outro">Outro</option>
                </select>
              </Field>
              <Field label="DDD">
                <input
                  value={draft.newPhone.ddd}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, ddd: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Telefones'}
                />
              </Field>
              <Field label="Número">
                <input
                  value={formatPhone(draft.newPhone.numero)}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, numero: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Telefones'}
                />
              </Field>
              <Field label="Principal">
                <input
                  type="checkbox"
                  checked={draft.newPhone.principal}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, principal: event.target.checked } }))}
                  disabled={!isEditor || editingSection !== 'Telefones'}
                />
              </Field>
              <button className="button primary" type="submit" disabled={!isEditor || editingSection !== 'Telefones'}>
                Adicionar telefone
              </button>
            </form>
            <div className="card">
              <ul className="list">
                {draft.phones.map((item) => (
                  <li key={item.id} className="list-item">
                    {item.tipo} · ({item.ddd}) {item.numero} {item.principal ? '★' : ''}
                    {isEditor ? (
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => {
                          removeCollaboratorPhone(user, item.id);
                          refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['phones'] });
                        }}
                      >
                        Remover
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'Endereços' && (
          <div className="stack">
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                if (!selectedId) return;
                addCollaboratorAddress(user, selectedId, draft.newAddress);
                setDraft((prev) => ({ ...prev, newAddress: { tipo: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', principal: false } }));
                refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['addresses'] });
              }}
            >
              <Field label="Tipo">
                <select
                  value={draft.newAddress.tipo}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, tipo: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Endereços'}
                >
                  <option value="">Selecione</option>
                  <option value="residencial">Residencial</option>
                  <option value="correspondencia">Correspondência</option>
                  <option value="outro">Outro</option>
                </select>
              </Field>
              <Field label="CEP" error={cepError}>
                <div className={`cep-input-wrapper ${cepLoading ? 'is-loading' : ''}`}>
                  <input
                    value={formatCep(draft.newAddress.cep)}
                    onChange={(event) => handleCepChange(event.target.value)}
                    onBlur={handleCepBlur}
                    disabled={!isEditor || editingSection !== 'Endereços'}
                  />
                  <span className="cep-spinner" aria-hidden="true" />
                </div>
              </Field>
              <Field label="Logradouro">
                <input
                  value={draft.newAddress.logradouro}
                  onChange={(event) => handleAddressFieldChange('logradouro', event.target.value)}
                  className={isAutoFilled('logradouro') ? 'input-autofilled' : ''}
                  disabled={!isEditor || editingSection !== 'Endereços'}
                />
              </Field>
              <Field label="Número">
                <input
                  value={draft.newAddress.numero}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, numero: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Endereços'}
                />
              </Field>
              <Field label="Complemento">
                <input
                  value={draft.newAddress.complemento}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, complemento: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Endereços'}
                />
              </Field>
              <Field label="Bairro">
                <input
                  value={draft.newAddress.bairro}
                  onChange={(event) => handleAddressFieldChange('bairro', event.target.value)}
                  className={isAutoFilled('bairro') ? 'input-autofilled' : ''}
                  disabled={!isEditor || editingSection !== 'Endereços'}
                />
              </Field>
              <Field label="Cidade">
                <input
                  value={draft.newAddress.cidade}
                  onChange={(event) => handleAddressFieldChange('cidade', event.target.value)}
                  className={isAutoFilled('cidade') ? 'input-autofilled' : ''}
                  disabled={!isEditor || editingSection !== 'Endereços'}
                />
              </Field>
              <Field label="UF">
                <input
                  value={draft.newAddress.uf}
                  onChange={(event) => handleAddressFieldChange('uf', event.target.value)}
                  className={isAutoFilled('uf') ? 'input-autofilled' : ''}
                  disabled={!isEditor || editingSection !== 'Endereços'}
                />
              </Field>
              <Field label="Principal">
                <input
                  type="checkbox"
                  checked={draft.newAddress.principal}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, principal: event.target.checked } }))}
                  disabled={!isEditor || editingSection !== 'Endereços'}
                />
              </Field>
              <button className="button primary" type="submit" disabled={!isEditor || editingSection !== 'Endereços'}>
                Adicionar endereço
              </button>
            </form>
            <div className="card">
              <ul className="list">
                {draft.addresses.map((item) => (
                  <li key={item.id} className="list-item">
                    {item.tipo} · {item.logradouro}, {item.numero} · {item.cidade}-{item.uf} {item.principal ? '★' : ''}
                    {isEditor ? (
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => {
                          removeCollaboratorAddress(user, item.id);
                          refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['addresses'] });
                        }}
                      >
                        Remover
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'Relacionamentos' && (
          <div className="form-grid">
            <Field label="Estado civil">
              <input
                value={draft.relationships.estadoCivil || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, estadoCivil: event.target.value } }))}
                disabled={editingSection !== 'Relacionamentos'}
              />
            </Field>
            <Field label="Contato emergência">
              <input
                value={draft.relationships.contatoEmergenciaNome || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, contatoEmergenciaNome: event.target.value } }))}
                disabled={editingSection !== 'Relacionamentos'}
              />
            </Field>
            <Field label="Telefone emergência">
              <input
                value={formatPhone(draft.relationships.contatoEmergenciaTelefone || '')}
                onChange={(event) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, contatoEmergenciaTelefone: event.target.value } }))}
                disabled={editingSection !== 'Relacionamentos'}
              />
            </Field>
          </div>
        )}

        {activeSection === 'Características' && (
          <div className="form-grid">
            <Field label="Observações gerais">
              <textarea
                value={draft.characteristics.observacoesGerais || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, characteristics: { ...prev.characteristics, observacoesGerais: event.target.value } }))}
                disabled={editingSection !== 'Características'}
              />
            </Field>
          </div>
        )}

        {activeSection === 'Dados Adicionais' && (
          <div className="form-grid">
            <Field label="Notas internas">
              <textarea
                value={draft.additional.notes || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, additional: { ...prev.additional, notes: event.target.value } }))}
                disabled={editingSection !== 'Dados Adicionais'}
              />
            </Field>
          </div>
        )}

        {activeSection === 'Convênios' && (
          <div className="stack">
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                if (!selectedId) return;
                addCollaboratorInsurance(user, selectedId, draft.newInsurance);
                setDraft((prev) => ({ ...prev, newInsurance: { convenioNome: '', detalhes: '', validade: '' } }));
                refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['insurances'] });
              }}
            >
              <Field label="Convênio">
                <input
                  value={draft.newInsurance.convenioNome}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, convenioNome: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Convênios'}
                />
              </Field>
              <Field label="Detalhes">
                <input
                  value={draft.newInsurance.detalhes}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, detalhes: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Convênios'}
                />
              </Field>
              <Field label="Validade">
                <input
                  type="date"
                  value={draft.newInsurance.validade}
                  onChange={(event) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, validade: event.target.value } }))}
                  disabled={!isEditor || editingSection !== 'Convênios'}
                />
              </Field>
              <button className="button primary" type="submit" disabled={!isEditor || editingSection !== 'Convênios'}>
                Adicionar convênio
              </button>
            </form>
            <div className="card">
              <ul className="list">
                {draft.insurances.map((item) => (
                  <li key={item.id} className="list-item">
                    {item.convenioNome} · {item.validade || 'Sem validade'}
                    {isEditor ? (
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => {
                          removeCollaboratorInsurance(user, item.id);
                          refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['insurances'] });
                        }}
                      >
                        Remover
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeSection === 'Dados de Acesso' && (
          <div className="form-grid">
            <Field label="Usuário vinculado">
              <select
                value={draft.access.userId || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, access: { ...prev.access, userId: event.target.value } }))}
                disabled={!canAccess || editingSection !== 'Dados de Acesso'}
              >
                <option value="">Selecione um usuário para login</option>
                {db.users.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="muted" style={{ marginTop: '0.25rem' }}>
              Perfil e permissões são definidos na aba <strong>Acessos</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const admissionContent = (
    <div className="stack">
      <SectionHeaderActions
        title="Dados Admissionais"
        isEditing={editingTab === 'admissao'}
        onEdit={isEditor ? () => startTabEdit('admissao') : null}
        onCancel={cancelEdit}
        onSave={() => {
          updateCollaboratorDocuments(user, selectedId, draft.documents);
          setEditingTab('');
          refreshCollaboratorDraft();
          setSuccess('Dados admissionais salvos.');
        }}
        loading={false}
      />
      <div className="form-grid">
        <Field label="Tipo de contratação">
          <select
            value={draft.documents.tipoContratacao || ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, tipoContratacao: event.target.value } }))}
            disabled={!isEditor || editingTab !== 'admissao'}
          >
            <option value="">Selecione</option>
            <option value="CLT">CLT</option>
            <option value="PJ">PJ</option>
            <option value="Prestador">Prestador</option>
            <option value="Estágio">Estágio</option>
          </select>
        </Field>
        <Field label="Data de admissão">
          <input
            type="date"
            value={draft.documents.dataAdmissao || ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, dataAdmissao: event.target.value } }))}
            disabled={!isEditor || editingTab !== 'admissao'}
          />
        </Field>
        <Field label="Data de demissão">
          <input
            type="date"
            value={draft.documents.dataDemissao || ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, dataDemissao: event.target.value } }))}
            disabled={!isEditor || editingTab !== 'admissao'}
          />
        </Field>
      </div>
    </div>
  );

  const hoursContent = (
    <div className="stack">
      <SectionHeaderActions
        title="Horários"
        isEditing={editingTab === 'horarios'}
        onEdit={isEditor ? () => startTabEdit('horarios') : null}
        onCancel={cancelEdit}
        onSave={() => {
          const normalized = normalizeWorkHours(draft.workHours);
          try {
            updateCollaboratorWorkHours(user, selectedId, normalized);
            setHoursConflictModal({ open: false, conflicts: [] });
            setEditingTab('');
            refreshCollaboratorDraft();
            setSuccess('Horários salvos.');
          } catch (err) {
            if (err?.code === 'WORK_HOURS_CONFLICT') {
              setHoursConflictModal({
                open: true,
                conflicts: err?.details?.conflicts || [],
              });
              setError(
                err.message ||
                  'A nova grade remove horário com pacientes agendados no trecho afetado. Reagende-os antes de salvar.'
              );
              return;
            }
            setError(err?.message || 'Erro ao salvar horários.');
          }
        }}
        loading={false}
      />
      <div className="stack">
        <div className="hours-row hours-row-header">
          <strong>Dia</strong>
          <span>Ativo</span>
          <span>Início</span>
          <span>Fim</span>
          <span>Intervalo Início</span>
          <span>Intervalo Fim</span>
        </div>
        {normalizeWorkHours(draft.workHours).map((item, idx) => {
          const updateWorkHour = (field, value) => {
            const normalized = normalizeWorkHours(draft.workHours);
            const updated = normalized.map((h, i) => 
              i === idx ? { ...h, [field]: value } : h
            );
            setDraft((prev) => ({ ...prev, workHours: updated }));
          };
          const inicioValue = item.inicio && /^\d{2}:\d{2}$/.test(item.inicio) ? item.inicio : '08:00';
          const fimValue = item.fim && /^\d{2}:\d{2}$/.test(item.fim) ? item.fim : '12:00';
          const intervaloInicioValue = item.intervaloInicio && /^\d{2}:\d{2}$/.test(item.intervaloInicio) ? item.intervaloInicio : '13:00';
          const intervaloFimValue = item.intervaloFim && /^\d{2}:\d{2}$/.test(item.intervaloFim) ? item.intervaloFim : '18:00';
          return (
          <div key={item.diaSemana} className="hours-row">
            <strong>{dayLabels[item.diaSemana]}</strong>
            <label className="hours-checkbox-label">
              <input
                type="checkbox"
                checked={item.ativo}
                onChange={(event) => updateWorkHour('ativo', event.target.checked)}
                disabled={!isEditor || editingTab !== 'horarios'}
              />
              <span>Ativo</span>
            </label>
            <div className="hours-time-wrapper">
              {(editingTab !== 'horarios' || !item.ativo) ? (
                <div className="hours-time-display">{inicioValue}</div>
              ) : (
                <input
                  type="time"
                  value={inicioValue}
                  onChange={(event) => updateWorkHour('inicio', event.target.value)}
                  disabled={!isEditor}
                  aria-label={`Início ${dayLabels[item.diaSemana]}`}
                />
              )}
            </div>
            <div className="hours-time-wrapper">
              {(editingTab !== 'horarios' || !item.ativo) ? (
                <div className="hours-time-display">{fimValue}</div>
              ) : (
                <input
                  type="time"
                  value={fimValue}
                  onChange={(event) => updateWorkHour('fim', event.target.value)}
                  disabled={!isEditor}
                  aria-label={`Fim ${dayLabels[item.diaSemana]}`}
                />
              )}
            </div>
            <div className="hours-time-wrapper">
              {(editingTab !== 'horarios' || !item.ativo) ? (
                <div className="hours-time-display">{intervaloInicioValue}</div>
              ) : (
                <input
                  type="time"
                  value={intervaloInicioValue}
                  onChange={(event) => updateWorkHour('intervaloInicio', event.target.value)}
                  disabled={!isEditor}
                  aria-label={`Intervalo início ${dayLabels[item.diaSemana]}`}
                />
              )}
            </div>
            <div className="hours-time-wrapper">
              {(editingTab !== 'horarios' || !item.ativo) ? (
                <div className="hours-time-display">{intervaloFimValue}</div>
              ) : (
                <input
                  type="time"
                  value={intervaloFimValue}
                  onChange={(event) => updateWorkHour('intervaloFim', event.target.value)}
                  disabled={!isEditor}
                  aria-label={`Intervalo fim ${dayLabels[item.diaSemana]}`}
                />
              )}
            </div>
          </div>
        )})}
      </div>
    </div>
  );

  const financeContent = (
    <div className="stack">
      <SectionHeaderActions
        title="Financeiro"
        isEditing={editingTab === 'financeiro'}
        onEdit={canFinance ? () => startTabEdit('financeiro') : null}
        onCancel={cancelEdit}
        onSave={() => {
          updateCollaboratorFinance(user, selectedId, draft.finance);
          setEditingTab('');
          refreshCollaboratorDraft();
          setSuccess('Financeiro salvo.');
        }}
        loading={false}
      />
      <div className="form-grid">
        <Field label="Tipo de remuneração">
          <select
            value={draft.finance.tipoRemuneracao || ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, finance: { ...prev.finance, tipoRemuneracao: event.target.value } }))}
            disabled={!canFinance || editingTab !== 'financeiro'}
          >
            <option value="">Selecione</option>
            <option value="fixo">Fixo</option>
            <option value="comissao">Comissão</option>
            <option value="misto">Misto</option>
          </select>
        </Field>
        <Field label="Percentual de comissão">
          <input
            type="number"
            step="0.01"
            value={draft.finance.percentualComissao || 0}
            onChange={(event) => setDraft((prev) => ({ ...prev, finance: { ...prev.finance, percentualComissao: event.target.value } }))}
            disabled={!canFinance || editingTab !== 'financeiro'}
          />
        </Field>
        <Field label="Valor fixo">
          <input
            type="number"
            value={draft.finance.valorFixo || 0}
            onChange={(event) => setDraft((prev) => ({ ...prev, finance: { ...prev.finance, valorFixo: event.target.value } }))}
            disabled={!canFinance || editingTab !== 'financeiro'}
          />
        </Field>
        <Field label="Pró-labore">
          <input
            type="number"
            value={draft.finance.proLabore || 0}
            onChange={(event) => setDraft((prev) => ({ ...prev, finance: { ...prev.finance, proLabore: event.target.value } }))}
            disabled={!canFinance || editingTab !== 'financeiro'}
          />
        </Field>
        <Field label="Conta bancária">
          <input
            value={draft.finance.contaBancaria || ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, finance: { ...prev.finance, contaBancaria: event.target.value } }))}
            disabled={!canFinance || editingTab !== 'financeiro'}
          />
        </Field>
        <Field label="Observações">
          <textarea
            value={draft.finance.observacoes || ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, finance: { ...prev.finance, observacoes: event.target.value } }))}
            disabled={!canFinance || editingTab !== 'financeiro'}
          />
        </Field>
      </div>
    </div>
  );

  const accessContent = (
    <div className="stack">
      <SectionHeaderActions
        title="Acessos"
        isEditing={editingTab === 'acessos'}
        onEdit={canAccess ? () => startTabEdit('acessos') : null}
        onCancel={cancelEdit}
        onSave={null}
        loading={false}
      />
      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}
      <AccessTab
        collaboratorId={selectedId}
        targetUserId={draft.access.userId || draft.profile?.user_id || null}
        currentUser={user}
        canEdit={canEditAcessos}
        onVincularUsuario={canAccess ? () => { setActiveTab('cadastro'); setActiveSection('Dados de Acesso'); startEdit('Dados de Acesso'); } : undefined}
        onSaveSuccess={() => {
          setError('');
          if (draft.access.userId) {
            const access = getUserAccess(draft.access.userId);
            if (access) {
              updateCollaboratorAccess(user, selectedId, { ...draft.access, role: access.role });
            }
          }
          refreshCollaboratorDraft();
          setSuccess('Acessos salvos.');
        }}
        onSaveError={(msg) => setError(msg)}
      />
    </div>
  );

  const tabContent = () => {
    if (activeTab === 'cadastro') return cadastroContent;
    if (activeTab === 'admissao') return admissionContent;
    if (activeTab === 'horarios') return hoursContent;
    if (activeTab === 'financeiro') return financeContent;
    if (activeTab === 'acessos') return accessContent;
    return null;
  };

  return (
    <div className="stack">
      <Section title="Colaboradores">
        <div className="collaborator-list">
          <div className="form-grid collaborator-list-filters">
            <Field label="Busca">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome" />
            </Field>
            <Field label="Cargo">
              <select value={filter.cargo} onChange={(event) => setFilter({ ...filter, cargo: event.target.value })}>
                <option value="">Todos</option>
                {getAllCargosFlat().map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="list-actions">
            <button className="button secondary" type="button" onClick={refreshCollaboratorsListOnly}>
              Atualizar
            </button>
            <button className="button primary" type="button" onClick={openCreateCollaborator} disabled={!isEditor}>
              Novo Colaborador
            </button>
          </div>
          <div className="card collaborator-directory">
            <div
              className="collaborator-directory-status-rail"
              role="tablist"
              aria-label="Equipe por status"
            >
              <button
                type="button"
                role="tab"
                className={`collaborator-directory-status-tab ${directoryStatusTab === 'ativo' ? 'is-active' : ''}`}
                aria-selected={directoryStatusTab === 'ativo'}
                id="collab-tab-ativos"
                onClick={() => setDirectoryStatusTab('ativo')}
              >
                Ativos
                <span className="collaborator-directory-status-count">{directoryStatusCounts.ativos}</span>
              </button>
              <button
                type="button"
                role="tab"
                className={`collaborator-directory-status-tab ${directoryStatusTab === 'inativo' ? 'is-active' : ''}`}
                aria-selected={directoryStatusTab === 'inativo'}
                id="collab-tab-inativos"
                onClick={() => setDirectoryStatusTab('inativo')}
              >
                Inativos
                <span className="collaborator-directory-status-count">{directoryStatusCounts.inativos}</span>
              </button>
            </div>
            {filteredCollaborators.length === 0 ? (
              <p className="muted collaborator-directory-empty">Sem colaboradores para os filtros atuais.</p>
            ) : (
              <>
                <div className="collaborator-directory-scroll">
                  <div className="collaborator-directory-sheet" role="table" aria-label="Lista de colaboradores">
                    <div className="collaborator-directory-header" role="row">
                      <div role="columnheader">Nome do colaborador</div>
                      <div role="columnheader">Categoria</div>
                      <div role="columnheader">Cargo</div>
                      <div role="columnheader">Especialidade</div>
                      <div role="columnheader">Status</div>
                      <div role="columnheader">Contato</div>
                      <div role="columnheader" className="collaborator-directory-header-actions">
                        Ações
                      </div>
                    </div>
                    {filteredCollaborators.map((item) => {
                      const { primary: namePrimary, subtitle: nameSubtitle } = getCollaboratorNameDisplay(item);
                      return (
                      <div
                        key={item.id}
                        role="row"
                        className={`collaborator-directory-row ${selectedId === item.id ? 'is-selected' : ''}`}
                        onClick={() => handleViewCollaborator(item.id)}
                      >
                        <div role="cell" className="collaborator-directory-cell collaborator-directory-cell--name">
                          <div className="collaborator-main-cell">
                            <div className="collaborator-avatar" aria-hidden>
                              {getCollaboratorInitials(item)}
                            </div>
                            <div className="collaborator-name-block">
                              <span className="collaborator-name-primary" title={namePrimary}>
                                {namePrimary}
                              </span>
                              {nameSubtitle ? (
                                <span className="collaborator-name-subtitle" title={nameSubtitle}>
                                  {nameSubtitle}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div role="cell" className="collaborator-directory-cell collaborator-directory-cell--category">
                          <span className="collaborator-cell-truncate" title={item.rhCategoria || '—'}>
                            {item.rhCategoria || '—'}
                          </span>
                        </div>
                        <div role="cell" className="collaborator-directory-cell collaborator-directory-cell--cargo">
                          <span className="collaborator-cell-truncate" title={item.cargo || '—'}>
                            {item.cargo || '—'}
                          </span>
                        </div>
                        <div role="cell" className="collaborator-directory-cell collaborator-directory-cell--specialty">
                          <span className="collaborator-cell-truncate" title={getCollaboratorSpecialty(item)}>
                            {getCollaboratorSpecialty(item)}
                          </span>
                        </div>
                        <div role="cell" className="collaborator-directory-cell collaborator-directory-cell--status">
                          <span className={`status-badge ${isCollaboratorActive(item) ? '' : 'inactive'}`}>
                            {getStatusLabel(item.status)}
                          </span>
                        </div>
                        <div role="cell" className="collaborator-directory-cell collaborator-directory-cell--contact">
                          <span className="collaborator-cell-truncate" title={getCollaboratorContact(item)}>
                            {getCollaboratorContact(item)}
                          </span>
                        </div>
                        <div
                          role="cell"
                          className="collaborator-directory-cell collaborator-directory-cell--actions"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="collaborator-row-actions collaborator-row-actions--icons">
                            <button
                              type="button"
                              className="collaborator-icon-btn"
                              title="Visualizar perfil"
                              aria-label="Visualizar perfil"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleViewCollaborator(item.id);
                              }}
                            >
                              <Eye size={16} strokeWidth={2} aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="collaborator-icon-btn"
                              title="Editar colaborador"
                              aria-label="Editar colaborador"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEditCollaborator(item.id);
                              }}
                              disabled={!isEditor}
                            >
                              <Pencil size={16} strokeWidth={2} aria-hidden />
                            </button>
                            <button
                              type="button"
                              className={`collaborator-icon-btn ${
                                isCollaboratorActive(item)
                                  ? 'collaborator-icon-btn--deactivate'
                                  : 'collaborator-icon-btn--activate'
                              }`}
                              title={isCollaboratorActive(item) ? 'Desativar colaborador' : 'Ativar colaborador'}
                              aria-label={isCollaboratorActive(item) ? 'Desativar colaborador' : 'Ativar colaborador'}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleToggleCollaboratorStatus(item);
                              }}
                              disabled={!isEditor}
                            >
                              {isCollaboratorActive(item) ? (
                                <UserX size={16} strokeWidth={2} aria-hidden />
                              ) : (
                                <UserCheck size={16} strokeWidth={2} aria-hidden />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                </div>

                <div className="collaborator-directory-cards">
                  {filteredCollaborators.map((item) => {
                    const { primary: namePrimary, subtitle: nameSubtitle } = getCollaboratorNameDisplay(item);
                    return (
                    <article
                      key={`${item.id}-card`}
                      className={`collaborator-directory-card ${selectedId === item.id ? 'is-selected' : ''}`}
                      onClick={() => handleViewCollaborator(item.id)}
                    >
                      <div className="collaborator-main-cell">
                        <div className="collaborator-avatar" aria-hidden>
                          {getCollaboratorInitials(item)}
                        </div>
                        <div className="collaborator-name-block">
                          <span className="collaborator-name-primary" title={namePrimary}>
                            {namePrimary}
                          </span>
                          {nameSubtitle ? (
                            <span className="collaborator-name-subtitle" title={nameSubtitle}>
                              {nameSubtitle}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="collaborator-card-grid">
                        <span><strong>Categoria:</strong> {item.rhCategoria || '—'}</span>
                        <span><strong>Cargo:</strong> {item.cargo || '—'}</span>
                        <span><strong>Especialidade:</strong> {getCollaboratorSpecialty(item)}</span>
                        <span><strong>Contato:</strong> {getCollaboratorContact(item)}</span>
                        <span>
                          <strong>Status:</strong>{' '}
                          <span className={`status-badge ${isCollaboratorActive(item) ? '' : 'inactive'}`}>
                            {getStatusLabel(item.status)}
                          </span>
                        </span>
                      </div>
                      <div className="collaborator-row-actions collaborator-row-actions--icons">
                        <button
                          type="button"
                          className="collaborator-icon-btn"
                          title="Visualizar perfil"
                          aria-label="Visualizar perfil"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleViewCollaborator(item.id);
                          }}
                        >
                          <Eye size={16} strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="collaborator-icon-btn"
                          title="Editar colaborador"
                          aria-label="Editar colaborador"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEditCollaborator(item.id);
                          }}
                          disabled={!isEditor}
                        >
                          <Pencil size={16} strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className={`collaborator-icon-btn ${
                            isCollaboratorActive(item)
                              ? 'collaborator-icon-btn--deactivate'
                              : 'collaborator-icon-btn--activate'
                          }`}
                          title={isCollaboratorActive(item) ? 'Desativar colaborador' : 'Ativar colaborador'}
                          aria-label={isCollaboratorActive(item) ? 'Desativar colaborador' : 'Ativar colaborador'}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleCollaboratorStatus(item);
                          }}
                          disabled={!isEditor}
                        >
                          {isCollaboratorActive(item) ? (
                            <UserX size={16} strokeWidth={2} aria-hidden />
                          ) : (
                            <UserCheck size={16} strokeWidth={2} aria-hidden />
                          )}
                        </button>
                      </div>
                    </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </Section>

      {selectedId ? (
        <Section title="Ficha do Colaborador">
          <Tabs tabs={topTabs} active={activeTab} onChange={handleTabChange} />
          {tabContent()}
        </Section>
      ) : (
        <div className="card muted">Selecione um colaborador para visualizar os detalhes.</div>
      )}

      <CollaboratorCreateModal
        open={isCreateFlow && isEditor}
        user={user}
        onClose={closeCreateCollaborator}
        onSaved={handleCollaboratorCreated}
      />

      {hoursConflictModal.open && (
        <div className="modal-overlay" role="presentation">
          <div
            className="modal-content modal-content-large collaborator-hours-conflict-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Conflito de agenda"
          >
            <div className="collaborator-hours-conflict-modal__header">
              <h3>Conflito ao reduzir disponibilidade</h3>
            </div>
            <p className="muted collaborator-hours-conflict-modal__description">
              Esta alteração remove parte da agenda já disponível e há pacientes agendados no trecho afetado.
              Para não perder esses agendamentos, reagende-os antes de concluir a alteração na grade de horários.
            </p>

            <div className="table-wrapper collaborator-hours-conflict-modal__table-wrapper">
              <table className="collaborator-hours-conflict-table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Data</th>
                    <th>Horário</th>
                    <th>Procedimento</th>
                    <th>Profissional</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {hoursConflictModal.conflicts.map((conflict) => (
                    <tr key={conflict.appointmentId}>
                      <td className="cell-patient">{conflict.patientName || '—'}</td>
                      <td>{formatDatePtBr(conflict.date)}</td>
                      <td>{`${conflict.startTime || '—'} - ${conflict.endTime || '—'}`}</td>
                      <td className="cell-procedure">{conflict.procedureName || '—'}</td>
                      <td className="cell-professional">{conflict.professionalName || '—'}</td>
                      <td>
                        <span className={`collaborator-hours-conflict-status ${getConflictStatusClass(conflict.status)}`}>
                          {conflict.status || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="inline-actions collaborator-hours-conflict-modal__footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setHoursConflictModal((prev) => ({ ...prev, open: false }))}
              >
                Cancelar fechamento
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  const table = document.querySelector('.modal-content .table-wrapper');
                  if (table && typeof table.scrollIntoView === 'function') {
                    table.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
              >
                Ver agendamentos conflitantes
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  const firstConflict = hoursConflictModal.conflicts[0];
                  navigate('/gestao/agenda', {
                    state: {
                      selectedProfessionalId: selectedId,
                      highlightDate: firstConflict?.date || null,
                      conflictAppointmentIds: hoursConflictModal.conflicts.map((item) => item.appointmentId),
                    },
                  });
                }}
              >
                Reagendar paciente(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
