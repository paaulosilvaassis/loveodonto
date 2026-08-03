import { useState } from 'react';
import { Eraser, Save, UserPlus } from 'lucide-react';
import {
  LEAD_SOURCE,
  LEAD_SOURCE_LABELS,
  LEAD_INTEREST_LABELS,
  getPipelineStages,
} from '../../services/crmService.js';
import { formatPhone, onlyDigits } from '../../utils/validators.js';
import GradientButton from '../../components/GradientButton.jsx';
import Button from '../../components/Button.jsx';

export const CONTACT_TIME_LABELS = {
  manha: 'Manhã (8h às 12h)',
  tarde: 'Tarde (12h às 18h)',
  noite: 'Noite (após 18h)',
};

const MIN_PHONE_DIGITS = 10;

const initialForm = () => ({
  name: '',
  phone: '',
  source: LEAD_SOURCE.MANUAL,
  interest: '',
  bestContactTime: '',
  notes: '',
  assignedToUserId: '',
  stageKey: 'novo_lead',
});

/**
 * Formulário de cadastro rápido de lead (Captação).
 * Validação obrigatória de nome e telefone; máscara de telefone na digitação.
 * @param {Object} props
 * @param {Array} props.users - Usuários ativos para o campo Responsável
 * @param {(payload: Object) => boolean} props.onCreate - Persiste o lead; retorna true em sucesso
 * @param {React.RefObject} props.nameInputRef - Ref do campo nome (foco via "+ Novo lead")
 */
export function CaptacaoLeadForm({
  users = [],
  onCreate,
  nameInputRef,
  sourceLabels = LEAD_SOURCE_LABELS,
  interestLabels = LEAD_INTEREST_LABELS,
}) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});

  const stages = getPipelineStages();
  const activeUsers = users.filter((u) => u.active !== false);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const resetForm = () => {
    setForm(initialForm());
    setErrors({});
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Informe o nome completo do lead.';
    if (onlyDigits(form.phone).length < MIN_PHONE_DIGITS) {
      next.phone = 'Informe um telefone válido com DDD.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const saved = onCreate({
      name: form.name.trim(),
      phone: onlyDigits(form.phone),
      source: form.source || LEAD_SOURCE.MANUAL,
      interest: form.interest || undefined,
      bestContactTime: form.bestContactTime || undefined,
      notes: form.notes.trim() || undefined,
      assignedToUserId: form.assignedToUserId || undefined,
      stageKey: form.stageKey || 'novo_lead',
    });
    if (saved) resetForm();
  };

  return (
    <section className="crm-captacao-card crm-captacao-form-section" aria-labelledby="captacao-form-title">
      <h2 id="captacao-form-title" className="crm-captacao-card-title">
        <span className="crm-captacao-card-title-icon"><UserPlus size={18} /></span>
        Novo lead
      </h2>
      <form onSubmit={handleSubmit} className="crm-captacao-form" noValidate>
        <div className={`form-field ${errors.name ? 'has-error' : ''}`}>
          <label htmlFor="captacao-name">Nome completo *</label>
          <input
            id="captacao-name"
            ref={nameInputRef}
            type="text"
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Ex.: Maria Oliveira dos Santos"
            autoComplete="off"
          />
          {errors.name && <p className="crm-captacao-field-error" role="alert">{errors.name}</p>}
        </div>

        <div className={`form-field ${errors.phone ? 'has-error' : ''}`}>
          <label htmlFor="captacao-phone">Telefone / WhatsApp *</label>
          <input
            id="captacao-phone"
            type="tel"
            inputMode="numeric"
            value={form.phone}
            onChange={(e) => handleChange('phone', formatPhone(e.target.value))}
            placeholder="(11) 99999-9999"
            autoComplete="off"
          />
          {errors.phone && <p className="crm-captacao-field-error" role="alert">{errors.phone}</p>}
        </div>

        <div className="crm-captacao-form-row">
          <div className="form-field">
            <label htmlFor="captacao-source">Origem do lead</label>
            <select
              id="captacao-source"
              value={form.source}
              onChange={(e) => handleChange('source', e.target.value)}
            >
              {Object.entries(sourceLabels).map(([key, label]) => (
                <option key={key} value={key}>{label || key}</option>
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
              <option value="">Selecione o interesse</option>
              {Object.keys(interestLabels).map((key) => (
                <option key={key} value={key}>{interestLabels[key] || key}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="crm-captacao-form-row">
          <div className="form-field">
            <label htmlFor="captacao-best-time">Melhor horário para contato</label>
            <select
              id="captacao-best-time"
              value={form.bestContactTime}
              onChange={(e) => handleChange('bestContactTime', e.target.value)}
            >
              <option value="">Qualquer horário</option>
              {Object.entries(CONTACT_TIME_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="captacao-stage">Status inicial</label>
            <select
              id="captacao-stage"
              value={form.stageKey}
              onChange={(e) => handleChange('stageKey', e.target.value)}
            >
              {stages.map((stage) => (
                <option key={stage.key} value={stage.key}>{stage.label}</option>
              ))}
            </select>
          </div>
        </div>

        {activeUsers.length > 1 && (
          <div className="form-field">
            <label htmlFor="captacao-responsavel">Responsável pelo atendimento</label>
            <select
              id="captacao-responsavel"
              value={form.assignedToUserId}
              onChange={(e) => handleChange('assignedToUserId', e.target.value)}
            >
              <option value="">Eu (usuário atual)</option>
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name || u.id}</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-field">
          <label htmlFor="captacao-notes">Observações</label>
          <textarea
            id="captacao-notes"
            value={form.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Ex.: indicado pela paciente Ana; prefere atendimento aos sábados."
            rows={3}
          />
        </div>

        <div className="crm-captacao-form-actions">
          <GradientButton type="submit" icon={Save} ariaLabel="Salvar lead">
            Salvar lead
          </GradientButton>
          <Button type="button" variant="ghost" icon={Eraser} onClick={resetForm}>
            Limpar formulário
          </Button>
        </div>
      </form>
    </section>
  );
}
