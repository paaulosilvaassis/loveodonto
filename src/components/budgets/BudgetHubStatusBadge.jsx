import {
  FileEdit,
  Send,
  MessageCircle,
  CheckCircle2,
  FileSignature,
  Wallet,
  XCircle,
  Archive,
} from 'lucide-react';
import { BUDGET_STATUS } from '../../services/clinicalBudgetConstants.js';

const STATUS_CONFIG = {
  [BUDGET_STATUS.RASCUNHO]: { label: 'Em elaboração', tone: 'gray', Icon: FileEdit },
  [BUDGET_STATUS.ENVIADO]: { label: 'Apresentado', tone: 'blue', Icon: Send },
  [BUDGET_STATUS.NEGOCIACAO]: { label: 'Em negociação', tone: 'blue', Icon: MessageCircle },
  [BUDGET_STATUS.APROVADO]: { label: 'Aprovado', tone: 'green', Icon: CheckCircle2 },
  [BUDGET_STATUS.CONTRATO_GERADO]: { label: 'Contrato gerado', tone: 'purple', Icon: FileSignature },
  [BUDGET_STATUS.HISTORICO]: { label: 'Histórico', tone: 'dark', Icon: Archive },
  [BUDGET_STATUS.REPROVADO]: { label: 'Reprovado', tone: 'red', Icon: XCircle },
  [BUDGET_STATUS.CANCELADO]: { label: 'Cancelado', tone: 'red', Icon: XCircle },
};

export function BudgetHubStatusBadge({ status, hasFinance = false }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[BUDGET_STATUS.RASCUNHO];
  const Icon = config.Icon;

  return (
    <div className="bhub-status-group">
      <span className={`bhub-status-badge tone-${config.tone}`}>
        <Icon size={13} aria-hidden />
        {config.label}
      </span>
      {hasFinance ? (
        <span className="bhub-status-badge tone-finance">
          <Wallet size={13} aria-hidden />
          Financeiro gerado
        </span>
      ) : null}
    </div>
  );
}
