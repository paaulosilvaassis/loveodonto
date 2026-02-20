import { useEffect, useMemo, useState } from 'react';
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
  createCollaborator,
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
import AccessTab from '../components/access/AccessTab.jsx';
import { getUserAccess } from '../services/accessService.js';

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

export default function CollaboratorsPage() {
  const { user } = useAuth();
  const [collaborators, setCollaborators] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ status: '', cargo: '' });
  const [activeTab, setActiveTab] = useState('cadastro');
  const [activeSection, setActiveSection] = useState('Dados Principais');
  const [editingSection, setEditingSection] = useState('');
  const [editingTab, setEditingTab] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
  const canEditAcessos = user?.role === 'admin' || user?.isMaster;

  const refresh = () => {
    const list = listCollaborators(filter);
    setCollaborators(list);
    if (selectedId) {
      const data = getCollaborator(selectedId);
      if (data) {
        setDraft((prev) => ({
          ...prev,
          ...data,
          workHours: normalizeWorkHours(data.workHours),
          newPhone: prev.newPhone,
          newAddress: prev.newAddress,
          newEducation: prev.newEducation,
          newInsurance: prev.newInsurance,
        }));
      }
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (activeTab === 'acessos' && selectedId && import.meta.env?.DEV) {
      const data = getCollaborator(selectedId);
      console.debug('[Acessos] collaborator loaded', { access: data?.access, profileId: data?.profile?.id, targetUserId: data?.access?.userId ?? data?.profile?.user_id });
    }
  }, [activeTab, selectedId]);

  const filteredCollaborators = useMemo(() => {
    return collaborators.filter((item) =>
      item.nomeCompleto?.toLowerCase().includes(search.toLowerCase()) ||
      item.apelido?.toLowerCase().includes(search.toLowerCase())
    );
  }, [collaborators, search]);

  const handleCreate = () => {
    setError('');
    try {
      const created = createCollaborator(user, {
        apelido: 'Novo colaborador',
        nomeCompleto: 'Novo colaborador',
        cargo: 'Recepção',
        status: 'ativo',
      });
      setSelectedId(created.id);
      refresh();
      setSuccess('Colaborador criado.');
    } catch (err) {
      setError(err.message);
    }
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
      refresh();
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
      uploadCollaboratorPhoto(user, selectedId, { type: file.type, size: file.size, dataUrl: reader.result });
      refresh();
    };
    reader.readAsDataURL(file);
  };

  const db = loadDb();

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
          <div className="form-grid">
            <Field label="Apelido">
              <input
                value={draft.profile.apelido || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, apelido: event.target.value } }))}
                disabled={editingSection !== 'Dados Principais'}
              />
            </Field>
            <Field label="Nome Completo">
              <input
                value={draft.profile.nomeCompleto || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, nomeCompleto: event.target.value } }))}
                disabled={editingSection !== 'Dados Principais'}
              />
            </Field>
            <Field label="Cargo">
              <select
                value={draft.profile.cargo || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, cargo: event.target.value } }))}
                disabled={editingSection !== 'Dados Principais'}
              >
                <option value="">Selecione</option>
                <option value="Dentista">Dentista</option>
                <option value="Ortodontista">Ortodontista</option>
                <option value="Recepção">Recepção</option>
                <option value="ASB/TSB">ASB/TSB</option>
                <option value="Financeiro">Financeiro</option>
                <option value="Gerente">Gerente</option>
              </select>
            </Field>
            <Field label="Status">
              <select
                value={draft.profile.status || 'ativo'}
                onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, status: event.target.value } }))}
                disabled={editingSection !== 'Dados Principais'}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </Field>
            <Field label="Nome Social">
              <input
                value={draft.profile.nomeSocial || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, nomeSocial: event.target.value } }))}
                disabled={editingSection !== 'Dados Principais'}
              />
            </Field>
            <Field label="Especialidades">
              <input
                value={(draft.profile.especialidades || []).join(', ')}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    profile: { ...prev.profile, especialidades: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) },
                  }))
                }
                disabled={editingSection !== 'Dados Principais'}
              />
            </Field>
            <Field label="Registro Profissional">
              <input
                value={draft.profile.registroProfissional || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, registroProfissional: event.target.value } }))}
                disabled={editingSection !== 'Dados Principais'}
              />
            </Field>
            <Field label="E-mail">
              <input
                type="email"
                value={draft.profile.email || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, email: event.target.value } }))}
                disabled={editingSection !== 'Dados Principais'}
              />
            </Field>
            <Field label="Foto">
              {draft.profile.fotoUrl ? <img className="logo-preview" src={draft.profile.fotoUrl} alt="Foto" /> : null}
              <input type="file" accept="image/png,image/jpeg" onChange={handlePhotoUpload} disabled={editingSection !== 'Dados Principais'} />
            </Field>
          </div>
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
                refresh();
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
                      <button className="button secondary" type="button" onClick={() => removeCollaboratorEducation(user, item.id)}>
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
                refresh();
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
                      <button className="button secondary" type="button" onClick={() => removeCollaboratorPhone(user, item.id)}>
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
                refresh();
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
                      <button className="button secondary" type="button" onClick={() => removeCollaboratorAddress(user, item.id)}>
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
                refresh();
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
                      <button className="button secondary" type="button" onClick={() => removeCollaboratorInsurance(user, item.id)}>
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
          refresh();
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
          updateCollaboratorWorkHours(user, selectedId, normalized);
          setEditingTab('');
          refresh();
          setSuccess('Horários salvos.');
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
          // #region agent log
          const renderValues = {diaSemana:item.diaSemana,ativo:item.ativo,inicio:item.inicio,fim:item.fim,intervaloInicio:item.intervaloInicio,intervaloFim:item.intervaloFim,inicioType:typeof item.inicio,fimType:typeof item.fim,intervaloInicioType:typeof item.intervaloInicio,intervaloFimType:typeof item.intervaloFim};
          fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/CollaboratorsPage.jsx:933',message:'hours row render values',data:renderValues,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
          // #endregion
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
          const isDisplayMode = editingTab !== 'horarios' || !item.ativo;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/CollaboratorsPage.jsx:950',message:'hours render mode check',data:{diaSemana:item.diaSemana,ativo:item.ativo,editingTab,isDisplayMode,inicioValue,fimValue,intervaloInicioValue,intervaloFimValue},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
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
          refresh();
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
      <AccessTab
        targetUserId={draft.access.userId || draft.profile?.user_id || null}
        currentUser={user}
        canEdit={canEditAcessos}
        onVincularUsuario={canAccess ? () => { setActiveTab('cadastro'); setActiveSection('Dados de Acesso'); startEdit('Dados de Acesso'); } : undefined}
        onSaveSuccess={() => {
          if (draft.access.userId) {
            const access = getUserAccess(draft.access.userId);
            if (access) {
              updateCollaboratorAccess(user, selectedId, { ...draft.access, role: access.role });
            }
          }
          refresh();
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
          <div className="form-grid">
            <Field label="Busca">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome" />
            </Field>
            <Field label="Status">
              <select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </Field>
            <Field label="Cargo">
              <select value={filter.cargo} onChange={(event) => setFilter({ ...filter, cargo: event.target.value })}>
                <option value="">Todos</option>
                <option value="Dentista">Dentista</option>
                <option value="Ortodontista">Ortodontista</option>
                <option value="Recepção">Recepção</option>
                <option value="ASB/TSB">ASB/TSB</option>
                <option value="Financeiro">Financeiro</option>
                <option value="Gerente">Gerente</option>
              </select>
            </Field>
          </div>
          <div className="list-actions">
            <button className="button secondary" type="button" onClick={refresh}>
              Atualizar
            </button>
            <button className="button primary" type="button" onClick={handleCreate} disabled={!isEditor}>
              Novo Colaborador
            </button>
          </div>
          <div className="card">
            <ul className="list">
              {filteredCollaborators.length === 0 ? (
                <li className="muted">Sem colaboradores.</li>
              ) : (
                filteredCollaborators.map((item) => (
                  <li key={item.id} className={`list-item ${selectedId === item.id ? 'selected' : ''}`}>
                    <button type="button" className="list-link" onClick={() => selectCollaborator(item.id)}>
                      <strong>{item.apelido}</strong> · {item.cargo} · {item.status}
                    </button>
                  </li>
                ))
              )}
            </ul>
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
    </div>
  );
}
