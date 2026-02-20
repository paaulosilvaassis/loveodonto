import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CrmLayout } from '../../crm/ui/CrmLayout.jsx';
import {
  createLead,
  listLeads,
  LEAD_SOURCE,
  LEAD_SOURCE_LABELS,
  LEAD_INTEREST_LABELS,
} from '../../services/crmService.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { loadDb } from '../../db/index.js';
import { Inbox, UserPlus } from 'lucide-react';

const SOURCE_OPTIONS = [
  LEAD_SOURCE.WHATSAPP,
  LEAD_SOURCE.INSTAGRAM,
  LEAD_SOURCE.SITE,
  LEAD_SOURCE.GOOGLE_ADS,
  LEAD_SOURCE.INDICACAO,
  LEAD_SOURCE.TELEFONE,
  LEAD_SOURCE.WALK_IN,
  LEAD_SOURCE.MANUAL,
];

const INTEREST_OPTIONS = Object.keys(LEAD_INTEREST_LABELS);

const initialForm = () => ({
  name: '',
  phone: '',
  source: LEAD_SOURCE.MANUAL,
  interest: '',
  notes: '',
  assignedToUserId: '',
});

export default function CrmCaptacaoPage() {
  const { user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [listVersion, setListVersion] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const users = useMemo(() => loadDb().users || [], []);
  const leads = useMemo(() => listLeads(), [listVersion]);
  const recentLeads = useMemo(() => leads.slice(0, 15), [leads]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSubmitError('');
    setSubmitSuccess(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess(false);
    const name = (form.name || '').trim();
    if (!name) {
      setSubmitError('Informe o nome do lead.');
      return;
    }
    const phone = (form.phone || '').replace(/\D/g, '');
    if (!phone) {
      setSubmitError('Informe o telefone (com DDD).');
      return;
    }
    try {
      createLead(user, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        source: form.source || LEAD_SOURCE.MANUAL,
        interest: (form.interest || '').trim() || undefined,
        notes: (form.notes || '').trim() || undefined,
        assignedToUserId: form.assignedToUserId || user?.id || undefined,
      });
      setForm(initialForm());
      setListVersion((v) => v + 1);
      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(err.message || 'Erro ao cadastrar lead.');
    }
  };

  return (
    <CrmLayout
      title="Captação de Leads"
      description="Cadastre novos leads manualmente. Origem e interesse configuráveis; lead não vira paciente automaticamente."
    >
      <div className="crm-captacao-layout">
        <section className="crm-captacao-form-section card">
          <h2 className="crm-captacao-form-title">
            <UserPlus size={20} /> Novo lead
          </h2>
          <form onSubmit={handleSubmit} className="crm-captacao-form">
            <div className="form-field">
              <label htmlFor="captacao-name">Nome *</label>
              <input
                id="captacao-name"
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Nome completo"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="captacao-phone">Telefone (DDD + número) *</label>
              <input
                id="captacao-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="Ex.: 11 99999-9999"
                required
              />
            </div>
            <div className="crm-captacao-form-row">
              <div className="form-field">
                <label htmlFor="captacao-source">Origem</label>
                <select
                  id="captacao-source"
                  value={form.source}
                  onChange={(e) => handleChange('source', e.target.value)}
                >
                  {SOURCE_OPTIONS.map((key) => (
                    <option key={key} value={key}>
                      {LEAD_SOURCE_LABELS[key] || key}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="captacao-interest">Interesse principal</label>
                <select
                  id="captacao-interest"
                  value={form.interest}
                  onChange={(e) => handleChange('interest', e.target.value)}
                >
                  <option value="">— Selecione —</option>
                  {INTEREST_OPTIONS.map((key) => (
                    <option key={key} value={key}>
                      {LEAD_INTEREST_LABELS[key] || key}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="captacao-notes">Observações</label>
              <textarea
                id="captacao-notes"
                value={form.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Anotações sobre o lead..."
                rows={2}
              />
            </div>
            {users.length > 1 && (
              <div className="form-field">
                <label htmlFor="captacao-responsavel">Responsável</label>
                <select
                  id="captacao-responsavel"
                  value={form.assignedToUserId}
                  onChange={(e) => handleChange('assignedToUserId', e.target.value)}
                >
                  <option value="">Eu (usuário atual)</option>
                  {users.filter((u) => u.active !== false).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {submitError && (
              <p className="crm-captacao-error" role="alert">
                {submitError}
              </p>
            )}
            {submitSuccess && (
              <p className="crm-captacao-success" role="status">
                Lead cadastrado com sucesso.
              </p>
            )}
            <div className="crm-captacao-form-actions">
              <button type="submit" className="button primary">
                Cadastrar lead
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setForm(initialForm());
                  setSubmitError('');
                  setSubmitSuccess(false);
                }}
              >
                Limpar
              </button>
            </div>
          </form>
        </section>

        <section className="crm-captacao-list-section card">
          <h2 className="crm-captacao-list-title">
            <Inbox size={20} /> Últimos leads captados
          </h2>
          <div className="crm-leads-table-wrap">
            <table className="crm-leads-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Origem</th>
                  <th>Interesse</th>
                  <th>Estágio</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="crm-leads-empty">
                      Nenhum lead cadastrado. Use o formulário ao lado para captar o primeiro.
                    </td>
                  </tr>
                ) : (
                  recentLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td>{lead.name || '—'}</td>
                      <td>{lead.phone || '—'}</td>
                      <td>{LEAD_SOURCE_LABELS[lead.source] || lead.source || '—'}</td>
                      <td>{LEAD_INTEREST_LABELS[lead.interest] || lead.interest || '—'}</td>
                      <td><span className="crm-leads-stage">{lead.stageKey?.replace(/_/g, ' ')}</span></td>
                      <td>
                        <Link to={`/crm/leads/${lead.id}`} className="crm-leads-link">
                          Ver perfil
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {leads.length > 0 && (
            <p className="crm-captacao-list-footer muted">
              <Link to="/crm/leads">Ver todos os leads ({leads.length})</Link>
            </p>
          )}
        </section>
      </div>
    </CrmLayout>
  );
}
