import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../auth/PlatformAuthContext.jsx';
import { createClinicOnboarding, listCatalogs, listClinics } from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge } from '../components/ConsoleUi.jsx';

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
  const canCreateClinic = ['owner', 'super_admin'].includes(String(platformUser?.role || '').toLowerCase());
  const rows = useMemo(() => listClinics({ query, status, plan }), [query, status, plan]);

  const handleOpenOnboarding = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24093c'},body:JSON.stringify({sessionId:'24093c',runId:'initial',hypothesisId:'H1',location:'ConsoleTenantsPage.jsx:handleOpenOnboarding',message:'Open onboarding requested',data:{canCreateClinic,role:String(platformUser?.role||'')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setFormError('');
    setSuccessMessage('');
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24093c'},body:JSON.stringify({sessionId:'24093c',runId:'initial',hypothesisId:'H2',location:'ConsoleTenantsPage.jsx:validateStep',message:'Validating wizard step',data:{currentStep,hasClinicName:Boolean(form.clinicName.trim()),hasAdminName:Boolean(form.adminName.trim()),hasAdminEmail:Boolean(form.adminEmail.trim()),passwordLen:Number(form.adminPassword?.length||0),planCode:form.planCode},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (currentStep === 1) {
      if (!form.clinicName.trim()) return 'Nome da clínica é obrigatório.';
      return '';
    }
    if (currentStep === 2) {
      const email = form.adminEmail.trim().toLowerCase();
      if (!form.adminName.trim()) return 'Nome do administrador é obrigatório.';
      if (!email) return 'E-mail do administrador é obrigatório.';
      if (!form.adminPassword || form.adminPassword.length < 8) {
        return 'Senha deve ter no mínimo 8 caracteres.';
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24093c'},body:JSON.stringify({sessionId:'24093c',runId:'initial',hypothesisId:'H2',location:'ConsoleTenantsPage.jsx:handleNext',message:'Next step decision',data:{step,hasError:Boolean(err),errorMessage:err||''},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24093c'},body:JSON.stringify({sessionId:'24093c',runId:'initial',hypothesisId:'H3',location:'ConsoleTenantsPage.jsx:handleConfirmCreate',message:'Creating clinic started',data:{clinicName:form.clinicName.trim(),city:form.city.trim(),ownerName:form.ownerName.trim(),adminName:form.adminName.trim(),adminEmailDomain:(form.adminEmail.split('@')[1]||''),planCode:form.planCode},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    try {
      const clinic = await createClinicOnboarding(platformUser, {
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24093c'},body:JSON.stringify({sessionId:'24093c',runId:'initial',hypothesisId:'H5',location:'ConsoleTenantsPage.jsx:handleConfirmCreate',message:'Clinic created on page',data:{clinicId:clinic?.id||null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      window.setTimeout(() => navigate(`/tenants/${clinic.id}`), 700);
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24093c'},body:JSON.stringify({sessionId:'24093c',runId:'initial',hypothesisId:'H4',location:'ConsoleTenantsPage.jsx:handleConfirmCreate',message:'Create clinic failed on page',data:{errorMessage:error?.message||'unknown'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
          <button type="button" className="pc-button" onClick={handleOpenOnboarding}>
            + Nova Clínica
          </button>
        ) : null}
      />
      {successMessage ? <p className="pc-success">{successMessage}</p> : null}
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

        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Clínica</th>
                <th>Responsável</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Saúde</th>
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
                  <td><StatusBadge status={tenant.health} /></td>
                  <td>{tenant.modules.length}</td>
                  <td>
                    <Link className="pc-link-button" to={`/tenants/${tenant.id}`}>Ver detalhes</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                      placeholder="Ex.: Clínica Sorriso Feliz"
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
                    <span>Senha</span>
                    <input
                      type="password"
                      minLength={8}
                      value={form.adminPassword}
                      onChange={(e) => updateForm({ adminPassword: e.target.value })}
                      placeholder="Mínimo de 8 caracteres"
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
