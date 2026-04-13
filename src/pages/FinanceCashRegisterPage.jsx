import { useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { Section } from '../components/Section.jsx';
import OpenCashRegisterModal from '../components/finance/OpenCashRegisterModal.jsx';
import { getCashSummaryForDate, getTodayCashRegister, openCashRegister } from '../services/cashRegisterService.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function FinanceCashRegisterPage() {
  const { user } = useAuth();
  const [selectedDate] = useState(todayIso());
  const [refreshKey, setRefreshKey] = useState(0);
  const [openModal, setOpenModal] = useState(false);

  const summary = useMemo(
    () => getCashSummaryForDate(selectedDate),
    [selectedDate, refreshKey]
  );

  const todayRegister = useMemo(() => getTodayCashRegister(), [refreshKey]);
  const isOpen = Boolean(todayRegister && todayRegister.status === 'open');

  const handleOpenCash = ({ initialCash, note }) => {
    openCashRegister(user, { initialCash, note });
    setOpenModal(false);
    setRefreshKey((k) => k + 1);
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number.isFinite(value) ? value : 0
    );

  return (
    <div className="finance-cash-page">
      <Section
        title="Caixa Diário"
        actions={
          isOpen ? (
            <span className="finance-cash-status finance-cash-status--open">
              Caixa aberto em {summary.date}
            </span>
          ) : (
            <span className="finance-cash-status finance-cash-status--closed">
              Caixa fechado
            </span>
          )
        }
      >
        {!isOpen ? (
          <div className="finance-cash-closed-state">
            <p className="finance-cash-closed-text">
              Nenhum caixa aberto para hoje.
            </p>
            <button
              type="button"
              className="button primary finance-cash-open-btn"
              onClick={() => setOpenModal(true)}
            >
              Abrir Caixa
            </button>
          </div>
        ) : (
          <div className="finance-cash-summary-grid">
            <div className="finance-cash-card">
              <h3>Saldo inicial</h3>
              <strong>{formatCurrency(summary.initialCash)}</strong>
            </div>
            <div className="finance-cash-card finance-cash-card--in">
              <h3>Entradas do dia</h3>
              <strong>{formatCurrency(summary.entries)}</strong>
            </div>
            <div className="finance-cash-card finance-cash-card--out">
              <h3>Saídas do dia</h3>
              <strong>{formatCurrency(summary.exits)}</strong>
            </div>
            <div className="finance-cash-card finance-cash-card--balance">
              <h3>Saldo atual</h3>
              <strong>{formatCurrency(summary.currentBalance)}</strong>
            </div>
          </div>
        )}
      </Section>

      <OpenCashRegisterModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        onConfirm={handleOpenCash}
        selectedDate={selectedDate}
        userName={user?.name || 'Usuário'}
      />
    </div>
  );
}

