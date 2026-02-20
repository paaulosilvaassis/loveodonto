import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Field } from '../components/Field.jsx';
import { Section } from '../components/Section.jsx';
import { loadDb } from '../db/index.js';
import {
  createInstallmentPlan,
  createTransaction,
  getCashflow,
  getCommissions,
  getDelinquency,
  listTransactions,
} from '../services/financeService.js';
import { getProfessionalOptions } from '../services/collaboratorService.js';

export default function FinancePage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');
  const [cashflowFilter, setCashflowFilter] = useState({ startDate: '', endDate: '' });
  const [transactionForm, setTransactionForm] = useState({
    type: 'receber',
    amount: '',
    dueDate: '',
    status: 'aberto',
    patientId: '',
    professionalId: '',
    description: '',
    category: '',
    boletoData: '',
  });
  const [planForm, setPlanForm] = useState({
    patientId: '',
    professionalId: '',
    total: '',
    installments: 3,
    startDate: '',
    intervalDays: 30,
    description: 'Tratamento',
  });

  const db = useMemo(() => loadDb(), []);
  const patients = db.patients;
  const professionals = useMemo(() => {
    const collaborators = getProfessionalOptions();
    if (collaborators.length) return collaborators;
    return db.users.filter((item) => item.role === 'profissional').map((item) => ({ id: item.id, name: item.name }));
  }, [db.users]);

  const refresh = () => setTransactions(listTransactions());

  useEffect(() => {
    refresh();
  }, []);

  const handleTransaction = (event) => {
    event.preventDefault();
    setError('');
    try {
      createTransaction(user, transactionForm);
      setTransactionForm({
        type: 'receber',
        amount: '',
        dueDate: '',
        status: 'aberto',
        patientId: '',
        professionalId: '',
        description: '',
        category: '',
        boletoData: '',
      });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePlan = (event) => {
    event.preventDefault();
    setError('');
    try {
      createInstallmentPlan(user, planForm);
      setPlanForm({
        patientId: '',
        professionalId: '',
        total: '',
        installments: 3,
        startDate: '',
        intervalDays: 30,
        description: 'Tratamento',
      });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const cashflow = getCashflow(cashflowFilter);
  const delinquency = getDelinquency();
  const commissions = getCommissions();

  return (
    <div className="stack">
      <Section title="Contas a pagar/receber">
        <form className="form-grid" onSubmit={handleTransaction}>
          <Field label="Tipo">
            <select value={transactionForm.type} onChange={(event) => setTransactionForm({ ...transactionForm, type: event.target.value })}>
              <option value="receber">Receber</option>
              <option value="pagar">Pagar</option>
            </select>
          </Field>
          <Field label="Valor">
            <input
              type="number"
              value={transactionForm.amount}
              onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })}
            />
          </Field>
          <Field label="Vencimento">
            <input type="date" value={transactionForm.dueDate} onChange={(event) => setTransactionForm({ ...transactionForm, dueDate: event.target.value })} />
          </Field>
          <Field label="Paciente">
            <select value={transactionForm.patientId} onChange={(event) => setTransactionForm({ ...transactionForm, patientId: event.target.value })}>
              <option value="">Selecione</option>
              {patients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Profissional">
            <select
              value={transactionForm.professionalId}
              onChange={(event) => setTransactionForm({ ...transactionForm, professionalId: event.target.value })}
            >
              <option value="">Selecione</option>
              {professionals.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Descrição">
            <input value={transactionForm.description} onChange={(event) => setTransactionForm({ ...transactionForm, description: event.target.value })} />
          </Field>
          <Field label="Categoria">
            <input value={transactionForm.category} onChange={(event) => setTransactionForm({ ...transactionForm, category: event.target.value })} />
          </Field>
          <Field label="Boleto (linha digitável)">
            <input
              value={transactionForm.boletoData}
              onChange={(event) => setTransactionForm({ ...transactionForm, boletoData: event.target.value })}
              placeholder="Opcional"
            />
          </Field>
          {error ? <div className="error">{error}</div> : null}
          <button className="button primary" type="submit">
            Salvar conta
          </button>
        </form>
        <div className="card">
          <h3>Últimas contas</h3>
          <ul className="list">
            {transactions.slice(-6).map((txn) => (
              <li key={txn.id}>
                {txn.dueDate} · {txn.type} · R$ {txn.amount} · {txn.status}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Parcelas por tratamento">
        <form className="form-grid" onSubmit={handlePlan}>
          <Field label="Paciente">
            <select value={planForm.patientId} onChange={(event) => setPlanForm({ ...planForm, patientId: event.target.value })}>
              <option value="">Selecione</option>
              {patients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Profissional">
            <select
              value={planForm.professionalId}
              onChange={(event) => setPlanForm({ ...planForm, professionalId: event.target.value })}
            >
              <option value="">Selecione</option>
              {professionals.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Total">
            <input type="number" value={planForm.total} onChange={(event) => setPlanForm({ ...planForm, total: event.target.value })} />
          </Field>
          <Field label="Parcelas">
            <input
              type="number"
              value={planForm.installments}
              onChange={(event) => setPlanForm({ ...planForm, installments: event.target.value })}
            />
          </Field>
          <Field label="Data inicial">
            <input type="date" value={planForm.startDate} onChange={(event) => setPlanForm({ ...planForm, startDate: event.target.value })} />
          </Field>
          <Field label="Intervalo (dias)">
            <input
              type="number"
              value={planForm.intervalDays}
              onChange={(event) => setPlanForm({ ...planForm, intervalDays: event.target.value })}
            />
          </Field>
          <Field label="Descrição">
            <input value={planForm.description} onChange={(event) => setPlanForm({ ...planForm, description: event.target.value })} />
          </Field>
          {error ? <div className="error">{error}</div> : null}
          <button className="button primary" type="submit">
            Gerar parcelas
          </button>
        </form>
      </Section>

      <Section title="Fluxo de caixa e inadimplência">
        <div className="form-grid">
          <Field label="Início">
            <input
              type="date"
              value={cashflowFilter.startDate}
              onChange={(event) => setCashflowFilter({ ...cashflowFilter, startDate: event.target.value })}
            />
          </Field>
          <Field label="Fim">
            <input
              type="date"
              value={cashflowFilter.endDate}
              onChange={(event) => setCashflowFilter({ ...cashflowFilter, endDate: event.target.value })}
            />
          </Field>
        </div>
        <div className="grid cards">
          <div className="card">
            <h3>Entradas</h3>
            <strong>R$ {cashflow.totalEntries.toFixed(2)}</strong>
          </div>
          <div className="card">
            <h3>Saídas</h3>
            <strong>R$ {cashflow.totalExits.toFixed(2)}</strong>
          </div>
          <div className="card">
            <h3>Saldo</h3>
            <strong>R$ {cashflow.balance.toFixed(2)}</strong>
          </div>
          <div className="card">
            <h3>Inadimplentes</h3>
            <strong>{delinquency.length}</strong>
          </div>
        </div>
      </Section>

      <Section title="Comissões por profissional">
        <div className="card">
          <ul className="list">
            {Object.entries(commissions).length === 0 ? (
              <li className="muted">Sem comissões calculadas.</li>
            ) : (
              Object.entries(commissions).map(([professionalId, value]) => {
                const professional = professionals.find((item) => item.id === professionalId);
                return (
                  <li key={professionalId}>
                    {professional?.name || professionalId}: R$ {value.toFixed(2)}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </Section>
    </div>
  );
}
