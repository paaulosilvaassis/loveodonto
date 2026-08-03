import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { Field } from '../components/Field.jsx';
import { can } from '../permissions/permissions.js';
import { useCepAutofill } from '../hooks/useCepAutofill.js';
import ClinicRecordShell from '../components/clinic/record/ClinicRecordShell.jsx';
import ClinicOverviewSection from '../components/clinic/record/ClinicOverviewSection.jsx';
import ClinicFormCard from '../components/clinic/record/ClinicFormCard.jsx';
import {
  addClinicAddress,
  addClinicFile,
  addMailServer,
  getClinic,
  removeClinicAddress,
  removeClinicFile,
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
import { ClinicPhonesSection } from '../components/clinic/ClinicPhonesSection.jsx';
import { formatCep, formatCnpj, validateFileMeta } from '../utils/validators.js';

const EDITABLE_SECTIONS = new Set([
  'cadastro', 'documentacao', 'tributacao', 'horarios', 'correspondencias', 'adicionais',
  'nfse', 'integracoes', 'web', 'licenca',
]);

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
  const [activeSection, setActiveSection] = useState('geral');
  const [editingSection, setEditingSection] = useState('');
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
    enabled: isAdmin && editingSection === 'enderecos',
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
    if (editingSection && editingSection !== section) {
      if (!window.confirm('Existem alterações não salvas. Deseja sair?')) return;
    }
    setEditingSection(section);
    setError('');
    setSuccess('');
  };

  const cancelEdit = () => {
    setEditingSection('');
    setDraft(clinic);
  };

  const saveActiveSection = async () => {
    setError('');
    setSuccess('');
    try {
      const section = editingSection || activeSection;
      if (section === 'cadastro') updateClinicProfile(user, draft.profile);
      else if (section === 'documentacao') updateClinicDocumentation(user, draft.documentation);
      else if (section === 'tributacao') updateClinicTax(user, draft.tax);
      else if (section === 'horarios') updateBusinessHours(user, draft.businessHours);
      else if (section === 'correspondencias') {
        updateCorrespondence(user, draft.correspondence);
        updateAdditional(user, draft.additional);
      }
      else if (section === 'adicionais') updateAdditional(user, draft.additional);
      else if (section === 'nfse') updateNfse(user, draft.nfse);
      else if (section === 'integracoes') updateIntegrations(user, draft.integrations);
      else if (section === 'web') updateWebPresence(user, draft.webPresence);
      else if (section === 'licenca') updateLicense(user, draft.license);
      else return;
      setEditingSection('');
      refresh();
      setSuccess('Dados salvos com sucesso.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSectionChange = (next) => {
    if (editingSection) {
      if (!window.confirm('Existem alterações não salvas. Deseja sair?')) return;
      setEditingSection('');
    }
    setActiveSection(next);
  };

  const handleEditSection = (section) => {
    setActiveSection(section);
    if (EDITABLE_SECTIONS.has(section) || ['telefones', 'enderecos', 'arquivos', 'email'].includes(section)) {
      startEdit(section);
    }
  };

  const formatDatePtBr = (value) => {
    if (!value) return '—';
    const [year, month, day] = String(value).split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  };

  const primaryPhone = useMemo(() => {
    const phones = clinic.phones || [];
    const p = phones.find((item) => item.principal) || phones[0];
    if (!p?.numero) return '—';
    return p.ddd ? `(${p.ddd}) ${p.numero}` : p.numero;
  }, [clinic.phones]);

  const isRecordEditing = Boolean(editingSection && editingSection === activeSection);
  const hasUnsavedChanges = Boolean(editingSection);
  const canEditActiveSection = isAdmin && activeSection !== 'geral';
  const canSaveFromHeader = isRecordEditing && (EDITABLE_SECTIONS.has(activeSection) || ['correspondencias'].includes(activeSection));

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

  const refreshClinicPhones = () => {
    refresh();
  };

  const addAddress = (event) => {
    event.preventDefault();
    setError('');
    try {
      if (editingSection !== 'enderecos') return;
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
      if (editingSection !== 'arquivos') return;
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
      if (editingSection !== 'email') return;
      addMailServer(user, draft.newMailServer);
      setDraft((prev) => ({ ...prev, newMailServer: { provider: '', smtpHost: '', smtpPort: '', smtpUser: '', smtpPassword: '', fromName: '', fromEmail: '' } }));
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const sectionContent = useMemo(() => {
    if (activeSection === 'geral') {
      return (
        <ClinicOverviewSection
          draft={draft}
          clinic={clinic}
          formatDate={formatDatePtBr}
          canEdit={isAdmin}
          onEditSection={handleEditSection}
        />
      );
    }

    if (activeSection === 'cadastro') {
      return (
        <div className="clinic-section-stack">
          <ClinicFormCard title="Identificação da clínica" description="Dados principais exibidos no sistema e comunicações.">
            <div className="form-grid clinic-form-grid">
                <Field label="Pessoa">
                  <select
                    value={draft.profile.pessoa}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, pessoa: event.target.value } }))}
                    disabled={editingSection !== 'cadastro'}
                  >
                    <option value="FISICA">Física</option>
                    <option value="JURIDICA">Jurídica</option>
                  </select>
                </Field>
                <Field label="Nome da Marca">
                  <input
                    value={draft.profile.nomeMarca}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, nomeMarca: event.target.value } }))}
                    disabled={editingSection !== 'cadastro'}
                  />
                </Field>
                <Field label="Nome Fantasia">
                  <input
                    value={draft.profile.nomeFantasia}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, nomeFantasia: event.target.value } }))}
                    disabled={editingSection !== 'cadastro'}
                  />
                </Field>
                <Field label="Razão Social">
                  <input
                    value={draft.profile.razaoSocial}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, razaoSocial: event.target.value } }))}
                    disabled={editingSection !== 'cadastro'}
                  />
                </Field>
                <Field label="Nome da Clínica (exibição)">
                  <input
                    value={draft.profile.nomeClinica}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, nomeClinica: event.target.value } }))}
                    disabled={editingSection !== 'cadastro'}
                  />
                </Field>
                <Field label="E-mail principal">
                  <input
                    type="email"
                    value={draft.profile.emailPrincipal}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, emailPrincipal: event.target.value } }))}
                    disabled={editingSection !== 'cadastro'}
                  />
                </Field>
                <Field label="Logomarca">
                  {draft.profile.logoUrl ? <img className="logo-preview clinic-logo-preview" src={draft.profile.logoUrl} alt="Logo" /> : null}
                  <input type="file" accept="image/png,image/svg+xml" onChange={onUploadLogo} disabled={editingSection !== 'cadastro'} />
                </Field>
            </div>
          </ClinicFormCard>
        </div>
      );
    }

    if (activeSection === 'documentacao') {
      return (
        <div className="clinic-section-stack">
          <ClinicFormCard title="Documentação legal" description="CNPJ, inscrições, alvarás e registros.">
            <div className="form-grid clinic-form-grid">
                <Field label="CNPJ">
                  <input
                    value={formatCnpj(draft.documentation.cnpj)}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, cnpj: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                  />
                </Field>
                <Field label="IE">
                  <input
                    value={draft.documentation.ie}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, ie: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                  />
                </Field>
                <Field label="E-mail principal">
                  <input
                    type="email"
                    value={draft.profile.emailPrincipal}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, emailPrincipal: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                  />
                </Field>
                <Field label="Alvará Prefeitura (número)">
                  <input
                    value={draft.documentation.alvaraPrefeituraNumero}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, alvaraPrefeituraNumero: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                  />
                </Field>
                <Field label="Alvará Autorização">
                  <input
                    value={draft.documentation.alvaraAutorizacao}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, alvaraAutorizacao: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                  />
                </Field>
                <Field label="Alvará Validade">
                  <input
                    type="date"
                    value={draft.documentation.alvaraValidade}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, alvaraValidade: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                  />
                </Field>
                <Field label="Vigilância Sanitária (número)">
                  <input
                    value={draft.documentation.vigilanciaSanitariaNumero}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, vigilanciaSanitariaNumero: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                  />
                </Field>
                <Field label="Vigilância Sanitária (validade)">
                  <input
                    type="date"
                    value={draft.documentation.vigilanciaSanitariaValidade}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, vigilanciaSanitariaValidade: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                  />
                </Field>
                <Field label="CNES">
                  <input
                    value={draft.documentation.cnes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, cnes: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                  />
                </Field>
                <Field label="NIRE">
                  <input
                    value={draft.documentation.nire}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, nire: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                  />
                </Field>
                <Field label="Observações">
                  <textarea
                    value={draft.documentation.observacoes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, observacoes: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                  />
                </Field>
            </div>
          </ClinicFormCard>
          <ClinicFormCard title="Responsáveis" description="Responsável técnico e registros profissionais.">
            <div className="form-grid clinic-form-grid">
                <Field label="Responsável técnico (nome)">
                  <input
                    value={draft.documentation.responsavelTecnico || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documentation: { ...prev.documentation, responsavelTecnico: event.target.value } }))}
                    disabled={editingSection !== 'documentacao'}
                    placeholder="Nome completo do responsável técnico (CRO)"
                  />
                </Field>
                <Field label="CRO do responsável técnico">
                  <input
                    value={draft.documentation.croResponsavelTecnico || draft.documentation.conselhoRegionalNumero || ''}
                    onChange={(event) => setDraft((prev) => ({
                      ...prev,
                      documentation: {
                        ...prev.documentation,
                        croResponsavelTecnico: event.target.value,
                        conselhoRegionalNumero: event.target.value,
                      },
                    }))}
                    disabled={editingSection !== 'documentacao'}
                    placeholder="Ex.: CRO-MG 12345"
                  />
                </Field>
            </div>
          </ClinicFormCard>
        </div>
      );
    }

    if (activeSection === 'tributacao') {
      const tax = draft.tax || {};
      return (
        <ClinicFormCard title="Tributação" description="Regime tributário, ISS e configurações fiscais.">
          <div className="form-grid clinic-form-grid">
                  <Field label="Regime tributário">
                    <select
                      value={tax.regime || 'simplesNacional'}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), regime: e.target.value } }))}
                      disabled={editingSection !== 'tributacao'}
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
                      disabled={editingSection !== 'tributacao'}
                      maxLength={2}
                    />
                  </Field>
                  <Field label="ISS (%)">
                    <input
                      type="number"
                      value={tax.iss ?? 5}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), iss: Number(e.target.value || 0) } }))}
                      disabled={editingSection !== 'tributacao'}
                      min={0}
                      max={20}
                    />
                  </Field>
                  <Field label="Base tributável (% ou valor base)">
                    <input
                      type="number"
                      value={tax.baseTributavel ?? 100}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), baseTributavel: Number(e.target.value || 0) } }))}
                      disabled={editingSection !== 'tributacao'}
                      min={0}
                      max={100}
                    />
                  </Field>
                  <Field label="Simples Nacional: Anexo">
                    <select
                      value={tax.simplesAnexo || 'anexo3'}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), simplesAnexo: e.target.value } }))}
                      disabled={editingSection !== 'tributacao'}
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
                      disabled={editingSection !== 'tributacao'}
                      min={1}
                      max={6}
                    />
                  </Field>
                  <Field label="Alíquota nominal (%)">
                    <input
                      type="number"
                      value={tax.aliquotaNominal ?? 6}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), aliquotaNominal: Number(e.target.value || 0) } }))}
                      disabled={editingSection !== 'tributacao'}
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
                      disabled={editingSection !== 'tributacao'}
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
                      disabled={editingSection !== 'tributacao'}
                      min={0}
                      max={100}
                      placeholder="Opcional"
                    />
                  </Field>
                  <Field label="Tipo de cálculo">
                    <select
                      value={tax.tipoCalculo || 'embedded'}
                      onChange={(e) => setDraft((prev) => ({ ...prev, tax: { ...(prev.tax || {}), tipoCalculo: e.target.value } }))}
                      disabled={editingSection !== 'tributacao'}
                    >
                      <option value="embedded">Embutido</option>
                      <option value="onRevenue">Por fora (sobre receita)</option>
                    </select>
                  </Field>
          </div>
        </ClinicFormCard>
      );
    }

    if (activeSection === 'telefones') {
      return (
              <ClinicPhonesSection
                user={user}
                phones={clinic.phones}
                isAdmin={isAdmin}
                isEditing={editingSection === 'telefones'}
                onRefresh={refreshClinicPhones}
                onError={setError}
                onSuccess={setSuccess}
              />
      );
    }

    if (activeSection === 'enderecos') {
      return (
              <div className="stack clinic-section-stack">
                <form className="form-grid" onSubmit={addAddress}>
                  <Field label="Tipo">
                    <select
                      value={draft.newAddress?.tipo || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, tipo: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'enderecos'}
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
                        disabled={!isAdmin || editingSection !== 'enderecos'}
                      />
                      <span className="cep-spinner" aria-hidden="true" />
                    </div>
                  </Field>
                  <Field label="Buscar CEP">
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => lookupCep(draft.newAddress?.cep || '', { force: true })}
                      disabled={!isAdmin || editingSection !== 'enderecos'}
                    >
                      Consultar
                    </button>
                  </Field>
                  <Field label="Logradouro">
                    <input
                      value={draft.newAddress?.logradouro || ''}
                      onChange={(event) => handleAddressFieldChange('logradouro', event.target.value)}
                      className={isAutoFilled('logradouro') ? 'input-autofilled' : ''}
                      disabled={!isAdmin || editingSection !== 'enderecos'}
                    />
                  </Field>
                  <Field label="Número">
                    <input
                      value={draft.newAddress?.numero || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, numero: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'enderecos'}
                    />
                  </Field>
                  <Field label="Complemento">
                    <input
                      value={draft.newAddress?.complemento || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, complemento: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'enderecos'}
                    />
                  </Field>
                  <Field label="Bairro">
                    <input
                      value={draft.newAddress?.bairro || ''}
                      onChange={(event) => handleAddressFieldChange('bairro', event.target.value)}
                      className={isAutoFilled('bairro') ? 'input-autofilled' : ''}
                      disabled={!isAdmin || editingSection !== 'enderecos'}
                    />
                  </Field>
                  <Field label="Cidade">
                    <input
                      value={draft.newAddress?.cidade || ''}
                      onChange={(event) => handleAddressFieldChange('cidade', event.target.value)}
                      className={isAutoFilled('cidade') ? 'input-autofilled' : ''}
                      disabled={!isAdmin || editingSection !== 'enderecos'}
                    />
                  </Field>
                  <Field label="UF">
                    <input
                      value={draft.newAddress?.uf || ''}
                      onChange={(event) => handleAddressFieldChange('uf', event.target.value)}
                      className={isAutoFilled('uf') ? 'input-autofilled' : ''}
                      disabled={!isAdmin || editingSection !== 'enderecos'}
                    />
                  </Field>
                  <Field label="Principal">
                    <input
                      type="checkbox"
                      checked={draft.newAddress?.principal || false}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, principal: event.target.checked } }))}
                      disabled={!isAdmin || editingSection !== 'enderecos'}
                    />
                  </Field>
                  <button className="button primary" type="submit" disabled={!isAdmin || editingSection !== 'enderecos'}>
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
      );
    }

    if (activeSection === 'horarios') {
      return (
        <ClinicFormCard title="Horários de funcionamento" description="Grade semanal de abertura, fechamento e intervalos.">
              <div className="clinic-hours-grid">
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
                        disabled={editingSection !== 'horarios'}
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
                      disabled={editingSection !== 'horarios' || item.fechado}
                    />
                    <input
                      type="time"
                      value={item.fecha}
                      onChange={(event) => {
                        const next = [...(draft.businessHours?.length ? draft.businessHours : defaultHours)];
                        next[idx] = { ...next[idx], fecha: event.target.value };
                        setDraft((prev) => ({ ...prev, businessHours: next }));
                      }}
                      disabled={editingSection !== 'horarios' || item.fechado}
                    />
                    <input
                      type="time"
                      value={item.intervaloInicio}
                      onChange={(event) => {
                        const next = [...(draft.businessHours?.length ? draft.businessHours : defaultHours)];
                        next[idx] = { ...next[idx], intervaloInicio: event.target.value };
                        setDraft((prev) => ({ ...prev, businessHours: next }));
                      }}
                      disabled={editingSection !== 'horarios' || item.fechado}
                    />
                    <input
                      type="time"
                      value={item.intervaloFim}
                      onChange={(event) => {
                        const next = [...(draft.businessHours?.length ? draft.businessHours : defaultHours)];
                        next[idx] = { ...next[idx], intervaloFim: event.target.value };
                        setDraft((prev) => ({ ...prev, businessHours: next }));
                      }}
                      disabled={editingSection !== 'horarios' || item.fechado}
                    />
                  </div>
                ))}
              </div>
        </ClinicFormCard>
      );
    }

    if (activeSection === 'arquivos') {
      return (
              <div className="stack clinic-section-stack">
                <form className="form-grid" onSubmit={addFile}>
                  <Field label="Categoria">
                    <select
                      value={draft.newFile?.categoria || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newFile: { ...prev.newFile, categoria: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'arquivos'}
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
                      disabled={!isAdmin || editingSection !== 'arquivos'}
                    />
                  </Field>
                  <Field label="Validade">
                    <input
                      type="date"
                      value={draft.newFile?.validade || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newFile: { ...prev.newFile, validade: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'arquivos'}
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
                      disabled={!isAdmin || editingSection !== 'arquivos'}
                    />
                  </Field>
                  <button className="button primary" type="submit" disabled={!isAdmin || editingSection !== 'arquivos'}>
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
      );
    }

    if (activeSection === 'correspondencias') {
      return (
        <div className="clinic-section-stack">
          <ClinicFormCard title="Preferências de correspondência" description="Endereço e canais preferenciais de contato.">
              <div className="form-grid clinic-form-grid">
                <Field label="Endereço para correspondência">
                  <select
                    value={draft.correspondence.addressId || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, correspondence: { ...prev.correspondence, addressId: event.target.value } }))}
                    disabled={editingSection !== 'correspondencias'}
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
                    disabled={editingSection !== 'correspondencias'}
                  />
                </Field>
                <Field label="Preferência SMS">
                  <input
                    type="checkbox"
                    checked={draft.correspondence.preferSms}
                    onChange={(event) => setDraft((prev) => ({ ...prev, correspondence: { ...prev.correspondence, preferSms: event.target.checked } }))}
                    disabled={editingSection !== 'correspondencias'}
                  />
                </Field>
                <Field label="Preferência WhatsApp">
                  <input
                    type="checkbox"
                    checked={draft.correspondence.preferWhatsApp}
                    onChange={(event) => setDraft((prev) => ({ ...prev, correspondence: { ...prev.correspondence, preferWhatsApp: event.target.checked } }))}
                    disabled={editingSection !== 'correspondencias'}
                  />
                </Field>
                <Field label="Observações">
                  <textarea
                    value={draft.correspondence.notes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, correspondence: { ...prev.correspondence, notes: event.target.value } }))}
                    disabled={editingSection !== 'correspondencias'}
                  />
                </Field>
              </div>
          </ClinicFormCard>
          <ClinicFormCard title="Observações internas" description="Notas administrativas visíveis apenas para a equipe.">
              <div className="form-grid clinic-form-grid">
                <Field label="Observações internas">
                  <textarea
                    value={draft.additional.notes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, additional: { ...prev.additional, notes: event.target.value } }))}
                    disabled={editingSection !== 'correspondencias'}
                  />
                </Field>
              </div>
          </ClinicFormCard>
        </div>
      );
    }

    if (activeSection === 'email') {
      return (
              <div className="stack clinic-section-stack">
                <ClinicFormCard title="Novo servidor de e-mail" description="Configure SMTP para envio de mensagens pela clínica.">
                <form className="form-grid clinic-form-grid" onSubmit={addMail}>
                  <Field label="Provider">
                    <select
                      value={draft.newMailServer?.provider || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, provider: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'email'}
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
                      disabled={!isAdmin || editingSection !== 'email'}
                    />
                  </Field>
                  <Field label="SMTP Port">
                    <input
                      value={draft.newMailServer?.smtpPort || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, smtpPort: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'email'}
                    />
                  </Field>
                  <Field label="SMTP User">
                    <input
                      value={draft.newMailServer?.smtpUser || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, smtpUser: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'email'}
                    />
                  </Field>
                  <Field label="SMTP Password">
                    <input
                      type="password"
                      value={draft.newMailServer?.smtpPassword || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, smtpPassword: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'email'}
                    />
                  </Field>
                  <Field label="From Name">
                    <input
                      value={draft.newMailServer?.fromName || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, fromName: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'email'}
                    />
                  </Field>
                  <Field label="From Email">
                    <input
                      value={draft.newMailServer?.fromEmail || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newMailServer: { ...prev.newMailServer, fromEmail: event.target.value } }))}
                      disabled={!isAdmin || editingSection !== 'email'}
                    />
                  </Field>
                  <button className="button primary" type="submit" disabled={!isAdmin || editingSection !== 'email'}>
                    Adicionar servidor
                  </button>
                </form>
                </ClinicFormCard>
                <ClinicFormCard title="Servidores configurados" description="Teste a conexão ou remova servidores existentes.">
                <div className="clinic-list-card">
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
                </ClinicFormCard>
              </div>
      );
    }

    if (activeSection === 'nfse') {
      return (
        <ClinicFormCard title="Dados NFSe" description="Integração com prefeitura e emissão de notas fiscais.">
          <div className="form-grid clinic-form-grid">
          <Field label="Provider">
            <input
              value={draft.nfse.provider}
              onChange={(event) => setDraft((prev) => ({ ...prev, nfse: { ...prev.nfse, provider: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'nfse'}
            />
          </Field>
          <Field label="Código municipal">
            <input
              value={draft.nfse.municipalCode}
              onChange={(event) => setDraft((prev) => ({ ...prev, nfse: { ...prev.nfse, municipalCode: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'nfse'}
            />
          </Field>
          <Field label="Token">
            <input
              value={draft.nfse.token}
              onChange={(event) => setDraft((prev) => ({ ...prev, nfse: { ...prev.nfse, token: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'nfse'}
            />
          </Field>
          </div>
        </ClinicFormCard>
      );
    }

    if (activeSection === 'integracoes') {
      return (
        <ClinicFormCard title="Integrações" description="WhatsApp, SMS, webhooks e serviços conectados.">
          <div className="form-grid clinic-form-grid">
          <Field label="WhatsApp API URL">
            <input
              value={draft.integrations.whatsappApiUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, integrations: { ...prev.integrations, whatsappApiUrl: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'integracoes'}
            />
          </Field>
          <Field label="SMS Provider">
            <input
              value={draft.integrations.smsProvider}
              onChange={(event) => setDraft((prev) => ({ ...prev, integrations: { ...prev.integrations, smsProvider: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'integracoes'}
            />
          </Field>
          <Field label="Webhook URL">
            <input
              value={draft.integrations.webhookUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, integrations: { ...prev.integrations, webhookUrl: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'integracoes'}
            />
          </Field>
          </div>
        </ClinicFormCard>
      );
    }

    if (activeSection === 'web') {
      return (
        <ClinicFormCard title="Presença Web" description="Site, redes sociais e links públicos da clínica.">
          <div className="form-grid clinic-form-grid">
          <Field label="Website">
            <input
              value={draft.webPresence.website}
              onChange={(event) => setDraft((prev) => ({ ...prev, webPresence: { ...prev.webPresence, website: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'web'}
            />
          </Field>
          <Field label="Instagram">
            <input
              value={draft.webPresence.instagram}
              onChange={(event) => setDraft((prev) => ({ ...prev, webPresence: { ...prev.webPresence, instagram: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'web'}
            />
          </Field>
          <Field label="Facebook">
            <input
              value={draft.webPresence.facebook}
              onChange={(event) => setDraft((prev) => ({ ...prev, webPresence: { ...prev.webPresence, facebook: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'web'}
            />
          </Field>
          <Field label="Google Maps">
            <input
              value={draft.webPresence.googleMapsUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, webPresence: { ...prev.webPresence, googleMapsUrl: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'web'}
            />
          </Field>
          <Field label="WhatsApp">
            <input
              value={draft.webPresence.whatsappUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, webPresence: { ...prev.webPresence, whatsappUrl: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'web'}
            />
          </Field>
          </div>
        </ClinicFormCard>
      );
    }

    if (activeSection === 'licenca') {
      return (
        <ClinicFormCard title="Licença de Uso" description="Plano contratado, limites e vencimento.">
          <div className="form-grid clinic-form-grid">
          <Field label="Plano">
            <input
              value={draft.license.plan}
              onChange={(event) => setDraft((prev) => ({ ...prev, license: { ...prev.license, plan: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'licenca'}
            />
          </Field>
          <Field label="Expira em">
            <input
              type="date"
              value={draft.license.expiresAt}
              onChange={(event) => setDraft((prev) => ({ ...prev, license: { ...prev.license, expiresAt: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'licenca'}
            />
          </Field>
          <Field label="Usuários">
            <input
              type="number"
              value={draft.license.seats}
              onChange={(event) => setDraft((prev) => ({ ...prev, license: { ...prev.license, seats: event.target.value } }))}
              disabled={!isAdmin || editingSection !== 'licenca'}
            />
          </Field>
          </div>
        </ClinicFormCard>
      );
    }

    return null;
  }, [activeSection, editingSection, clinic, draft, user, isAdmin, cepLoading, cepError, isAutoFilled, handleCepChange, handleCepBlur, handleAddressFieldChange, lookupCep]);

  const headerProps = {
    logoUrl: draft.profile?.logoUrl,
    displayName: draft.profile?.nomeClinica || draft.profile?.nomeMarca || draft.profile?.nomeFantasia,
    razaoSocial: draft.profile?.razaoSocial,
    documento: formatCnpj(draft.documentation?.cnpj || ''),
    statusLabel: 'Ativa',
    email: draft.profile?.emailPrincipal,
    phone: primaryPhone,
    isEditing: isRecordEditing,
    canEdit: canEditActiveSection,
    canSave: canSaveFromHeader,
    onEdit: () => startEdit(activeSection),
    onSave: saveActiveSection,
    onCancel: cancelEdit,
    menuItems: isAdmin ? [
      { label: 'Ir para visão geral', onClick: () => handleSectionChange('geral') },
      { label: 'Ir para integrações', onClick: () => handleSectionChange('integracoes') },
    ] : [],
  };

  return (
    <ClinicRecordShell
      headerProps={headerProps}
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
      hasUnsavedChanges={hasUnsavedChanges}
      successMessage={success}
      errorMessage={error}
      onDiscard={cancelEdit}
      onSave={saveActiveSection}
    >
      {sectionContent}
    </ClinicRecordShell>
  );
}
