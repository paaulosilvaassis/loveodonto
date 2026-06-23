import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../auth/usePlatformAuth.js';
import {
  createClinicOnboarding,
  getPlatformApiConfigError,
  listCatalogs,
  listClinics,
} from '../services/platformConsoleService.js';
import ConsoleClinicOnboardingWizard from '../components/ConsoleClinicOnboardingWizard.jsx';
import { PageHeader, Panel, StatusBadge, EmptyState } from '../components/ConsoleUi.jsx';
import { PLAN_CATALOG, getPlanLabel } from '../services/platformConsoleConstants.js';

export default function ConsoleTenantsPage() {
  const navigate = useNavigate();
  const { platformUser } = usePlatformAuth();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [plan, setPlan] = useState('all');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [provisionResult, setProvisionResult] = useState(null);
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const catalogs = useMemo(() => listCatalogs(), []);
  const platformApiConfigError = useMemo(() => getPlatformApiConfigError(), []);

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
    setShowOnboarding(true);
  };

  const handleCreateClinic = async (payload) => {
    setCreating(true);
    setFormError('');
    setSuccessMessage('');
    try {
      const result = await createClinicOnboarding(platformUser, payload);
      setSuccessMessage('Clínica criada com sucesso.');
      setShowOnboarding(false);
      setProvisionResult({
        clinicName: result?.clinic?.tradeName || result?.clinic?.name || payload.tradeName,
        clinicId: result?.clinic?.id || '',
        adminEmail: payload.legalRepresentativeEmail || payload.adminEmail,
        temporaryPassword: result?.temporaryPassword || '',
        passwordWasGenerated: Boolean(result?.temporaryPassword),
        onboardingEmail: result?.onboardingEmail || null,
        accessEmailSent: Boolean(result?.accessEmailSent),
        accessSetupLink: result?.accessSetupLink || result?.onboardingEmail?.setupLink || null,
        accessEmailDelivery: result?.accessEmailDelivery || null,
      });
      const refreshed = await listClinics({ query, status, plan });
      setRows(refreshed);
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
      {formError ? <p className="pc-error">{formError}</p> : null}
      {successMessage ? <p className="pc-success">{successMessage}</p> : null}
      {provisionResult ? (
        <Panel
          title="Credenciais da clínica provisionada"
          description="Provisionamento concluído. Use estas credenciais no Love Odonto."
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
            <p><strong>E-mail de acesso:</strong> {provisionResult.adminEmail}</p>
            <p><strong>Senha:</strong> {
              provisionResult.onboardingEmail?.accessEmailDelivery === 'supabase_auth'
                ? 'Será definida pelo link enviado ao e-mail de acesso'
                : provisionResult.passwordWasGenerated
                  ? provisionResult.temporaryPassword || 'Use o link de senha abaixo'
                  : 'A senha definida no cadastro'
            }</p>
            {(provisionResult.accessEmailSent || provisionResult.onboardingEmail?.accessEmailSent) ? (
              <p><strong>E-mail de acesso:</strong> Convite enviado para {provisionResult.adminEmail}.</p>
            ) : (
              <p className="pc-error">
                <strong>E-mail de acesso não enviado automaticamente.</strong>{' '}
                {provisionResult.onboardingEmail?.reason || 'Configure EMAIL_API_KEY no backend (Railway) ou use o link abaixo.'}
              </p>
            )}
            {provisionResult.onboardingEmail?.sent ? (
              <p><strong>E-mail do contrato:</strong> Contrato de usabilidade enviado para {provisionResult.adminEmail}.</p>
            ) : (provisionResult.accessEmailSent || provisionResult.onboardingEmail?.accessEmailSent) ? (
              <p><strong>E-mail do contrato:</strong> {provisionResult.onboardingEmail?.reason || 'Configure EMAIL_API_KEY no backend para enviar o contrato por e-mail.'}</p>
            ) : null}
            {provisionResult.onboardingEmail?.acceptTermsLink ? (
              <p><strong>Link do contrato:</strong> {provisionResult.onboardingEmail.acceptTermsLink}</p>
            ) : null}
            {(provisionResult.accessSetupLink || provisionResult.onboardingEmail?.setupLink) ? (
              <p><strong>Link de primeiro acesso (copie se o e-mail não chegar):</strong>{' '}
                {provisionResult.accessSetupLink || provisionResult.onboardingEmail.setupLink}
              </p>
            ) : null}
            <p><strong>Aviso:</strong> O responsável deve aceitar o contrato pelo e-mail para concluir a ativação legal.</p>
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
            {PLAN_CATALOG.map((planCode) => (
              <option key={planCode} value={planCode}>{getPlanLabel(planCode)}</option>
            ))}
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
                      <strong>{tenant.tradeName || tenant.name}</strong>
                      <small>{tenant.cnpj || 'Sem CNPJ'} · {tenant.city}/{tenant.state}</small>
                    </td>
                    <td>
                      {tenant.ownerName}
                      <small>{tenant.ownerEmail}</small>
                    </td>
                    <td>{getPlanLabel(tenant.plan)}</td>
                    <td><StatusBadge status={tenant.status} /></td>
                    <td><StatusBadge status={tenant.billingStatus} /></td>
                    <td>{tenant.modules.length}</td>
                    <td>
                      <Link className="pc-link-button" to={`/tenants/${tenant.id}`}>Ver detalhes</Link>
                      {' · '}
                      <Link className="pc-link-button" to={`/tenants/${tenant.id}#acesso-master`}>Acesso master</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      <ConsoleClinicOnboardingWizard
        open={showOnboarding}
        creating={creating}
        catalogs={catalogs}
        onClose={() => setShowOnboarding(false)}
        onSubmit={handleCreateClinic}
      />
    </div>
  );
}
