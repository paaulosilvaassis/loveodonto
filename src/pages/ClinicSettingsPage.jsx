import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Field } from '../components/Field.jsx';
import { Section } from '../components/Section.jsx';
import { Tabs } from '../components/Tabs.jsx';
import { SectionHeaderActions } from '../components/SectionHeaderActions.jsx';
import { can } from '../permissions/permissions.js';
import { useCepAutofill } from '../hooks/useCepAutofill.js';
import {
  addClinicAddress,
  addClinicFile,
  addClinicPhone,
  addMailServer,
  getClinic,
  removeClinicAddress,
  removeClinicFile,
  removeClinicPhone,
  removeMailServer,
  testMailServer,
  updateAdditional,
  updateBusinessHours,
  updateClinicDocumentation,
  updateClinicProfile,
  updateClinicTax,
  updateCorrespondence,
  updateIntegrations,
  updateLicense,
  updateNfse,
  updateWebPresence,
} from '../services/clinicService.js';
import { formatCep, formatCnpj, formatPhone, validateFileMeta } from '../utils/validators.js';

const topTabs = [
  { value: 'cadastro', label: 'Dados Cadastrais' },
  { value: 'nfse', label: 'Dados NFSe' },
  { value: 'integracoes', label: 'Integrações' },
  { value: 'web', label: 'Presença Web' },
  { value: 'licenca', label: 'Licença de Uso' },
];

const cadastroSections = [
  'Dados Principais',
  'Documentação',
  'Tributação',
  'Telefones',
  'Endereços',
  'Horários de Funcionamento',
  'Arquivos e Documentos',
  'Correspondências',
  'Servidores de Email',
  'Dados Adicionais',
];

const defaultHours = [
  { diaSemana: 0, abre: '08:00', fecha: '18:00', fechado: true, intervaloInicio: '', intervaloFim: '' },
  { diaSemana: 1, abre: '08:00', fecha: '18:00', fechado: false, intervaloInicio: '12:00', intervaloFim: '13:00' },
  { diaSemana: 2, abre: '08:00', fecha: '18:00', fechado: false, intervaloInicio: '12:00', intervaloFim: '13:00' },
  { diaSemana: 3, abre: '08:00', fecha: '18:00', fechado: false, intervaloInicio: '12:00', intervaloFim: '13:00' },
  { diaSemana: 4, abre: '08:00', fecha: '18:00', fechado: false, intervaloInicio: '12:00', intervaloFim: '13:00' },
  { diaSemana: 5, abre: '08:00', fecha: '16:00', fechado: false, intervaloInicio: '', intervaloFim: '' },
  { diaSemana: 6, abre: '08:00', fecha: '12:00', fechado: true, intervaloInicio: '', intervaloFim: '' },
];

const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function ClinicSettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('cadastro');
  const [activeSection, setActiveSection] = useState('Dados Principais');
  const [editingSection, setEditingSection] = useState('');
  const [editingTab, setEditingTab] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [clinic, setClinic] = useState(() => getClinic());
  const [draft, setDraft] = useState(() => ({
    ...getClinic(),
    newPhone: { tipo: '', ddd: '', numero: '', principal: false },
    newAddress: { tipo: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', principal: false },
    newFile: { categoria: '', nomeArquivo: '', fileUrl: '', validade: '' },
    newMailServer: { provider: '', smtpHost: '', smtpPort: '', smtpUser: '', smtpPassword: '', fromName: '', fromEmail: '' },
  }));
  const isAdmin = can(user, 'team:write');
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
    lookupCep,
  } = useCepAutofill({
    enabled: isAdmin && editingSection === 'Endereços',
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

  useEffect(() => {
    setClinic(getClinic());
    setDraft((prev) => ({
      ...getClinic(),
      newPhone: prev?.newPhone || { tipo: '', ddd: '', numero: '', principal: false },
      newAddress: prev?.newAddress || { tipo: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', principal: false },
      newFile: prev?.newFile || { categoria: '', nomeArquivo: '', fileUrl: '', validade: '' },
      newMailServer: prev?.newMailServer || { provider: '', smtpHost: '', smtpPort: '', smtpUser: '', smtpPassword: '', fromName: '', fromEmail: '' },
    }));
  }, []);

  useEffect(() => {
    if (!editingSection) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editingSection]);

  useEffect(() => {
    if (!editingTab) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [editingTab]);

  const refresh = () => {
    const snapshot = getClinic();
    setClinic(snapshot);
    setDraft((prev) => ({
      ...snapshot,
      newPhone: prev.newPhone || { tipo: '', ddd: '', numero: '', principal: false },
      newAddress: prev.newAddress || { tipo: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', principal: false },
      newFile: prev.newFile || { categoria: '', nomeArquivo: '', fileUrl: '', validade: '' },
      newMailServer: prev.newMailServer || { provider: '', smtpHost: '', smtpPort: '', smtpUser: '', smtpPassword: '', fromName: '', fromEmail: '' },
      newPricingAdminExpense: prev.newPricingAdminExpense || { name: '', value: '' },
      newPricingEquipment: prev.newPricingEquipment || { name: '', value: '', depreciationMonths: '' },
      newPricingEmployee: prev.newPricingEmployee || { name: '', role: '', grossSalary: '' },
      newPricingPartnerDentist: prev.newPricingPartnerDentist || { name: '', type: 'percentage', value: '' },
    }));
  };

  const startEdit = (section) => {
    if (!isAdmin) return;
    if ((editingTab && editingTab !== '') || (editingSection && editingSection !== section)) {
      if (!window.confirm('Existem alterações não salvas. Deseja sair?')) return;
    }
    setEditingSection(section);
    setEditingTab('');
    setError('');
    setSuccess('');
  };

  const startTabEdit = (tab) => {
    if (!isAdmin) return;
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
    setDraft(clinic);
  };

  const saveSection = async (section) => {
    setError('');
    setSuccess('');
    try {
      if (section === 'Dados Principais') {
        updateClinicProfile(user, draft.profile);
      }
      if (section === 'Documentação') {
        updateClinicDocumentation(user, draft.documentation);
      }
      if (section === 'Horários de Funcionamento') {
        updateBusinessHours(user, draft.businessHours);
      }
      if (section === 'Correspondências') {
        updateCorrespondence(user, draft.correspondence);
      }
      if (section === 'Dados Adicionais') {
        updateAdditional(user, draft.additional);
      }
      if (section === 'Tributação') {
        updateClinicTax(user, draft.tax);
      }
      setEditingSection('');
      refresh();
      setSuccess('Dados salvos com sucesso.');
    } catch (err) {
      setError(err.message);
    }
  };

  const onUploadLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateFileMeta(file, ['image/png', 'image/svg+xml']);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDraft((prev) => ({
        ...prev,
        profile: { ...prev.profile, logoUrl: reader.result },
      }));
    };
    reader.readAsDataURL(file);
  };

  const addPhone = (event) => {
    event.preventDefault();
    setError('');
    try {
      if (editingSection !== 'Telefones') return;
      addClinicPhone(user, draft.newPhone);
      setDraft((prev) => ({ ...prev, newPhone: { tipo: '', ddd: '', numero: '', principal: false } }));
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const addAddress = (event) => {
    event.preventDefault();
    setError('');
    try {
      if (editingSection !== 'Endereços') return;
      addClinicAddress(user, draft.newAddress);
      setDraft((prev) => ({ ...prev, newAddress: { tipo: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', principal: false } }));
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const addFile = (event) => {
    event.preventDefault();
    setError('');
    try {
      if (editingSection !== 'Arquivos e Documentos') return;
      addClinicFile(user, draft.newFile);
      setDraft((prev) => ({ ...prev, newFile: { categoria: '', nomeArquivo: '', fileUrl: '', validade: '' } }));
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const addMail = (event) => {
    event.preventDefault();
    setError('');
    try {
      if (editingSection !== 'Servidores de Email') return;
      addMailServer(user, draft.newMailServer);
      setDraft((prev) => ({ ...prev, newMailServer: { provider: '', smtpHost: '', smtpPort: '', smtpUser: '', smtpPassword: '', fromName: '', fromEmail: '' } }));
      refresh();
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

  const content = useMemo(() => {
    if (activeTab === 'cadastro') {
      return (
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
              onEdit={isAdmin ? () => startEdit(activeSection) : null}
              onSave={() => saveSection(activeSection)}
              onCancel={cancelEdit}
              loading={false}
            />

            {error ? <div className="error">{error}</div> : null}
            {success ? <div className="success">{success}</div> : null}

            {activeSection === 'Dados Principais' && (
              <div className="form-grid">
                <Field label="Pessoa">
                  <select
                    value={draft.profile.pessoa}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, pessoa: event.target.value } }))}
                    disabled={editingSection !== 'Dados Principais'}
                  >
                    <option value="FISICA">Física</option>
                    <option value="JURIDICA">Jurídica</option>
                  </select>
                </Field>
                <Field label="Nome da Marca">
                  <input
                    value={draft.profile.nomeMarca}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, nomeMarca: event.target.value } }))}
                    disabled={editingSection !== 'Dados Principais'}
                  />
                </Field>
                <Field label="Nome Fantasia">
                  <input
                    value={draft.profile.nomeFantasia}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, nomeFantasia: event.target.value } }))}
                    disabled={editingSection !== 'Dados Principais'}
                  />
                </Field>
                <Field label="Razão Social">
                  <input
                    value={draft.profile.razaoSocial}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, razaoSocial: event.target.value } }))}
                    disabled={editingSection !== 'Dados Principais'}
                  />
                </Field>
                <Field label="Nome da Clínica (exibição)">
                  <input
                    value={draft.profile.nomeClinica}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, nomeClinica: event.target.value } }))}
                    disabled={editingSection !== 'Dados Principais'}
                  />
                </Field>
                <Field label="E-mail principal">
                  <input
                    type="email"
                    value={draft.profile.emailPrincipal}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, emailPrincipal: event.target.value } }))}
                    disabled={editingSection !== 'Dados Principais'}
                  />
                </Field>
                <Field label="Logomarca">
                  {draft.profile.logoUrl ? <img className="logo-preview" src={draft.profile.logoUrl} alt="Logo" /> : null}
                  <input type="file" accept="image/png,image/svg+xml" onChange={onUploadLogo} disabled={editingSection !== 'Dados Principais'} />
                </Field>
              </div>
            )}

            {activeSection === 'Documentação' && (
              <div className="form-grid">
                <Field label="CNPJ">
                  <input
                    value={formatCnpj(draft.documentation.cnpj)}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, cnpj: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
                <Field label="IE">
                  <input
                    value={draft.documentation.ie}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, ie: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
                <Field label="E-mail principal">
                  <input
                    type="email"
                    value={draft.profile.emailPrincipal}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, emailPrincipal: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
                <Field label="Alvará Prefeitura (número)">
                  <input
                    value={draft.documentation.alvaraPrefeituraNumero}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, alvaraPrefeituraNumero: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
                <Field label="Alvará Autorização">
                  <input
                    value={draft.documentation.alvaraAutorizacao}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, alvaraAutorizacao: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
                <Field label="Alvará Validade">
                  <input
                    type="date"
                    value={draft.documentation.alvaraValidade}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, alvaraValidade: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
                <Field label="Vigilância Sanitária (número)">
                  <input
                    value={draft.documentation.vigilanciaSanitariaNumero}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, vigilanciaSanitariaNumero: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
                <Field label="Vigilância Sanitária (validade)">
                  <input
                    type="date"
                    value={draft.documentation.vigilanciaSanitariaValidade}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, vigilanciaSanitariaValidade: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
                <Field label="CNES">
                  <input
                    value={draft.documentation.cnes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, cnes: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
                <Field label="NIRE">
                  <input
                    value={draft.documentation.nire}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, nire: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
                <Field label="Conselho Regional">
                  <input
                    value={draft.documentation.conselhoRegionalNumero}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, conselhoRegionalNumero: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
                <Field label="Observações">
                  <textarea
                    value={draft.documentation.observacoes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, observacoes: event.target.value } }))}
                    disabled={editingSection !== 'Documentação'}
                  />
                </Field>
              </div>
            )}

            {activeSection === 'Tributação' && (() => {
              const tax = draft.tax || {};
              return (
                <div className="form-grid">
                  <Field label="Regime tributário">
                    <select
                      value={tax.regime || 'simplesNacional'}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), regime: e.target.value } }))}
                      disabled={editingSection !== 'Tributação'}
                    >
                      <option value="simplesNacional">Simples Nacional</option>
                      <option value="lucroPresumido">Lucro Presumido</option>
                      <option value="lucroReal">Lucro Real</option>
                      <option value="cpf">CPF</option>
                    </select>
                  </Field>
                  <Field label="UF de recolhimento">
                    <input
                      value={tax.uf || 'SP'}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), uf: e.target.value } }))}
                      disabled={editingSection !== 'Tributação'}
                      maxLength={2}
                    />
                  </Field>
                  <Field label="ISS (%)">
                    <input
                      type="number"
                      value={tax.iss ?? 5}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), iss: Number(e.target.value || 0) } }))}
                      disabled={editingSection !== 'Tributação'}
                      min={0}
                      max={20}
                    />
                  </Field>
                  <Field label="Base tributável (% ou valor base)">
                    <input
                      type="number"
                      value={tax.baseTributavel ?? 100}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), baseTributavel: Number(e.target.value || 0) } }))}
                      disabled={editingSection !== 'Tributação'}
                      min={0}
                      max={100}
                    />
                  </Field>
                  <Field label="Simples Nacional: Anexo">
                    <select
                      value={tax.simplesAnexo || 'anexo3'}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), simplesAnexo: e.target.value } }))}
                      disabled={editingSection !== 'Tributação'}
                    >
                      <option value="anexo3">Anexo III</option>
                      <option value="anexo5">Anexo V</option>
                    </select>
                  </Field>
                  <Field label="Simples Nacional: Faixa (1-6)">
                    <input
                      type="number"
                      value={tax.simplesFaixa ?? 1}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), simplesFaixa: Number(e.target.value || 1) } }))}
                      disabled={editingSection !== 'Tributação'}
                      min={1}
                      max={6}
                    />
                  </Field>
                  <Field label="Alíquota nominal (%)">
                    <input
                      type="number"
                      value={tax.aliquotaNominal ?? 6}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), aliquotaNominal: Number(e.target.value || 0) } }))}
                      disabled={editingSection !== 'Tributação'}
                      min={0}
                      max={100}
                    />
                  </Field>
                  <Field label="Fator R (se aplicável)">
                    <input
                      type="number"
                      value={tax.fatorR ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), fatorR: v === '' ? null : Number(v) } }));
                      }}
                      disabled={editingSection !== 'Tributação'}
                      min={0}
                      max={1}
                      step="0.01"
                      placeholder="Opcional"
                    />
                  </Field>
                  <Field label="Dedução permitida (%)">
                    <input
                      type="number"
                      value={tax.deducaoPermitida ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), deducaoPermitida: v === '' ? null : Number(v) } }));
                      }}
                      disabled={editingSection !== 'Tributação'}
                      min={0}
                      max={100}
                      placeholder="Opcional"
                    />
                  </Field>
                  <Field label="Tipo de cálculo">
                    <select
                      value={tax.tipoCalculo || 'embedded'}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), tipoCalculo: e.target.value } }))}
                      disabled={editingSection !== 'Tributação'}
                    >
                      <option value="embedded">Embutido</option>
                      <option value="onRevenue">Por fora (sobre receita)</option>
                    </select>
                  </Field>
                </div>
              );
            })()}

            {activeSection === 'Telefones' && (
              <div className="stack">
                <form className="form-grid" onSubmit={addPhone}>
                  <Field label="Tipo">
                    <select
                      value={draft.newPhone?.tipo || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, tipo: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Telefones'}
                    >
                      <option value="">Selecione</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="comercial">Comercial</option>
                      <option value="financeiro">Financeiro</option>
                      <option value="recepcao">Recepção</option>
                      <option value="outros">Outros</option>
                    </select>
                  </Field>
                  <Field label="DDD">
                    <input
                      value={draft.newPhone?.ddd || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, ddd: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Telefones'}
                    />
                  </Field>
                  <Field label="Número">
                    <input
                      value={formatPhone(draft.newPhone?.numero || '')}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, numero: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Telefones'}
                    />
                  </Field>
                  <Field label="Principal">
                    <input
                      type="checkbox"
                      checked={draft.newPhone?.principal || false}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, principal: event.target.checked } }))}
                      disabled={!isAdmin || editingSection !== 'Telefones'}
                    />
                  </Field>
                  <button className="button primary" type="submit" disabled={!isAdmin || editingSection !== 'Telefones'}>
                    Adicionar telefone
                  </button>
                </form>
                <div className="card">
                  <ul className="list">
                    {clinic.phones.map((item) => (
                      <li key={item.id} className="list-item">
                        {item.tipo} · ({item.ddd}) {item.numero} {item.principal ? '★' : ''}
                        {isAdmin ? (
                          <button className="button secondary" type="button" onClick={() => removeClinicPhone(user, item.id)}>
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
                <form className="form-grid" onSubmit={addAddress}>
                  <Field label="Tipo">
                    <select
                      value={draft.newAddress?.tipo || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, tipo: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Endereços'}
                    >
                      <option value="">Selecione</option>
                      <option value="principal">Principal</option>
                      <option value="correspondencia">Correspondência</option>
                      <option value="cobranca">Cobrança</option>
                      <option value="outros">Outros</option>
                    </select>
                  </Field>
                  <Field label="CEP" error={cepError}>
                    <div className={`cep-input-wrapper ${cepLoading ? 'is-loading' : ''}`}>
                      <input
                        value={formatCep(draft.newAddress?.cep || '')}
                        onChange={(event) => handleCepChange(event.target.value)}
                        onBlur={handleCepBlur}
                        disabled={!isAdmin || editingSection !== 'Endereços'}
                      />
                      <span className="cep-spinner" aria-hidden="true" />
                    </div>
                  </Field>
                  <Field label="Buscar CEP">
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => lookupCep(draft.newAddress?.cep || '', { force: true })}
                      disabled={!isAdmin || editingSection !== 'Endereços'}
                    >
                      Consultar
                    </button>
                  </Field>
                  <Field label="Logradouro">
                    <input
                      value={draft.newAddress?.logradouro || ''}
                      onChange={(event) => handleAddressFieldChange('logradouro', event.target.value)}
                      className={isAutoFilled('logradouro') ? 'input-autofilled' : ''}
                      disabled={!isAdmin || editingSection !== 'Endereços'}
                    />
                  </Field>
                  <Field label="Número">
                    <input
                      value={draft.newAddress?.numero || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, numero: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Endereços'}
                    />
                  </Field>
                  <Field label="Complemento">
                    <input
                      value={draft.newAddress?.complemento || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, complemento: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Endereços'}
                    />
                  </Field>
                  <Field label="Bairro">
                    <input
                      value={draft.newAddress?.bairro || ''}
                      onChange={(event) => handleAddressFieldChange('bairro', event.target.value)}
                      className={isAutoFilled('bairro') ? 'input-autofilled' : ''}
                      disabled={!isAdmin || editingSection !== 'Endereços'}
                    />
                  </Field>
                  <Field label="Cidade">
                    <input
                      value={draft.newAddress?.cidade || ''}
                      onChange={(event) => handleAddressFieldChange('cidade', event.target.value)}
                      className={isAutoFilled('cidade') ? 'input-autofilled' : ''}
                      disabled={!isAdmin || editingSection !== 'Endereços'}
                    />
                  </Field>
                  <Field label="UF">
                    <input
                      value={draft.newAddress?.uf || ''}
                      onChange={(event) => handleAddressFieldChange('uf', event.target.value)}
                      className={isAutoFilled('uf') ? 'input-autofilled' : ''}
                      disabled={!isAdmin || editingSection !== 'Endereços'}
                    />
                  </Field>
                  <Field label="Principal">
                    <input
                      type="checkbox"
                      checked={draft.newAddress?.principal || false}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, principal: event.target.checked } }))}
                      disabled={!isAdmin || editingSection !== 'Endereços'}
                    />
                  </Field>
                  <button className="button primary" type="submit" disabled={!isAdmin || editingSection !== 'Endereços'}>
                    Adicionar endereço
                  </button>
                </form>
                <div className="card">
                  <ul className="list">
                    {clinic.addresses.map((item) => (
                      <li key={item.id} className="list-item">
                        {item.tipo} · {item.logradouro}, {item.numero} · {item.cidade}-{item.uf} {item.principal ? '★' : ''}
                        {isAdmin ? (
                          <button className="button secondary" type="button" onClick={() => removeClinicAddress(user, item.id)}>
                            Remover
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {activeSection === 'Horários de Funcionamento' && (
              <div className="stack">
                {(draft.businessHours?.length ? draft.businessHours : defaultHours).map((item, idx) => (
                  <div key={item.diaSemana} className="hours-row">
                    <strong>{dayLabels[item.diaSemana]}</strong>
                    <label>
                      <input
                        type="checkbox"
                        checked={!item.fechado}
                        onChange={(event) => {
                          const next = [...(draft.businessHours?.length ? draft.businessHours : defaultHours)];
                          next[idx] = { ...next[idx], fechado: !event.target.checked };
                          setDraft((prev) => ({ ...prev, businessHours: next }));
                        }}
                        disabled={editingSection !== 'Horários de Funcionamento'}
                      />
                      Aberto
                    </label>
                    <input
                      type="time"
                      value={item.abre}
                      onChange={(event) => {
                        const next = [...(draft.businessHours?.length ? draft.businessHours : defaultHours)];
                        next[idx] = { ...next[idx], abre: event.target.value };
                        setDraft((prev) => ({ ...prev, businessHours: next }));
                      }}
                      disabled={editingSection !== 'Horários de Funcionamento' || item.fechado}
                    />
                    <input
                      type="time"
                      value={item.fecha}
                      onChange={(event) => {
                        const next = [...(draft.businessHours?.length ? draft.businessHours : defaultHours)];
                        next[idx] = { ...next[idx], fecha: event.target.value };
                        setDraft((prev) => ({ ...prev, businessHours: next }));
                      }}
                      disabled={editingSection !== 'Horários de Funcionamento' || item.fechado}
                    />
                    <input
                      type="time"
                      value={item.intervaloInicio}
                      onChange={(event) => {
                        const next = [...(draft.businessHours?.length ? draft.businessHours : defaultHours)];
                        next[idx] = { ...next[idx], intervaloInicio: event.target.value };
                        setDraft((prev) => ({ ...prev, businessHours: next }));
                      }}
                      disabled={editingSection !== 'Horários de Funcionamento' || item.fechado}
                    />
                    <input
                      type="time"
                      value={item.intervaloFim}
                      onChange={(event) => {
                        const next = [...(draft.businessHours?.length ? draft.businessHours : defaultHours)];
                        next[idx] = { ...next[idx], intervaloFim: event.target.value };
                        setDraft((prev) => ({ ...prev, businessHours: next }));
                      }}
                      disabled={editingSection !== 'Horários de Funcionamento' || item.fechado}
                    />
                  </div>
                ))}
              </div>
            )}

            {activeSection === 'Arquivos e Documentos' && (
              <div className="stack">
                <form className="form-grid" onSubmit={addFile}>
                  <Field label="Categoria">
                    <select
                      value={draft.newFile?.categoria || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newFile: { ...prev.newFile, categoria: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Arquivos e Documentos'}
                    >
                      <option value="">Selecione</option>
                      <option value="contrato">Contrato</option>
                      <option value="alvara">Alvará</option>
                      <option value="licenca">Licença</option>
                      <option value="logomarca">Logomarca</option>
                      <option value="outros">Outros</option>
                    </select>
                  </Field>
                  <Field label="Nome do arquivo">
                    <input
                      value={draft.newFile?.nomeArquivo || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newFile: { ...prev.newFile, nomeArquivo: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Arquivos e Documentos'}
                    />
                  </Field>
                  <Field label="Validade">
                    <input
                      type="date"
                      value={draft.newFile?.validade || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newFile: { ...prev.newFile, validade: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Arquivos e Documentos'}
                    />
                  </Field>
                  <Field label="Arquivo">
                    <input
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const validation = validateFileMeta(file, ['application/pdf', 'image/png', 'image/svg+xml']);
                        if (!validation.ok) {
                          setError(validation.message);
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          setDraft((prev) => ({
                            ...prev,
                            newFile: { ...prev.newFile, fileUrl: reader.result, nomeArquivo: prev.newFile?.nomeArquivo || file.name },
                          }));
                        };
                        reader.readAsDataURL(file);
                      }}
                      disabled={!isAdmin || editingSection !== 'Arquivos e Documentos'}
                    />
                  </Field>
                  <button className="button primary" type="submit" disabled={!isAdmin || editingSection !== 'Arquivos e Documentos'}>
                    Adicionar arquivo
                  </button>
                </form>
                <div className="card">
                  <ul className="list">
                    {clinic.files.map((item) => (
                      <li key={item.id} className="list-item">
                        {item.categoria} · {item.nomeArquivo}
                        {item.fileUrl ? (
                          <a href={item.fileUrl} target="_blank" rel="noreferrer">
                            Visualizar
                          </a>
                        ) : null}
                        {isAdmin ? (
                          <button className="button secondary" type="button" onClick={() => removeClinicFile(user, item.id)}>
                            Remover
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {activeSection === 'Correspondências' && (
              <div className="form-grid">
                <Field label="Endereço para correspondência">
                  <select
                    value={draft.correspondence.addressId || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, correspondence: { ...prev.correspondence, addressId: event.target.value } }))}
                    disabled={editingSection !== 'Correspondências'}
                  >
                    <option value="">Selecione</option>
                    {clinic.addresses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.logradouro}, {item.numero}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Preferência Email">
                  <input
                    type="checkbox"
                    checked={draft.correspondence.preferEmail}
                    onChange={(event) => setDraft((prev) => ({ ...prev, correspondence: { ...prev.correspondence, preferEmail: event.target.checked } }))}
                    disabled={editingSection !== 'Correspondências'}
                  />
                </Field>
                <Field label="Preferência SMS">
                  <input
                    type="checkbox"
                    checked={draft.correspondence.preferSms}
                    onChange={(event) => setDraft((prev) => ({ ...prev, correspondence: { ...prev.correspondence, preferSms: event.target.checked } }))}
                    disabled={editingSection !== 'Correspondências'}
                  />
                </Field>
                <Field label="Preferência WhatsApp">
                  <input
                    type="checkbox"
                    checked={draft.correspondence.preferWhatsApp}
                    onChange={(event) => setDraft((prev) => ({ ...prev, correspondence: { ...prev.correspondence, preferWhatsApp: event.target.checked } }))}
                    disabled={editingSection !== 'Correspondências'}
                  />
                </Field>
                <Field label="Observações">
                  <textarea
                    value={draft.correspondence.notes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, correspondence: { ...prev.correspondence, notes: event.target.value } }))}
                    disabled={editingSection !== 'Correspondências'}
                  />
                </Field>
              </div>
            )}

            {activeSection === 'Servidores de Email' && (
              <div className="stack">
                <form className="form-grid" onSubmit={addMail}>
                  <Field label="Provider">
                    <select
                      value={draft.newMailServer?.provider || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, provider: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Servidores de Email'}
                    >
                      <option value="">Selecione</option>
                      <option value="gmail">Gmail</option>
                      <option value="office365">Office365</option>
                      <option value="smtp">SMTP</option>
                    </select>
                  </Field>
                  <Field label="SMTP Host">
                    <input
                      value={draft.newMailServer?.smtpHost || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, smtpHost: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Servidores de Email'}
                    />
                  </Field>
                  <Field label="SMTP Port">
                    <input
                      value={draft.newMailServer?.smtpPort || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, smtpPort: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Servidores de Email'}
                    />
                  </Field>
                  <Field label="SMTP User">
                    <input
                      value={draft.newMailServer?.smtpUser || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, smtpUser: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Servidores de Email'}
                    />
                  </Field>
                  <Field label="SMTP Password">
                    <input
                      type="password"
                      value={draft.newMailServer?.smtpPassword || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, smtpPassword: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Servidores de Email'}
                    />
                  </Field>
                  <Field label="From Name">
                    <input
                      value={draft.newMailServer?.fromName || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, fromName: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Servidores de Email'}
                    />
                  </Field>
                  <Field label="From Email">
                    <input
                      value={draft.newMailServer?.fromEmail || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, fromEmail: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'Servidores de Email'}
                    />
                  </Field>
                  <button className="button primary" type="submit" disabled={!isAdmin || editingSection !== 'Servidores de Email'}>
                    Adicionar servidor
                  </button>
                </form>
                <div className="card">
                  <ul className="list">
                    {clinic.mailServers.map((item) => (
                      <li key={item.id} className="list-item">
                        {item.provider} · {item.smtpHost} · {item.testStatus}
                        {isAdmin ? (
                          <div className="list-actions">
                            <button className="button secondary" type="button" onClick={() => testMailServer(user, item.id)}>
                              Testar
                            </button>
                            <button className="button secondary" type="button" onClick={() => removeMailServer(user, item.id)}>
                              Remover
                            </button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {activeSection === 'Dados Adicionais' && (
              <div className="form-grid">
                <Field label="Observações internas">
                  <textarea
                    value={draft.additional.notes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, additional: { ...prev.additional, notes: event.target.value } }))}
                    disabled={editingSection !== 'Dados Adicionais'}
                  />
                </Field>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activeTab === 'nfse') {
      return (
        <div className="stack">
          <SectionHeaderActions
            title="Dados NFSe"
            isEditing={editingTab === 'nfse'}
            onEdit={isAdmin ? () => startTabEdit('nfse') : null}
            onCancel={cancelEdit}
            onSave={() => {
              updateNfse(user, draft.nfse);
              setEditingTab('');
              setSuccess('NFSe atualizado.');
            }}
            loading={false}
          />
          <div className="form-grid">
          <Field label="Provider">
            <input
              value={draft.nfse.provider}
              onChange={(event) => setDraft((prev) => ({ ...prev, nfse: { ...prev.nfse, provider: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'nfse'}
            />
          </Field>
          <Field label="Código municipal">
            <input
              value={draft.nfse.municipalCode}
              onChange={(event) => setDraft((prev) => ({ ...prev, nfse: { ...prev.nfse, municipalCode: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'nfse'}
            />
          </Field>
          <Field label="Token">
            <input
              value={draft.nfse.token}
              onChange={(event) => setDraft((prev) => ({ ...prev, nfse: { ...prev.nfse, token: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'nfse'}
            />
          </Field>
          </div>
        </div>
      );
    }

    if (activeTab === 'integracoes') {
      return (
        <div className="stack">
          <SectionHeaderActions
            title="Integrações"
            isEditing={editingTab === 'integracoes'}
            onEdit={isAdmin ? () => startTabEdit('integracoes') : null}
            onCancel={cancelEdit}
            onSave={() => {
              updateIntegrations(user, draft.integrations);
              setEditingTab('');
              setSuccess('Integrações atualizadas.');
            }}
            loading={false}
          />
          <div className="form-grid">
          <Field label="WhatsApp API URL">
            <input
              value={draft.integrations.whatsappApiUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, integrations: { ...prev.integrations, whatsappApiUrl: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'integracoes'}
            />
          </Field>
          <Field label="SMS Provider">
            <input
              value={draft.integrations.smsProvider}
              onChange={(event) => setDraft((prev) => ({ ...prev, integrations: { ...prev.integrations, smsProvider: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'integracoes'}
            />
          </Field>
          <Field label="Webhook URL">
            <input
              value={draft.integrations.webhookUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, integrations: { ...prev.integrations, webhookUrl: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'integracoes'}
            />
          </Field>
          </div>
        </div>
      );
    }

    if (activeTab === 'web') {
      return (
        <div className="stack">
          <SectionHeaderActions
            title="Presença Web"
            isEditing={editingTab === 'web'}
            onEdit={isAdmin ? () => startTabEdit('web') : null}
            onCancel={cancelEdit}
            onSave={() => {
              updateWebPresence(user, draft.webPresence);
              setEditingTab('');
              setSuccess('Presença web atualizada.');
            }}
            loading={false}
          />
          <div className="form-grid">
          <Field label="Website">
            <input
              value={draft.webPresence.website}
              onChange={(event) => setDraft((prev) => ({ ...prev, webPresence: { ...prev.webPresence, website: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'web'}
            />
          </Field>
          <Field label="Instagram">
            <input
              value={draft.webPresence.instagram}
              onChange={(event) => setDraft((prev) => ({ ...prev, webPresence: { ...prev.webPresence, instagram: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'web'}
            />
          </Field>
          <Field label="Facebook">
            <input
              value={draft.webPresence.facebook}
              onChange={(event) => setDraft((prev) => ({ ...prev, webPresence: { ...prev.webPresence, facebook: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'web'}
            />
          </Field>
          <Field label="Google Maps">
            <input
              value={draft.webPresence.googleMapsUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, webPresence: { ...prev.webPresence, googleMapsUrl: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'web'}
            />
          </Field>
          <Field label="WhatsApp">
            <input
              value={draft.webPresence.whatsappUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, webPresence: { ...prev.webPresence, whatsappUrl: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'web'}
            />
          </Field>
          </div>
        </div>
      );
    }

    if (activeTab === 'licenca') {
      return (
        <div className="stack">
          <SectionHeaderActions
            title="Licença de Uso"
            isEditing={editingTab === 'licenca'}
            onEdit={isAdmin ? () => startTabEdit('licenca') : null}
            onCancel={cancelEdit}
            onSave={() => {
              updateLicense(user, draft.license);
              setEditingTab('');
              setSuccess('Licença atualizada.');
            }}
            loading={false}
          />
          <div className="form-grid">
          <Field label="Plano">
            <input
              value={draft.license.plan}
              onChange={(event) => setDraft((prev) => ({ ...prev, license: { ...prev.license, plan: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'licenca'}
            />
          </Field>
          <Field label="Expira em">
            <input
              type="date"
              value={draft.license.expiresAt}
              onChange={(event) => setDraft((prev) => ({ ...prev, license: { ...prev.license, expiresAt: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'licenca'}
            />
          </Field>
          <Field label="Usuários">
            <input
              type="number"
              value={draft.license.seats}
              onChange={(event) => setDraft((prev) => ({ ...prev, license: { ...prev.license, seats: event.target.value } }))}
              disabled={!isAdmin || editingTab !== 'licenca'}
            />
          </Field>
          </div>
        </div>
      );
    }

    return null;
  }, [activeTab, activeSection, editingSection, clinic, draft, user, isAdmin, error, success]);

  return (
    <div className="stack">
      <Section title="Dados da Clínica">
        <Tabs tabs={topTabs} active={activeTab} onChange={handleTabChange} />
        {content}
      </Section>
    </div>
  );
}
