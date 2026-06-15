import { useMemo, useState } from 'react';
import { Plus, Pencil, Building2 } from 'lucide-react';
import { useAuth } from '../../auth/useAuth.js';
import { can } from '../../permissions/permissions.js';
import {
  listFinancialPartners,
  createFinancialPartner,
  updateFinancialPartner,
  FINANCIAL_PARTNER_STATUS,
  FINANCIAL_PARTNER_TYPE_LABELS,
} from '../../services/financialPartnersService.js';
import { FINANCING_INTEREST_TYPES } from '../../services/financingCalculator.js';
import FinancialPartnerFormModal from './FinancialPartnerFormModal.jsx';

const interestLabel = {
  [FINANCING_INTEREST_TYPES.NONE]: 'Sem juros',
  [FINANCING_INTEREST_TYPES.SIMPLE]: 'Juros simples',
  [FINANCING_INTEREST_TYPES.COMPOUND]: 'Juros compostos',
  [FINANCING_INTEREST_TYPES.FIXED_PERCENT]: 'Percentual fixo',
};

export default function FinancialPartnersPanel({ refreshKey, onChanged }) {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);

  const canEdit = can(user, 'financeiro_financiamentos:edit');

  const partners = useMemo(
    () => listFinancialPartners(),
    [refreshKey],
  );

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (partner) => {
    setEditing(partner);
    setModalOpen(true);
  };

  const handleSubmit = (form) => {
    try {
      if (editing?.id) {
        updateFinancialPartner(user, editing.id, form);
        showToast('Parceiro atualizado.');
      } else {
        createFinancialPartner(user, form);
        showToast('Parceiro cadastrado.');
      }
      setModalOpen(false);
      onChanged?.();
    } catch (error) {
      throw error;
    }
  };

  return (
    <section className="finance-partners-panel">
      {toast ? (
        <div className={`toast ${toast.type}`} role="status">{toast.message}</div>
      ) : null}

      <div className="finance-partners-header">
        <div>
          <h2>Parceiros financeiros</h2>
          <p>Cadastre bancos, financeiras e regras do financiamento próprio da clínica.</p>
        </div>
        {canEdit ? (
          <button type="button" className="button primary" onClick={openCreate}>
            <Plus size={16} />
            Novo parceiro
          </button>
        ) : null}
      </div>

      <div className="finance-partners-grid">
        {partners.map((partner) => (
          <article
            key={partner.id}
            className={`finance-partner-card${partner.status === FINANCIAL_PARTNER_STATUS.INACTIVE ? ' is-inactive' : ''}`}
          >
            <header>
              <Building2 size={18} />
              <div>
                <strong>{partner.name}</strong>
                <span>{FINANCIAL_PARTNER_TYPE_LABELS[partner.type] || partner.type}</span>
              </div>
              <span className={`finance-partner-status finance-partner-status--${partner.status}`}>
                {partner.status === FINANCIAL_PARTNER_STATUS.ACTIVE ? 'Ativo' : 'Inativo'}
              </span>
            </header>
            <dl>
              <div>
                <dt>Juros padrão</dt>
                <dd>{interestLabel[partner.default_interest_type] || '—'} · {Number(partner.default_interest_rate || 0)}%</dd>
              </div>
              <div>
                <dt>Parcelas máx.</dt>
                <dd>{partner.max_installments}x</dd>
              </div>
              <div>
                <dt>Entrada mín.</dt>
                <dd>
                  {Number(partner.min_entry_percent || 0)}%
                  {Number(partner.min_entry_amount || 0) > 0
                    ? ` · R$ ${Number(partner.min_entry_amount).toFixed(2)}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Taxa adm.</dt>
                <dd>
                  {Number(partner.admin_fee_rate || 0) > 0 ? `${partner.admin_fee_rate}%` : '—'}
                  {Number(partner.admin_fee_amount || 0) > 0
                    ? ` · R$ ${Number(partner.admin_fee_amount).toFixed(2)}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Aprovação média</dt>
                <dd>{partner.avg_approval_days ?? '—'} dia(s)</dd>
              </div>
            </dl>
            {partner.notes ? <p className="finance-partner-notes">{partner.notes}</p> : null}
            {canEdit ? (
              <footer>
                <button type="button" className="button secondary" onClick={() => openEdit(partner)}>
                  <Pencil size={14} />
                  Editar
                </button>
              </footer>
            ) : null}
          </article>
        ))}
      </div>

      <FinancialPartnerFormModal
        open={modalOpen}
        partner={editing}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </section>
  );
}
