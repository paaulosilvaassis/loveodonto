import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalTitle,
} from '../../ui/Modal.jsx';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import { PLANNING_STAGE_OPTIONS } from '../planning/planningUtils.js';

function stageLabel(value) {
  return PLANNING_STAGE_OPTIONS.find((s) => s.value === value)?.label || value || '—';
}

export function BudgetProceduresDetailModal({ open, onClose, procedures = [] }) {
  const rows = procedures.map((proc) => {
    const qty = Number(proc.quantity || 1);
    const unit = Number(proc.unitValue || 0);
    const total = Number(proc.totalValue ?? qty * unit);
    return { ...proc, qty, unit, total };
  });

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>Procedimentos do tratamento</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="clinical-budget-proc-modal-table-wrap">
            <table className="clinical-budget-proc-modal-table">
              <thead>
                <tr>
                  <th>Procedimento</th>
                  <th>Etapa</th>
                  <th>Região</th>
                  <th>Qtd</th>
                  <th>Unitário</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id || row.name}>
                    <td>
                      <strong>{row.name || row.title}</strong>
                      {row.code ? <small>{row.code}</small> : null}
                    </td>
                    <td>{stageLabel(row.stage)}</td>
                    <td>{row.tooth || row.region || '—'}</td>
                    <td>{row.qty}</td>
                    <td>{formatCurrencyBRL(row.unit)}</td>
                    <td>{formatCurrencyBRL(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="clinical-budget-proc-modal-total">
            <span>Total planejado</span>
            <strong>{formatCurrencyBRL(grandTotal)}</strong>
          </div>
        </ModalBody>
      </ModalContent>
    </ModalRoot>
  );
}
