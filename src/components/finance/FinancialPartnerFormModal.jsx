import { useEffect, useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
} from '../ui/Modal.jsx';
import {
  FINANCIAL_PARTNER_TYPES,
  FINANCIAL_PARTNER_STATUS,
  FINANCIAL_PARTNER_TYPE_LABELS,
} from '../../services/financialPartnersService.js';
import { FINANCING_INTEREST_TYPES } from '../../services/financingCalculator.js';

const INTEREST_OPTIONS = [
  { value: FINANCING_INTEREST_TYPES.NONE, label: 'Sem juros' },
  { value: FINANCING_INTEREST_TYPES.SIMPLE, label: 'Juros simples' },
  { value: FINANCING_INTEREST_TYPES.COMPOUND, label: 'Juros compostos' },
  { value: FINANCING_INTEREST_TYPES.FIXED_PERCENT, label: 'Percentual fixo sobre o valor' },
];

const emptyForm = () => ({
  name: '',
  type: FINANCIAL_PARTNER_TYPES.EXTERNAL,
  default_interest_type: FINANCING_INTEREST_TYPES.NONE,
  default_interest_rate: 0,
  max_installments: 36,
  min_entry_percent: 0,
  min_entry_amount: 0,
  admin_fee_rate: 0,
  admin_fee_amount: 0,
  avg_approval_days: 3,
  status: FINANCIAL_PARTNER_STATUS.ACTIVE,
  notes: '',
});

export default function FinancialPartnerFormModal({
  open,
  partner,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(partner?.id);
  const isSystem = Boolean(partner?.is_system);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (partner) {
      setForm({
        name: partner.name || '',
        type: partner.type || FINANCIAL_PARTNER_TYPES.EXTERNAL,
        default_interest_type: partner.default_interest_type || FINANCING_INTEREST_TYPES.NONE,
        default_interest_rate: Number(partner.default_interest_rate || 0),
        max_installments: Number(partner.max_installments || 36),
        min_entry_percent: Number(partner.min_entry_percent || 0),
        min_entry_amount: Number(partner.min_entry_amount || 0),
        admin_fee_rate: Number(partner.admin_fee_rate || 0),
        admin_fee_amount: Number(partner.admin_fee_amount || 0),
        avg_approval_days: Number(partner.avg_approval_days || 0),
        status: partner.status || FINANCIAL_PARTNER_STATUS.ACTIVE,
        notes: partner.notes || '',
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, partner]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Informe o nome do parceiro.');
      return;
    }
    setSubmitting(true);
    try {
      onSubmit(form);
    } catch (err) {
      setError(err.message || 'Erro ao salvar parceiro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next && !submitting) onClose(); }}>
      <ModalContent size="lg" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>{isEdit ? 'Editar parceiro financeiro' : 'Novo parceiro financeiro'}</ModalTitle>
        </ModalHeader>
        <form id="financial-partner-form" onSubmit={handleSubmit}>
          <ModalBody className="finance-partner-form-body">
            {error ? <p className="finance-partner-form-error">{error}</p> : null}
            <div className="finance-partner-form-grid">
              <label>
                Nome do parceiro *
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  disabled={isSystem && partner?.id !== 'fpartner-other'}
                  required
                />
              </label>
              <label>
                Tipo
                <select
                  value={form.type}
                  onChange={(e) => setField('type', e.target.value)}
                  disabled={isSystem}
                >
                  {Object.entries(FINANCIAL_PARTNER_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Tipo de juros padrão
                <select
                  value={form.default_interest_type}
                  onChange={(e) => setField('default_interest_type', e.target.value)}
                >
                  {INTEREST_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Taxa padrão de juros (%)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.default_interest_rate}
                  onChange={(e) => setField('default_interest_rate', Number(e.target.value))}
                  disabled={form.default_interest_type === FINANCING_INTEREST_TYPES.NONE}
                />
              </label>
              <label>
                Máx. parcelas
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={form.max_installments}
                  onChange={(e) => setField('max_installments', Number(e.target.value))}
                />
              </label>
              <label>
                Entrada mínima (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.min_entry_percent}
                  onChange={(e) => setField('min_entry_percent', Number(e.target.value))}
                />
              </label>
              <label>
                Entrada mínima (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.min_entry_amount}
                  onChange={(e) => setField('min_entry_amount', Number(e.target.value))}
                />
              </label>
              <label>
                Taxa administrativa (%)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.admin_fee_rate}
                  onChange={(e) => setField('admin_fee_rate', Number(e.target.value))}
                />
              </label>
              <label>
                Taxa administrativa (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.admin_fee_amount}
                  onChange={(e) => setField('admin_fee_amount', Number(e.target.value))}
                />
              </label>
              <label>
                Prazo médio de aprovação (dias)
                <input
                  type="number"
                  min="0"
                  value={form.avg_approval_days}
                  onChange={(e) => setField('avg_approval_days', Number(e.target.value))}
                />
              </label>
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) => setField('status', e.target.value)}
                >
                  <option value={FINANCIAL_PARTNER_STATUS.ACTIVE}>Ativo</option>
                  <option value={FINANCIAL_PARTNER_STATUS.INACTIVE}>Inativo</option>
                </select>
              </label>
            </div>
            <label className="finance-partner-form-notes">
              Observações
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                placeholder="Condições comerciais, contatos, observações internas…"
              />
            </label>
          </ModalBody>
          <ModalFooter>
            <button type="button" className="button secondary" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="button primary" form="financial-partner-form" disabled={submitting}>
              {isEdit ? 'Salvar alterações' : 'Cadastrar parceiro'}
            </button>
          </ModalFooter>
        </form>
      </ModalContent>
    </ModalRoot>
  );
}
