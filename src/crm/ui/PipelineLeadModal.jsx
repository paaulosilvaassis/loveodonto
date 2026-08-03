import { useEffect, useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../../components/ui/Modal.jsx';
import Button from '../../components/Button.jsx';
import {
  LEAD_SOURCE,
  createLead,
} from '../../services/crmService.js';
import { formatPhone, onlyDigits } from '../../utils/validators.js';
import { parseCurrencyBRL, formatCurrencyBRL } from '../../utils/currency.js';
import { useCrmTenantLabels } from '../hooks/useCrmTenantLabels.js';

const FORM_ID = 'pipeline-new-lead-form';
const MIN_PHONE_DIGITS = 10;

const initialForm = (stageKey) => ({
  name: '',
  phone: '',
  source: LEAD_SOURCE.MANUAL,
  interest: '',
  assignedToUserId: '',
  estimatedValue: '',
  notes: '',
  stageKey: stageKey || '',
});

/**
 * Cadastro rápido de lead direto no pipeline, com fase inicial pré-selecionada.
 */
export function PipelineLeadModal({ open, onClose, user, users = [], stages = [], initialStageKey, onCreated }) {
  const tenantId = user?.tenantId || user?.tenant_id || '';
  const { sourceLabels, interestLabels } = useCrmTenantLabels(user, tenantId);
  const [form, setForm] = useState(() => initialForm(initialStageKey));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialForm(initialStageKey || stages[0]?.key || ''));
      setError('');
    }
  }, [open, initialStageKey, stages]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Informe o nome do lead.');
      return;
    }
    if (onlyDigits(form.phone).length < MIN_PHONE_DIGITS) {
      setError('Informe um telefone válido com DDD.');
      return;
    }
    setSubmitting(true);
    try {
      const lead = createLead(user, {
        name: form.name.trim(),
        phone: onlyDigits(form.phone),
        source: form.source || LEAD_SOURCE.MANUAL,
        interest: form.interest || undefined,
        assignedToUserId: form.assignedToUserId || undefined,
        estimatedValue: form.estimatedValue ? parseCurrencyBRL(form.estimatedValue) : undefined,
        notes: form.notes.trim() || undefined,
        stageKey: form.stageKey || undefined,
      });
      onCreated?.(lead);
      onClose();
    } catch (err) {
      setError(err?.message || 'Erro ao cadastrar lead.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeUsers = users.filter((u) => u.active !== false);

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>Novo lead</ModalTitle>
          <ModalDescription>
            Cadastre o lead e ele entra direto na fase escolhida do pipeline.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          {error && <div className="crm-stages-config-error" role="alert">{error}</div>}
          <form id={FORM_ID} onSubmit={handleSubmit} className="crm-captacao-form" noValidate>
            <div className="form-field">
              <label htmlFor="pl-lead-name">Nome completo *</label>
              <input
                id="pl-lead-name"
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Ex.: Maria Oliveira dos Santos"
                autoComplete="off"
              />
            </div>
            <div className="crm-captacao-form-row">
              <div className="form-field">
                <label htmlFor="pl-lead-phone">Telefone / WhatsApp *</label>
                <input
                  id="pl-lead-phone"
                  type="tel"
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(e) => handleChange('phone', formatPhone(e.target.value))}
                  placeholder="(11) 99999-9999"
                  autoComplete="off"
                />
              </div>
              <div className="form-field">
                <label htmlFor="pl-lead-stage">Fase do pipeline</label>
                <select
                  id="pl-lead-stage"
                  value={form.stageKey}
                  onChange={(e) => handleChange('stageKey', e.target.value)}
                >
                  {stages.map((stage) => (
                    <option key={stage.key} value={stage.key}>{stage.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="crm-captacao-form-row">
              <div className="form-field">
                <label htmlFor="pl-lead-source">Origem</label>
                <select
                  id="pl-lead-source"
                  value={form.source}
                  onChange={(e) => handleChange('source', e.target.value)}
                >
                  {Object.entries(sourceLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="pl-lead-interest">Interesse principal</label>
                <select
                  id="pl-lead-interest"
                  value={form.interest}
                  onChange={(e) => handleChange('interest', e.target.value)}
                >
                  <option value="">Selecione</option>
                  {Object.entries(interestLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="crm-captacao-form-row">
              <div className="form-field">
                <label htmlFor="pl-lead-responsible">Responsável</label>
                <select
                  id="pl-lead-responsible"
                  value={form.assignedToUserId}
                  onChange={(e) => handleChange('assignedToUserId', e.target.value)}
                >
                  <option value="">Eu (usuário atual)</option>
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name || u.id}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="pl-lead-value">Valor estimado (R$)</label>
                <input
                  id="pl-lead-value"
                  type="text"
                  inputMode="numeric"
                  value={form.estimatedValue}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    handleChange('estimatedValue', digits ? formatCurrencyBRL(parseInt(digits, 10) / 100) : '');
                  }}
                  placeholder="R$ 0,00"
                />
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="pl-lead-notes">Observações</label>
              <textarea
                id="pl-lead-notes"
                value={form.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={3}
                placeholder="Ex.: indicado pela paciente Ana; prefere sábados."
              />
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={submitting}>
            Cadastrar lead
          </Button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
