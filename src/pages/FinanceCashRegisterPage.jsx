import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Section } from '../components/Section.jsx';
import { getCashSummaryForDate, getTodayCashRegister, openCashRegister } from '../services/cashRegisterService.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function FinanceCashRegisterPage() {
  const { user } = useAuth();
  const [selectedDate] = useState(todayIso());
  const [refreshKey, setRefreshKey] = useState(0);
  const [openModal, setOpenModal] = useState(false);
  const [initialCash, setInitialCash] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const summary = useMemo(
    () => getCashSummaryForDate(selectedDate),
    [selectedDate, refreshKey]
  );

  const todayRegister = useMemo(() => getTodayCashRegister(), [refreshKey]);
  const isOpen = Boolean(todayRegister && todayRegister.status === 'open');

  const handleOpenCash = (event) => {
    event.preventDefault();
    setError('');
    try {
      openCashRegister(user, { initialCash: Number(initialCash || 0), note });
      setOpenModal(false);
      setInitialCash('');
      setNote('');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err?.message || 'Erro ao abrir caixa.');
    }
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
              onClick={() => {
                setError('');
                setOpenModal(true);
              }}
            >
              Abrir Caixa
            </button>
            {error && (
              <p className="finance-cash-error" role="alert">
                {error}
              </p>
            )}
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

      {openModal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setOpenModal(false);
            setError('');
          }}
        >
          <div
            className="modal-content finance-cash-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Abertura de Caixa</h3>
            <form className="finance-cash-form" onSubmit={handleOpenCash}>
              <div className="form-row">
                <label>
                  Data
                  <input type="date" value={selectedDate} readOnly />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Usuário responsável
                  <input
                    type="text"
                    value={user?.name || 'Usuário'}
                    readOnly
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Saldo inicial em dinheiro
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={initialCash}
                    onChange={(e) => setInitialCash(e.target.value)}
                    placeholder="0,00"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Observação
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Opcional"
                  />
                </label>
              </div>
              {error && (
                <p className="finance-cash-error" role="alert">
                  {error}
                </p>
              )}
              <div className="finance-cash-modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setOpenModal(false);
                    setError('');
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="button primary">
                  Confirmar abertura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

