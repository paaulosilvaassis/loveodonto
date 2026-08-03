import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { Field } from '../components/Field.jsx';
import { loadDb } from '../db/index.js';
import {
  getCollaborator,
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
  backfillCollaboratorsPendingAccess,
} from '../services/collaboratorService.js';
import { listTenantCollaborators } from '../services/tenantCollaboratorService.js';
import { useCepAutofill } from '../hooks/useCepAutofill.js';
import { validateFileMeta, formatPhone } from '../utils/validators.js';
import { getUserAvatarUrl } from '../utils/avatarUtils.js';
import { can } from '../permissions/permissions.js';
import { canManageAccess, canCreateCollaborator, ROLE_LABELS } from '../services/accessService.js';
import CollaboratorTeamDirectory from '../components/collaborators/CollaboratorTeamDirectory.jsx';
import CollaboratorRecordView from '../components/collaborators/record/CollaboratorRecordView.jsx';
import CollaboratorOverviewSection from '../components/collaborators/record/CollaboratorOverviewSection.jsx';
import CollaboratorAccessSection from '../components/collaborators/record/CollaboratorAccessSection.jsx';
import CollaboratorPermissionsHub from '../components/collaborators/record/CollaboratorPermissionsHub.jsx';
import CollaboratorCadastroTab from '../components/collaborators/CollaboratorCadastroTab.jsx';
import CollaboratorFormCard from '../components/collaborators/CollaboratorFormCard.jsx';
import { reconcileCollaboratorAccessState, setCollaboratorSystemAccessWithRecovery } from '../services/collaboratorAccessRecoveryService.js';
import { getUserAccess } from '../services/accessService.js';
import { NewCollaboratorDialog } from '../components/collaborators/CollaboratorCreateModal.jsx';
import {
  startCollaboratorPerf,
  endCollaboratorPerf,
} from '../services/collaboratorPerfLogService.js';
import {
  resolveCollaboratorAccessDisplayStatus,
} from '../utils/inviteStatus.js';
import { isTenantSystemAccessActive } from '../utils/collaboratorAccessManagement.js';
import IdentityLifecycleModal from '../components/access/IdentityLifecycleModal.jsx';
import {
  deactivateIdentity,
  reactivateIdentity,
} from '../services/identityService.js';
import { isSaasModeEnabled } from '../services/saasAuthService.js';

const CADASTRO_TABS = new Set(['pessoais', 'documentos', 'profissional', 'endereco', 'contatos']);
const EDITABLE_TABS = new Set([...CADASTRO_TABS, 'horarios', 'financeiro']);

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
  const { user } = useAuth();
  const [openNewCollaborator, setOpenNewCollaborator] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ cargo: '', categoria: '', status: 'ativo', acesso: '' });
  const [activeTab, setActiveTab] = useState('geral');
  const [recordLoading, setRecordLoading] = useState(false);
  const [accessDirty, setAccessDirty] = useState(false);
  const [editingSection, setEditingSection] = useState('');
  const [editingTab, setEditingTab] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hoursConflictModal, setHoursConflictModal] = useState({ open: false, conflicts: [] });
  const [tenantAccessMap, setTenantAccessMap] = useState({ byCollaboratorId: {}, byEmail: {} });
  const [identityLifecycle, setIdentityLifecycle] = useState({ open: false, mode: 'deactivate', loading: false });
  const [selectedIdentity, setSelectedIdentity] = useState(null);
  const editFormRef = useRef(null);
  const accessReconcileGenRef = useRef(0);

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

  const isEditor = can(user, 'collaborators:write') || can(user, 'equipe', 'edit');
  const canCreateNewCollaborator = canCreateCollaborator(user);
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
    enabled: isEditor && (editingSection === 'endereco' || editingSection === 'cadastro'),
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

  /** Só atualiza a lista (sidebar); nunca reidrata o rascunho — evita apagar digitação ao clicar em Atualizar. */
  const refreshCollaboratorsListOnly = useCallback(async (options = {}) => {
    const { reconcileLinks = false } = options;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      setCollaborators([]);
      return;
    }
    setListLoading(true);
    setListError('');
    try {
      const bundle = await listTenantCollaborators(tenantId, { bundle: true, reconcileLinks });
      const rows = bundle.collaborators || [];
      setCollaborators(rows);
      const byCollaboratorId = {};
      const byEmail = {};
      for (const row of rows) {
        const tenantUser = row._tenantUser;
        if (!tenantUser?.id) continue;
        if (row.id) byCollaboratorId[row.id] = tenantUser;
        const emailKey = String(row.email || '').trim().toLowerCase();
        if (emailKey) byEmail[emailKey] = tenantUser;
      }
      setTenantAccessMap({ byCollaboratorId, byEmail });
    } catch (err) {
      setListError('Não foi possível carregar colaboradores da clínica.');
      if (import.meta.env?.DEV) {
        console.debug('[CollaboratorsPage] falha ao carregar colaboradores', err?.message);
      }
    } finally {
      setListLoading(false);
    }
  }, [user?.tenantId]);

  const applyDraftFromLocal = useCallback((collaboratorId) => {
    const id = String(collaboratorId || '').trim();
    if (!id) return false;
    const data = getCollaborator(id);
    if (!data) return false;
    setDraft((prev) => ({
      ...prev,
      ...data,
      workHours: normalizeWorkHours(data.workHours),
      newPhone: prev.newPhone,
      newAddress: prev.newAddress,
      newEducation: prev.newEducation,
      newInsurance: prev.newInsurance,
    }));
    return true;
  }, []);

  const refreshTenantAccess = useCallback(async (options = {}) => {
    await refreshCollaboratorsListOnly(options);
  }, [refreshCollaboratorsListOnly]);

  useEffect(() => {
    refreshTenantAccess();
  }, [refreshTenantAccess]);

  useEffect(() => {
    if (!user?.tenantId || !canEditAcessos) return;
    const flagKey = `collab-access-backfill:${user.tenantId}`;
    try {
      if (sessionStorage.getItem(flagKey) === 'done') return;
    } catch {
      return;
    }
    backfillCollaboratorsPendingAccess(user, { provisionMissing: false })
      .then((result) => {
        if ((result.linked || 0) > 0) {
          refreshTenantAccess();
        }
        try {
          sessionStorage.setItem(flagKey, 'done');
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        try {
          sessionStorage.setItem(flagKey, 'done');
        } catch {
          /* ignore */
        }
      });
  }, [user?.tenantId, canEditAcessos, refreshTenantAccess]);

  const resolveCollaboratorTenantAccess = useCallback(
    (item) => {
      if (!item) return null;
      if (item._tenantUser) return item._tenantUser;
      return (
        tenantAccessMap.byCollaboratorId[item.id]
        || tenantAccessMap.byEmail[String(item.email || '').trim().toLowerCase()]
        || null
      );
    },
    [tenantAccessMap],
  );

  const reconcileAccessInBackground = useCallback((collaboratorId, collaboratorRow) => {
    const tenantId = user?.tenantId;
    if (!tenantId || !collaboratorId) return;

    const generation = accessReconcileGenRef.current + 1;
    accessReconcileGenRef.current = generation;
    const perfMark = startCollaboratorPerf('COLLABORATOR_ACCESS_LOAD', { collaboratorId });

    const tenantUser = collaboratorRow
      ? resolveCollaboratorTenantAccess(collaboratorRow)
      : null;

    reconcileCollaboratorAccessState({
      collaboratorId,
      collaborator: collaboratorRow,
      tenantUser,
      tenantId,
      currentUser: user,
      skipRemoteFetch: true,
      skipRemoteLink: true,
    })
      .then((result) => {
        if (accessReconcileGenRef.current !== generation) return;
        endCollaboratorPerf(perfMark, { recovered: Boolean(result.recovered) });
        if (result.recovered) {
          applyDraftFromLocal(collaboratorId);
        }
      })
      .catch(() => {
        if (accessReconcileGenRef.current === generation) {
          endCollaboratorPerf(perfMark, { error: true });
        }
      });
  }, [user, resolveCollaboratorTenantAccess, applyDraftFromLocal]);

  /**
   * Reidrata o draft a partir do DB. Com preserveCurrentEdits, mantém fatias em edição (ex.: Dados Principais).
   * forceMergeKeys: após add phone/education/etc., mescla essas chaves do servidor mesmo em modo preserve.
   */
  const refreshCollaboratorDraft = useCallback(
    async (collaboratorIdOverride, options = {}) => {
      const {
        preserveCurrentEdits = false,
        forceMergeKeys = [],
        refreshList = false,
        reconcileLinks = false,
      } = options;
      const force = new Set(forceMergeKeys);
      if (refreshList) {
        await refreshCollaboratorsListOnly({ reconcileLinks });
      }
      const id = collaboratorIdOverride ?? selectedId;
      if (!id) return;
      const data = getCollaborator(id);
      if (!data) return;

      setDraft((prev) => {
        if (!preserveCurrentEdits) {
          if (import.meta.env?.DEV) {
            console.debug('[CollaboratorsPage] refreshCollaboratorDraft:full', { collaboratorId: id, refreshList });
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
          access: data.access,
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
    [editingSection, editingTab, selectedId, refreshCollaboratorsListOnly]
  );

  const selectedCollaboratorRow = useMemo(
    () => collaborators.find((item) => item.id === selectedId) || null,
    [collaborators, selectedId],
  );

  const selectedTenantAccess = useMemo(
    () => (selectedCollaboratorRow ? resolveCollaboratorTenantAccess(selectedCollaboratorRow) : null),
    [selectedCollaboratorRow, resolveCollaboratorTenantAccess],
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
    if (!openNewCollaborator) return;
    setSelectedId('');
    setEditingSection('');
    setEditingTab('');
    setError('');
    setSuccess('');
  }, [openNewCollaborator]);

  useEffect(() => {
    if (activeTab === 'acesso' && selectedId && import.meta.env?.DEV) {
      const data = getCollaborator(selectedId);
      console.debug('[Acessos] collaborator loaded', { access: data?.access, profileId: data?.profile?.id, targetUserId: data?.access?.userId ?? data?.profile?.user_id });
    }
  }, [activeTab, selectedId]);

  const teamKpis = useMemo(() => {
    let ativos = 0;
    let inativos = 0;
    let comAcesso = 0;
    let convitesPendentes = 0;
    for (const item of collaborators) {
      if (isCollaboratorActive(item)) ativos += 1;
      else inativos += 1;
      const tenantAccess = resolveCollaboratorTenantAccess(item);
      const accessStatus = resolveCollaboratorAccessDisplayStatus(tenantAccess);
      if (['active', 'accepted'].includes(accessStatus.key)) comAcesso += 1;
      if (['sent', 'pending'].includes(accessStatus.key)) convitesPendentes += 1;
    }
    return { ativos, inativos, comAcesso, convitesPendentes };
  }, [collaborators, resolveCollaboratorTenantAccess]);

  const filteredCollaborators = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return collaborators.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.nomeCompleto?.toLowerCase().includes(normalizedSearch) ||
        item.apelido?.toLowerCase().includes(normalizedSearch) ||
        item.email?.toLowerCase().includes(normalizedSearch) ||
        item.cargo?.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        !filter.status
        || (filter.status === 'ativo' ? isCollaboratorActive(item) : !isCollaboratorActive(item));
      const matchesCargo = !filter.cargo || item.cargo === filter.cargo;
      const matchesCategoria = !filter.categoria || item.rhCategoria === filter.categoria;
      const tenantAccess = resolveCollaboratorTenantAccess(item);
      const accessKey = resolveCollaboratorAccessDisplayStatus(tenantAccess).key;
      const matchesAcesso = !filter.acesso || accessKey === filter.acesso;
      return matchesSearch && matchesStatus && matchesCargo && matchesCategoria && matchesAcesso;
    });
  }, [collaborators, search, filter, resolveCollaboratorTenantAccess]);

  const collaboratorPhonesById = useMemo(() => {
    const db = loadDb();
    return (db.collaboratorPhones || []).reduce((acc, item) => {
      if (!item?.collaboratorId) return acc;
      if (!acc[item.collaboratorId]) acc[item.collaboratorId] = [];
      acc[item.collaboratorId].push(item);
      return acc;
    }, {});
  }, [collaborators, selectedId]);

  const selectCollaborator = useCallback((id) => {
    if (editingSection || editingTab) {
      if (!window.confirm('Existem alterações não salvas. Deseja sair?')) return false;
    }

    const perfMark = startCollaboratorPerf('COLLABORATOR_PROFILE_LOAD', { collaboratorId: id });
    setSelectedId(id);
    setEditingSection('');
    setEditingTab('');
    setActiveTab('geral');
    setRecordLoading(false);
    applyDraftFromLocal(id);
    endCollaboratorPerf(perfMark, { source: 'indexeddb' });

    const row = collaborators.find((item) => item.id === id) || null;
    queueMicrotask(() => reconcileAccessInBackground(id, row));
    return true;
  }, [
    editingSection,
    editingTab,
    applyDraftFromLocal,
    collaborators,
    reconcileAccessInBackground,
  ]);

  const handleCollaboratorCreated = async (newId, meta = {}) => {
    setOpenNewCollaborator(false);
    setSelectedId(newId);
    setActiveTab('geral');
    setEditingSection('');
    setEditingTab('');
    setError('');
    await refreshCollaboratorDraft(newId, { refreshList: true, reconcileLinks: true });
    await refreshTenantAccess({ reconcileLinks: true });
    if (meta.successMessage) {
      setSuccess(meta.successMessage);
      return;
    }
    if (meta.duplicateEmail) {
      setSuccess('Colaborador cadastrado. Este e-mail já possui acesso nesta clínica.');
      return;
    }
    if (meta.noAccess) {
      setSuccess('Colaborador cadastrado sem acesso ao sistema.');
      return;
    }
    if (meta.systemAccess && meta.inviteEmail) {
      setSuccess('Colaborador criado e convite de acesso enviado.');
      return;
    }
    if (meta.inviteFailed) {
      setError('Colaborador cadastrado, mas não foi possível criar o acesso. Use a ação Reenviar/Criar acesso na linha do colaborador.');
      return;
    }
    setSuccess('Colaborador cadastrado com sucesso.');
  };

  const handleEditCollaboratorAccess = useCallback((collaboratorId) => {
    if (!collaboratorId) return;
    if (!selectCollaborator(collaboratorId)) return;
    setActiveTab('acesso');
    setError('');
    setTimeout(() => {
      editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [selectCollaborator]);

  const jumpToExistingCollaborator = useCallback(
    ({ id, status }) => {
      if (!id) return;
      setOpenNewCollaborator(false);
      const active = isCollaboratorActive({ status });
      setFilter({ cargo: '', categoria: '', status: active ? 'ativo' : 'inativo', acesso: '' });
      setError('');
      setSuccess(
        active
          ? 'Abrimos o cadastro que já usa esse mesmo registro profissional (CRO).'
          : 'Este colaborador está na lista de Inativos (mesmo CRO). Abrimos a ficha para você editar ou reativar.',
      );
      selectCollaborator(id);
    },
    [selectCollaborator],
  );

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

  const scrollToEditForm = useCallback(() => {
    setTimeout(() => {
      editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, []);

  const handleEditCollaborator = (collaboratorId) => {
    if (!selectCollaborator(collaboratorId)) return;
    setActiveTab('pessoais');
    setEditingTab('');
    setEditingSection('pessoais');
    scrollToEditForm();
  };

  const handleToggleCollaboratorStatus = async (collaborator) => {
    if (!isEditor) return;
    const nextStatus = isCollaboratorActive(collaborator) ? 'inativo' : 'ativo';
    const actionLabel = nextStatus === 'inativo' ? 'desativar' : 'ativar';
    if (!window.confirm(`Deseja ${actionLabel} este colaborador?`)) return;
    try {
      updateCollaborator(user, collaborator.id, { status: nextStatus });
      if (draft?.access?.userId || draft?.profile?.user_id) {
        await setCollaboratorSystemAccessWithRecovery({
          collaboratorId: collaborator.id,
          collaborator,
          tenantUser: resolveCollaboratorTenantAccess(collaborator),
          tenantId: user?.tenantId || '',
          currentUser: user,
          hasSystemAccess: nextStatus === 'ativo',
        }).catch(() => {});
      }
      refreshCollaboratorsListOnly();
      if (selectedId === collaborator.id) {
        setDraft((prev) => ({
          ...prev,
          profile: { ...prev.profile, status: nextStatus },
        }));
      }
      setFilter((prev) => ({ ...prev, status: nextStatus === 'ativo' ? 'ativo' : 'inativo' }));
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

  const computeTenure = (admissionDate) => {
    if (!admissionDate) return '—';
    const start = new Date(`${admissionDate}T12:00:00`);
    if (Number.isNaN(start.getTime())) return '—';
    const now = new Date();
    const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (months < 12) return months <= 1 ? '1 mês' : `${months} meses`;
    const years = Math.floor(months / 12);
    return years === 1 ? '1 ano' : `${years} anos`;
  };

  const computeWorkHoursSummary = (hours = []) => {
    const normalized = normalizeWorkHours(hours);
    const activeDays = normalized.filter((h) => h.ativo);
    const schedule = activeDays.length
      ? activeDays.map((h) => dayLabels[h.diaSemana]).join(', ')
      : '—';
    let totalMinutes = 0;
    for (const item of activeDays) {
      const toMin = (t) => {
        const [h, m] = String(t || '00:00').split(':').map(Number);
        return h * 60 + m;
      };
      totalMinutes += Math.max(0, toMin(item.fim) - toMin(item.inicio) + toMin(item.intervaloFim) - toMin(item.intervaloInicio));
    }
    const totalHours = Math.round(totalMinutes / 60);
    return { schedule, totalHours: totalHours ? `${totalHours}h` : '—' };
  };

  const handleTabChange = (next) => {
    if (editingSection || accessDirty) {
      if (!window.confirm('Existem alterações não salvas. Deseja sair?')) return;
      setEditingSection('');
      setAccessDirty(false);
    }
    if (next === 'acesso') setError('');
    setActiveTab(next);
  };

  const workHoursSummary = useMemo(() => computeWorkHoursSummary(draft.workHours), [draft.workHours]);

  const saveCadastroAll = () => {
    setError('');
    setSuccess('');
    try {
      if (!selectedId) throw new Error('Selecione um colaborador.');
      updateCollaborator(user, selectedId, draft.profile);
      updateCollaboratorDocuments(user, selectedId, draft.documents);
      updateCollaboratorNationality(user, selectedId, draft.nationality);
      updateCollaboratorRelationships(user, selectedId, draft.relationships);
      updateCollaboratorCharacteristics(user, selectedId, draft.characteristics);
      updateCollaboratorAdditional(user, selectedId, draft.additional);
      setEditingSection('');
      refreshCollaboratorDraft(undefined, { refreshList: true });
      setSuccess('Dados salvos com sucesso.');
    } catch (err) {
      setError(err.message);
    }
  };

  const isRecordEditing = useMemo(() => editingSection === activeTab && EDITABLE_TABS.has(activeTab), [activeTab, editingSection]);

  const hasUnsavedChanges = Boolean(editingSection && EDITABLE_TABS.has(editingSection));

  const canEditActiveTab = useMemo(() => {
    if (CADASTRO_TABS.has(activeTab)) return isEditor;
    if (activeTab === 'horarios') return isEditor;
    if (activeTab === 'financeiro') return canFinance;
    return false;
  }, [activeTab, isEditor, canFinance]);

  const saveActiveSection = () => {
    setError('');
    setSuccess('');
    try {
      if (!selectedId) throw new Error('Selecione um colaborador.');
      if (activeTab === 'pessoais') {
        updateCollaborator(user, selectedId, draft.profile);
        updateCollaboratorNationality(user, selectedId, draft.nationality);
        updateCollaboratorRelationships(user, selectedId, draft.relationships);
      } else if (activeTab === 'documentos') {
        updateCollaboratorDocuments(user, selectedId, draft.documents);
        updateCollaboratorCharacteristics(user, selectedId, draft.characteristics);
        updateCollaboratorAdditional(user, selectedId, draft.additional);
      } else if (activeTab === 'profissional') {
        updateCollaborator(user, selectedId, draft.profile);
        updateCollaboratorDocuments(user, selectedId, draft.documents);
      } else if (activeTab === 'endereco' || activeTab === 'contatos') {
        updateCollaboratorRelationships(user, selectedId, draft.relationships);
        updateCollaborator(user, selectedId, draft.profile);
      } else if (activeTab === 'horarios') {
        const normalized = normalizeWorkHours(draft.workHours);
        updateCollaboratorWorkHours(user, selectedId, normalized);
        setHoursConflictModal({ open: false, conflicts: [] });
      } else if (activeTab === 'financeiro') {
        updateCollaboratorFinance(user, selectedId, draft.finance);
      } else {
        saveCadastroAll();
        return;
      }
      setEditingSection('');
      refreshCollaboratorDraft(undefined, { refreshList: true });
      setSuccess('Alterações salvas com sucesso.');
    } catch (err) {
      if (err?.code === 'WORK_HOURS_CONFLICT') {
        setHoursConflictModal({ open: true, conflicts: err?.details?.conflicts || [] });
        setError(err.message || 'Reagende os pacientes antes de salvar.');
        return;
      }
      setError(err?.message || err.message);
    }
  };

  const handleRecordEdit = () => {
    if (!canEditActiveTab) return;
    startEdit(activeTab);
  };

  const handleRecordSave = () => {
    if (CADASTRO_TABS.has(activeTab) || activeTab === 'horarios' || activeTab === 'financeiro') {
      saveActiveSection();
    }
  };

  const handleDiscardChanges = () => {
    cancelEdit();
    setAccessDirty(false);
  };

  const handleEditSection = (section) => {
    setActiveTab(section);
    if (EDITABLE_TABS.has(section) && isEditor) {
      startEdit(section);
    } else if (section === 'acesso' || section === 'permissoes') {
      setEditingSection('');
    }
    scrollToEditForm();
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

  const cadastroTabProps = {
    draft,
    setDraft,
    selectedId,
    user,
    isEditor,
    isEditing: editingSection === activeTab && CADASTRO_TABS.has(activeTab),
    handlePhotoUpload,
    refreshCollaboratorDraft,
    cepLoading,
    cepError,
    handleCepChange,
    handleCepBlur,
    handleAddressFieldChange,
    isAutoFilled,
  };

  const handleToggleSystemAccess = () => {
    if (!canEditAcessos || !selectedCollaboratorRow?.id) return;
    const accessActive = isTenantSystemAccessActive(selectedTenantAccess);
    setIdentityLifecycle({
      open: true,
      mode: accessActive ? 'deactivate' : 'reactivate',
      loading: false,
    });
  };

  const handleIdentityLifecycleConfirm = async (payload) => {
    if (!canEditAcessos || !selectedCollaboratorRow?.id) return;
    const accessActive = isTenantSystemAccessActive(selectedTenantAccess);
    const nextAccess = !accessActive;
    const tenantId = user?.tenantId || '';

    setIdentityLifecycle((prev) => ({ ...prev, loading: true }));
    try {
      if (isSaasModeEnabled() && selectedIdentity?.id) {
        if (nextAccess) {
          await reactivateIdentity(selectedIdentity.id, {
            tenant_id: tenantId,
            reason: payload.reason,
            reason_description: payload.reason_description,
          });
        } else {
          await deactivateIdentity(selectedIdentity.id, {
            tenant_id: tenantId,
            reason: payload.reason,
            reason_description: payload.reason_description,
            expected_return_at: payload.expected_return_at,
            suspended: payload.suspended,
          });
        }
      } else {
        await setCollaboratorSystemAccessWithRecovery({
          collaboratorId: selectedCollaboratorRow.id,
          collaborator: selectedCollaboratorRow,
          tenantUser: selectedTenantAccess,
          tenantId,
          currentUser: user,
          hasSystemAccess: nextAccess,
          lifecycle: payload,
        });
      }
      setIdentityLifecycle({ open: false, mode: 'deactivate', loading: false });
      refreshTenantAccess();
      refreshCollaboratorDraft(selectedId, { preserveCurrentEdits: true });
      setSuccess(nextAccess ? 'Acesso reativado.' : 'Acesso desativado.');
    } catch (err) {
      setIdentityLifecycle((prev) => ({ ...prev, loading: false }));
      setError(err?.message || (nextAccess ? 'Falha ao ativar acesso.' : 'Falha ao desativar acesso.'));
    }
  };

  const handleAccessSaveSuccess = useCallback(({ inviteSent, passwordResetSent, message } = {}) => {
    setError('');
    setAccessDirty(false);
    const effectiveUserId = draft.access?.userId || selectedTenantAccess?.user_id;
    if (effectiveUserId) {
      const access = getUserAccess(effectiveUserId);
      if (access) {
        updateCollaboratorAccess(user, selectedId, { ...draft.access, userId: effectiveUserId, role: access.role });
      }
    }
    refreshCollaboratorDraft(selectedId, { preserveCurrentEdits: true, refreshList: true });
    refreshTenantAccess();
    if (passwordResetSent) {
      setSuccess(message || `Link de redefinição enviado para: ${selectedTenantAccess?.email || ''}`);
    } else {
      setSuccess(inviteSent ? 'Convite enviado.' : 'Acesso salvo.');
    }
  }, [
    draft.access,
    selectedId,
    selectedTenantAccess?.user_id,
    selectedTenantAccess?.email,
    user,
    refreshCollaboratorDraft,
    refreshTenantAccess,
  ]);

  const handleAccessSaveError = useCallback((msg) => setError(msg), []);

  const handleAccessRepairNotice = useCallback((msg) => {
    setError('');
    setSuccess(msg);
  }, []);

  const handleAccessChanged = useCallback(() => {
    refreshTenantAccess();
    setSuccess('Acesso atualizado.');
  }, [refreshTenantAccess]);

  const handleAccessRecovered = useCallback(() => {
    applyDraftFromLocal(selectedId);
    refreshTenantAccess();
  }, [selectedId, applyDraftFromLocal, refreshTenantAccess]);

  const handleAccessGoToProfile = useCallback(() => handleEditSection('contatos'), [handleEditSection]);

  const accessSectionProps = useMemo(() => ({
    collaboratorId: selectedCollaboratorRow?.id,
    targetUserId: draft.access?.userId || draft.profile?.user_id || selectedTenantAccess?.user_id || null,
    tenantUser: selectedTenantAccess,
    collaboratorEmail: String(selectedCollaboratorRow?.email || draft.profile?.email || '').trim().toLowerCase(),
    saasTenantId: user?.tenantId || '',
    linkedDisplayName: (draft.profile?.nomeCompleto || draft.profile?.apelido || selectedCollaboratorRow?.nomeCompleto || '').trim(),
    currentUser: user,
    canEdit: canEditAcessos,
    accessDisplayStatus: resolveCollaboratorAccessDisplayStatus(selectedTenantAccess),
    onToggleSystemAccess: selectedTenantAccess?.id ? handleToggleSystemAccess : undefined,
    onGoToProfile: handleAccessGoToProfile,
    onSaveSuccess: handleAccessSaveSuccess,
    onSaveError: handleAccessSaveError,
    onRepairNotice: handleAccessRepairNotice,
    onAccessChanged: handleAccessChanged,
    onDirtyChange: setAccessDirty,
    onRecovered: handleAccessRecovered,
    onIdentityChange: setSelectedIdentity,
  }), [
    selectedCollaboratorRow,
    draft.access,
    draft.profile,
    selectedTenantAccess,
    user,
    canEditAcessos,
    handleToggleSystemAccess,
    handleAccessGoToProfile,
    handleAccessSaveSuccess,
    handleAccessSaveError,
    handleAccessRepairNotice,
    handleAccessChanged,
    handleAccessRecovered,
  ]);

  const permissionsHubProps = {
    ...accessSectionProps,
    onSaveSuccess: ({ inviteSent } = {}) => {
      setError('');
      setAccessDirty(false);
      const effectiveUserId = draft.access?.userId || selectedTenantAccess?.user_id;
      if (effectiveUserId) {
        const access = getUserAccess(effectiveUserId);
        if (access) {
          updateCollaboratorAccess(user, selectedId, { ...draft.access, userId: effectiveUserId, role: access.role });
        }
      }
      refreshCollaboratorDraft(undefined, { refreshList: true });
      refreshTenantAccess();
      setSuccess(inviteSent ? 'Convite enviado.' : 'Permissões salvas.');
    },
    onDirtyChange: setAccessDirty,
  };

  const hoursContent = (
    <div className="cr-tab-panel">
    <CollaboratorFormCard title="Grade de horários" className="cr-card-legacy" description="Configure a disponibilidade semanal do colaborador na agenda.">
      <div className="stack collaborator-hours-grid">
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
                disabled={!isEditor || editingSection !== 'horarios'}
              />
              <span>Ativo</span>
            </label>
            <div className="hours-time-wrapper">
              {(editingSection !== 'horarios' || !item.ativo) ? (
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
              {(editingSection !== 'horarios' || !item.ativo) ? (
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
              {(editingSection !== 'horarios' || !item.ativo) ? (
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
              {(editingSection !== 'horarios' || !item.ativo) ? (
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
    </CollaboratorFormCard>
    </div>
  );

  const financeContent = (
    <div className="cr-tab-panel">
    <CollaboratorFormCard title="Remuneração e financeiro" className="cr-card-legacy">
      <div className="collaborator-form-grid">
        <Field label="Tipo de remuneração">
          <select
            value={draft.finance.tipoRemuneracao || ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, finance: { ...prev.finance, tipoRemuneracao: event.target.value } }))}
            disabled={!canFinance || editingSection !== 'financeiro'}
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
            disabled={!canFinance || editingSection !== 'financeiro'}
          />
        </Field>
        <Field label="Valor fixo">
          <input
            type="number"
            value={draft.finance.valorFixo || 0}
            onChange={(event) => setDraft((prev) => ({ ...prev, finance: { ...prev.finance, valorFixo: event.target.value } }))}
            disabled={!canFinance || editingSection !== 'financeiro'}
          />
        </Field>
        <Field label="Pró-labore">
          <input
            type="number"
            value={draft.finance.proLabore || 0}
            onChange={(event) => setDraft((prev) => ({ ...prev, finance: { ...prev.finance, proLabore: event.target.value } }))}
            disabled={!canFinance || editingSection !== 'financeiro'}
          />
        </Field>
        <Field label="Conta bancária">
          <input
            value={draft.finance.contaBancaria || ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, finance: { ...prev.finance, contaBancaria: event.target.value } }))}
            disabled={!canFinance || editingSection !== 'financeiro'}
          />
        </Field>
        <Field label="Observações">
          <textarea
            value={draft.finance.observacoes || ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, finance: { ...prev.finance, observacoes: event.target.value } }))}
            disabled={!canFinance || editingSection !== 'financeiro'}
          />
        </Field>
      </div>
    </CollaboratorFormCard>
    </div>
  );

  const tabContent = () => {
    if (activeTab === 'geral') {
      return (
        <CollaboratorOverviewSection
          draft={draft}
          collaborator={selectedCollaboratorRow}
          accessStatus={resolveCollaboratorAccessDisplayStatus(selectedTenantAccess)}
          accessProfile={ROLE_LABELS[selectedTenantAccess?.role || draft.access?.role || ''] || '—'}
          lastInvite={selectedTenantAccess?.invitation?.sent_at ? formatDatePtBr(String(selectedTenantAccess.invitation.sent_at).slice(0, 10)) : '—'}
          workHoursSummary={workHoursSummary}
          formatDate={formatDatePtBr}
          canEdit={isEditor}
          onEditSection={handleEditSection}
        />
      );
    }
    if (CADASTRO_TABS.has(activeTab)) {
      return <CollaboratorCadastroTab {...cadastroTabProps} section={activeTab === 'documentos' ? 'documentacao' : activeTab} />;
    }
    if (activeTab === 'horarios') return hoursContent;
    if (activeTab === 'financeiro') return financeContent;
    if (activeTab === 'acesso') return <CollaboratorAccessSection {...accessSectionProps} />;
    if (activeTab === 'permissoes') return <CollaboratorPermissionsHub {...permissionsHubProps} />;
    return null;
  };

  const recordMenuItems = useMemo(() => {
    const items = [];
    if (canEditAcessos) {
      items.push({ label: 'Ir para acesso', onClick: () => { setActiveTab('acesso'); scrollToEditForm(); } });
      items.push({ label: 'Ir para permissões', onClick: () => { setActiveTab('permissoes'); scrollToEditForm(); } });
    }
    if (isEditor && selectedCollaboratorRow) {
      items.push({
        label: isCollaboratorActive(selectedCollaboratorRow) ? 'Desativar colaborador' : 'Ativar colaborador',
        danger: isCollaboratorActive(selectedCollaboratorRow),
        onClick: () => handleToggleCollaboratorStatus(selectedCollaboratorRow),
      });
    }
    return items;
  }, [canEditAcessos, isEditor, selectedCollaboratorRow, scrollToEditForm]);

  return (
    <div className="team-page-layout stack">
      <CollaboratorTeamDirectory
        kpis={teamKpis}
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        filteredCollaborators={filteredCollaborators}
        selectedId={selectedId}
        canCreateNewCollaborator={canCreateNewCollaborator}
        canEditRh={isEditor}
        canManageAccess={canEditAcessos}
        tenantId={user?.tenantId || ''}
        onRefresh={() => refreshCollaboratorsListOnly({ reconcileLinks: true })}
        onNewCollaborator={() => {
          if (!canCreateNewCollaborator) return;
          setError('');
          setSuccess('');
          setOpenNewCollaborator(true);
        }}
        onSelectCollaborator={handleViewCollaborator}
        onViewCollaborator={handleViewCollaborator}
        onEditCollaborator={handleEditCollaborator}
        onEditPermissions={handleEditCollaboratorAccess}
        onToggleRhStatus={handleToggleCollaboratorStatus}
        onAccessChanged={() => {
          refreshTenantAccess();
          setSuccess('Acesso do colaborador atualizado.');
        }}
        onError={(message) => setError(message)}
        resolveTenantAccess={resolveCollaboratorTenantAccess}
        getCollaboratorInitials={getCollaboratorInitials}
        getCollaboratorNameDisplay={getCollaboratorNameDisplay}
        getCollaboratorSpecialty={getCollaboratorSpecialty}
        getCollaboratorContact={getCollaboratorContact}
        getStatusLabel={getStatusLabel}
        isCollaboratorActive={isCollaboratorActive}
        resolveAccessStatus={resolveCollaboratorAccessDisplayStatus}
      />

      {listError && !selectedId ? <div className="error">{listError}</div> : null}
      {error && !selectedId ? <div className="error">{error}</div> : null}
      {success && !selectedId ? <div className="success">{success}</div> : null}

      {selectedId ? (
        <div ref={editFormRef} className="scroll-mt-24 team-detail-panel collaborator-record-v2">
          <CollaboratorRecordView
            loading={recordLoading}
            displayName={getCollaboratorNameDisplay(selectedCollaboratorRow).primary}
            onBack={() => {
              if ((hasUnsavedChanges || accessDirty) && !window.confirm('Existem alterações não salvas. Deseja sair?')) return;
              setSelectedId('');
              setEditingSection('');
              setAccessDirty(false);
              setError('');
              setSuccess('');
            }}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            hasUnsavedChanges={hasUnsavedChanges}
            accessDirty={accessDirty}
            onDiscard={handleDiscardChanges}
            onSave={handleRecordSave}
            toastMessage={success}
            errorMessage={error}
            menuItems={recordMenuItems}
            headerProps={{
              fotoUrl: getUserAvatarUrl(draft.profile) || getUserAvatarUrl(selectedCollaboratorRow),
              collaborator: selectedCollaboratorRow || draft.profile,
              initials: getCollaboratorInitials(selectedCollaboratorRow),
              displayName: getCollaboratorNameDisplay(selectedCollaboratorRow).primary,
              cargo: selectedCollaboratorRow?.cargo || draft.profile?.cargo,
              categoria: selectedCollaboratorRow?.rhCategoria || draft.profile?.rhCategoria,
              especialidade: getCollaboratorSpecialty(selectedCollaboratorRow),
              rhStatusLabel: getStatusLabel(selectedCollaboratorRow?.status),
              rhActive: isCollaboratorActive(selectedCollaboratorRow),
              accessStatus: resolveCollaboratorAccessDisplayStatus(selectedTenantAccess),
              accessProfile: ROLE_LABELS[selectedTenantAccess?.role || draft.access?.role || ''] || '—',
              ultimoAcesso: selectedTenantAccess?.last_sign_in_at ? formatDatePtBr(String(selectedTenantAccess.last_sign_in_at).slice(0, 10)) : '—',
              isEditing: isRecordEditing,
              canEdit: canEditActiveTab && !['acesso', 'permissoes', 'geral'].includes(activeTab),
              canSave: canEditActiveTab && !['acesso', 'permissoes', 'geral'].includes(activeTab),
              onEdit: handleRecordEdit,
              onSave: handleRecordSave,
              onCancel: cancelEdit,
            }}
          >
            {tabContent()}
          </CollaboratorRecordView>
        </div>
      ) : (
        <div className="team-detail-placeholder card">
          <p className="muted">Selecione um colaborador na lista para visualizar a ficha completa.</p>
        </div>
      )}

      <NewCollaboratorDialog
        open={openNewCollaborator}
        user={user}
        onOpenChange={setOpenNewCollaborator}
        onSaved={handleCollaboratorCreated}
        onOpenExistingCollaborator={jumpToExistingCollaborator}
      />

      <IdentityLifecycleModal
        open={identityLifecycle.open}
        mode={identityLifecycle.mode}
        loading={identityLifecycle.loading}
        onClose={() => setIdentityLifecycle({ open: false, mode: 'deactivate', loading: false })}
        onConfirm={handleIdentityLifecycleConfirm}
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
