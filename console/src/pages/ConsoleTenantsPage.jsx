import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../auth/usePlatformAuth.js';
import {
  createClinicOnboarding,
  getPlatformApiConfigError,
  listCatalogs,
  listClinics,
} from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge, EmptyState } from '../components/ConsoleUi.jsx';

const WIZARD_STEPS = [
  { id: 1, label: 'Dados' },
  { id: 2, label: 'Usuário' },
  { id: 3, label: 'Plano' },
  { id: 4, label: 'Revisão' },
];

const PLAN_BENEFITS = {
  Start: ['Agenda essencial', 'Cadastro de pacientes', 'Ideal para começar'],
  Growth: ['Agenda e pacientes', 'Financeiro completo', 'CRM para crescimento'],
  Scale: ['Todos os módulos', 'Escala operacional', 'Visão completa da clínica'],
};

export default function ConsoleTenantsPage() {
  const navigate = useNavigate();
  const { platformUser } = usePlatformAuth();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [plan, setPlan] = useState('all');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [provisionResult, setProvisionResult] = useState(null);
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [form, setForm] = useState({
    clinicName: '',
    city: '',
    ownerName: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    planCode: 'Start',
  });
  const catalogs = useMemo(() => listCatalogs(), []);
  const platformApiConfigError = useMemo(() => getPlatformApiConfigError(), []);

  // TODO(temp): Fallback temporário — libera o botão "Nova Clínica" enquanto o backend
  // de perfil/permissão em produção não retorna o role corretamente.
  // Remover quando GET /internal/platform/console-profile estiver funcional em produção.
  const ENABLE_CREATE_CLINIC_FALLBACK = true;
  const canCreateClinic =
    ENABLE_CREATE_CLINIC_FALLBACK
    || ['owner', 'super_admin'].includes(String(platformUser?.role || '').toLowerCase());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setListLoading(true);
        const data = await listClinics({ query, status, plan });
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setListError(e?.message || 'Erro ao carregar clínicas.');
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, status, plan]);

  const handleOpenOnboarding = () => {
    setFormError('');
    setSuccessMessage('');
    setProvisionResult(null);
    setStep(1);
    setForm({
      clinicName: '',
      city: '',
      ownerName: '',
      adminName: '',
      adminEmail: '',
      adminPassword: '',
      planCode: 'Start',
    });
    setShowOnboarding(true);
  };

  const handleCloseOnboarding = () => {
    if (creating) return;
    setShowOnboarding(false);
    setStep(1);
    setFormError('');
  };

  const updateForm = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const validateStep = (currentStep) => {
    if (currentStep === 1) {
      if (!form.clinicName.trim()) return 'Nome da clínica é obrigatório.';
      return '';
    }
    if (currentStep === 2) {
      const email = form.adminEmail.trim().toLowerCase();
      if (!form.adminName.trim()) return 'Nome do administrador é obrigatório.';
      if (!email) return 'E-mail do administrador é obrigatório.';
      if (form.adminPassword && form.adminPassword.length < 8) {
        return 'Senha deve ter pelo menos 8 caracteres ou ficar vazia (o servidor gera uma temporária).';
      }
      return '';
    }
    if (currentStep === 3) {
      if (!catalogs.plans.includes(form.planCode)) return 'Plano inválido.';
      return '';
    }
    return '';
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError('');
    setStep((prev) => Math.min(4, prev + 1));
  };

  const handleBack = () => {
    setFormError('');
    setStep((prev) => Math.max(1, prev - 1));
  };

  const planModules = useMemo(() => {
    if (form.planCode === 'Start') return ['Agenda', 'Pacientes'];
    if (form.planCode === 'Growth') return ['Agenda', 'Pacientes', 'Financeiro', 'CRM'];
    return catalogs.modules;
  }, [catalogs.modules, form.planCode]);

  const handleConfirmCreate = async () => {
    const err = validateStep(1) || validateStep(2) || validateStep(3);
    if (err) {
      setFormError(err);
      return;
    }
    setCreating(true);
    setFormError('');
    setSuccessMessage('');
    try {
      const result = await createClinicOnboarding(platformUser, {
        clinicName: form.clinicName,
        city: form.city,
        ownerName: form.ownerName,
        adminName: form.adminName,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
        planCode: form.planCode,
      });
      setSuccessMessage('Clínica criada com sucesso.');
      setShowOnboarding(false);
      setProvisionResult({
        clinicName: result?.clinic?.name || form.clinicName,
        clinicId: result?.clinic?.id || '',
        adminEmail: form.adminEmail,
        temporaryPassword: result?.temporaryPassword || '',
        passwordWasGenerated: Boolean(result?.temporaryPassword),
      });
      const refreshed = await listClinics({ query, status, plan });
      setRows(refreshed);
    } catch (error) {
      setFormError(error?.message || 'Erro ao criar clínica.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="pc-stack">
      <PageHeader
        title="Clínicas"
        description="Gestão de clínicas, módulos, situação da conta e governança operacional."
        actions={canCreateClinic ? (
          <button
            type="button"
            className="pc-button"
            onClick={handleOpenOnboarding}
            disabled={Boolean(platformApiConfigError)}
            title={platformApiConfigError || 'Criar nova clínica'}
          >
            + Nova Clínica
          </button>
        ) : null}
      />
      {platformApiConfigError ? <p className="pc-error">{platformApiConfigError}</p> : null}
      {successMessage ? <p className="pc-success">{successMessage}</p> : null}
      {provisionResult ? (
        <Panel
          title="Credenciais da clínica provisionada"
          description="Provisionamento concluído sem sucesso parcial. Use estas credenciais no Love Odonto."
          actions={(
            <button
              type="button"
              className="pc-button pc-button--active"
              onClick={async () => {
                const credentialsText = [
                  `Clínica: ${provisionResult.clinicName}`,
                  `E-mail: ${provisionResult.adminEmail}`,
                  provisionResult.passwordWasGenerated
                    ? `Senha temporária: ${provisionResult.temporaryPassword}`
                    : 'Senha: a definida no cadastro da clínica',
                  'Troque a senha no primeiro acesso.',
                ].join('\n');
                await navigator.clipboard.writeText(credentialsText);
                setSuccessMessage('Credenciais copiadas com sucesso.');
              }}
            >
              Copiar credenciais
            </button>
          )}
        >
          <div className="pc-review-grid">
            <p><strong>Clínica:</strong> {provisionResult.clinicName}</p>
            <p><strong>E-mail do responsável:</strong> {provisionResult.adminEmail}</p>
            <p><strong>Senha:</strong> {provisionResult.passwordWasGenerated ? provisionResult.temporaryPassword : 'A senha definida no cadastro'}</p>
            <p><strong>Aviso:</strong> Troque a senha no primeiro acesso.</p>
          </div>
          {provisionResult.clinicId ? (
            <div className="pc-inline-actions">
              <button
                type="button"
                className="pc-button"
                onClick={() => navigate(`/tenants/${provisionResult.clinicId}`)}
              >
                Ir para detalhe da clínica
              </button>
            </div>
          ) : null}
        </Panel>
      ) : null}
      <Panel>
        <div className="pc-filters">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por clínica, e-mail, cidade..." />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todas as situações</option>
            <option value="active">Ativas</option>
            <option value="suspended">Bloqueadas</option>
          </select>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="all">Todos planos</option>
            <option value="Start">Start</option>
            <option value="Growth">Growth</option>
            <option value="Scale">Scale</option>
          </select>
        </div>

        {listError ? <p className="pc-error">{listError}</p> : null}
        {listLoading ? <p className="pc-loading-inline">Carregando clínicas…</p> : null}

        {!listLoading && !listError && rows.length === 0 ? (
          <EmptyState
            title="Nenhuma clínica cadastrada ainda"
            description="Não há registros em tenants com os filtros atuais. Use Nova Clínica para cadastrar ou ajuste os filtros."
          />
        ) : null}

        {!listLoading && rows.length > 0 ? (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Clínica</th>
                  <th>Responsável</th>
                  <th>Plano</th>
                  <th>Status</th>
                  <th>Cobrança</th>
                  <th>Módulos</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tenant) => (
                  <tr key={tenant.id}>
                    <td>
                      <strong>{tenant.name}</strong>
                      <small>{tenant.city}/{tenant.state}</small>
                    </td>
                    <td>
                      {tenant.ownerName}
                      <small>{tenant.ownerEmail}</small>
                    </td>
                    <td>{tenant.plan}</td>
                    <td><StatusBadge status={tenant.status} /></td>
                    <td><StatusBadge status={tenant.billingStatus} /></td>
                    <td>{tenant.modules.length}</td>
                    <td>
                      <Link className="pc-link-button" to={`/tenants/${tenant.id}`}>Ver detalhes</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      {showOnboarding ? (
        <div className="pc-onboarding-backdrop" role="dialog" aria-modal="true" aria-label="Nova clínica">
          <div className="pc-onboarding-panel">
            <div className="pc-onboarding-header">
              <h3>Nova Clínica</h3>
              <p>Etapa {step} de 4</p>
            </div>

            <div className="pc-onboarding-steps" aria-label="Progresso do cadastro">
              {WIZARD_STEPS.map((item) => {
                const isActive = step === item.id;
                const isDone = step > item.id;
                return (
                  <div
                    key={item.id}
                    className={`pc-onboarding-step ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
                  >
                    <span className="pc-onboarding-step-dot">{isDone ? '●' : isActive ? '●' : '○'}</span>
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="pc-onboarding-body">
              {step === 1 ? (
                <div className="pc-step-content">
                  <h4>Dados da clínica</h4>
                  <label className="pc-form-field">
                    <span>Nome da clínica</span>
                    <input
                      value={form.clinicName}
                      onChange={(e) => updateForm({ clinicName: e.target.value })}
                      placeholder="Ex.: Clínica Exemplo LTDA"
                    />
                  </label>
                  <label className="pc-form-field">
                    <span>Cidade</span>
                    <input
                      value={form.city}
                      onChange={(e) => updateForm({ city: e.target.value })}
                      placeholder="Ex.: São Paulo"
                    />
                  </label>
                  <label className="pc-form-field">
                    <span>Nome do responsável</span>
                    <input
                      value={form.ownerName}
                      onChange={(e) => updateForm({ ownerName: e.target.value })}
                      placeholder="Ex.: Dra. Ana Costa"
                    />
                  </label>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="pc-step-content">
                  <h4>Usuário administrador</h4>
                  <p className="pc-login__hint" style={{ marginBottom: '0.75rem' }}>
                    O cadastro cria o vínculo em tenant_users. O provisionamento de credenciais no app principal é feito pelo fluxo de auth do produto (convite ou painel), não pela Console.
                  </p>
                  <label className="pc-form-field">
                    <span>Nome</span>
                    <input
                      value={form.adminName}
                      onChange={(e) => updateForm({ adminName: e.target.value })}
                      placeholder="Nome completo"
                    />
                  </label>
                  <label className="pc-form-field">
                    <span>E-mail</span>
                    <input
                      type="email"
                      value={form.adminEmail}
                      onChange={(e) => updateForm({ adminEmail: e.target.value })}
                      placeholder="admin@clinica.com"
                    />
                  </label>
                  <label className="pc-form-field">
                    <span>Senha (opcional)</span>
                    <input
                      type="password"
                      value={form.adminPassword}
                      onChange={(e) => updateForm({ adminPassword: e.target.value })}
                      placeholder="Não armazenada na Console — uso futuro / convite"
                    />
                  </label>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="pc-step-content">
                  <h4>Escolha de plano</h4>
                  <div className="pc-plan-grid">
                    {catalogs.plans.map((planName) => {
                      const selected = form.planCode === planName;
                      return (
                        <button
                          key={planName}
                          type="button"
                          className={`pc-plan-card ${selected ? 'is-selected' : ''}`}
                          onClick={() => updateForm({ planCode: planName })}
                        >
                          <strong>{planName}</strong>
                          <ul>
                            {(PLAN_BENEFITS[planName] || []).map((benefit) => (
                              <li key={benefit}>{benefit}</li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 4 ? (
                <div className="pc-step-content">
                  <h4>Revisão</h4>
                  <div className="pc-review-grid">
                    <p><strong>Clínica:</strong> {form.clinicName || '—'}</p>
                    <p><strong>Cidade:</strong> {form.city || '—'}</p>
                    <p><strong>Responsável:</strong> {form.ownerName || '—'}</p>
                    <p><strong>Administrador:</strong> {form.adminName || '—'}</p>
                    <p><strong>E-mail:</strong> {form.adminEmail || '—'}</p>
                    <p><strong>Plano:</strong> {form.planCode}</p>
                    <p><strong>Módulos liberados:</strong> {planModules.join(', ')}</p>
                  </div>
                </div>
              ) : null}
            </div>

            {formError ? <p className="pc-error">{formError}</p> : null}

            <div className="pc-onboarding-actions">
              <button type="button" className="pc-button" onClick={handleCloseOnboarding} disabled={creating}>
                Cancelar
              </button>
              {step > 1 ? (
                <button type="button" className="pc-button" onClick={handleBack} disabled={creating}>
                  Voltar
                </button>
              ) : null}
              {step < 4 ? (
                <button type="button" className="pc-button pc-button--active" onClick={handleNext} disabled={creating}>
                  Próxima etapa
                </button>
              ) : (
                <button type="button" className="pc-button pc-button--active" onClick={handleConfirmCreate} disabled={creating}>
                  {creating ? 'Criando clínica...' : 'Criar clínica'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
