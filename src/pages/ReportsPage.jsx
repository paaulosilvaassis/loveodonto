import { Section } from '../components/Section.jsx';
import { Link } from 'react-router-dom';
import { downloadCsv } from '../utils/csv.js';
import { loadDb } from '../db/index.js';
import { getClinicSummary } from '../services/clinicService.js';
import { listCollaborators } from '../services/collaboratorService.js';

export default function ReportsPage() {
  const db = loadDb();
  const clinic = getClinicSummary();
  const collaborators = listCollaborators();

  const exportPatients = () => {
    downloadCsv({
      filename: 'pacientes.csv',
      rows: db.patients.map((item) => ({
        clinica: clinic?.nomeClinica || '',
        cnpj: clinic?.cnpj || '',
        nome: item.name,
        telefone: item.phone,
        email: item.email,
      })),
    });
  };

  const exportAgenda = () => {
    downloadCsv({
      filename: 'agenda.csv',
      rows: db.appointments.map((item) => ({
        clinica: clinic?.nomeClinica || '',
        cnpj: clinic?.cnpj || '',
        data: item.date,
        inicio: item.startTime,
        fim: item.endTime,
        status: item.status,
      })),
    });
  };

  const exportFinance = () => {
    downloadCsv({
      filename: 'financeiro.csv',
      rows: db.transactions.map((item) => ({
        clinica: clinic?.nomeClinica || '',
        cnpj: clinic?.cnpj || '',
        tipo: item.type,
        valor: item.amount,
        vencimento: item.dueDate,
        status: item.status,
      })),
    });
  };

  const exportProductivity = () => {
    downloadCsv({
      filename: 'produtividade.csv',
      rows: (db.records || []).map((item) => ({
        clinica: clinic?.nomeClinica || '',
        cnpj: clinic?.cnpj || '',
        paciente: item.patientId,
        data: item.date,
        tipo: item.type,
        procedimento: item.procedureName,
      })),
    });
  };

  const exportCollaborators = () => {
    const map = collaborators.reduce((acc, item) => {
      acc[item.id] = item.nomeCompleto;
      return acc;
    }, {});
    downloadCsv({
      filename: 'produtividade-colaboradores.csv',
      rows: db.appointments.map((item) => ({
        clinica: clinic?.nomeClinica || '',
        cnpj: clinic?.cnpj || '',
        profissional: map[item.professionalId] || item.professionalId,
        data: item.date,
        status: item.status,
      })),
    });
  };

  const exportFinancings = () => {
    downloadCsv({
      filename: 'financiamentos.csv',
      rows: (db.financings || []).map((item) => ({
        clinica: clinic?.nomeClinica || '',
        id: item.id,
        paciente_id: item.patient_id,
        descricao: item.description,
        valor_total: item.total_amount,
        valor_financiado: item.net_financed_amount,
        parcelas: item.installments_count,
        status: item.status,
        aprovado_em: item.approved_at || '',
        criado_em: item.created_at || '',
      })),
    });
  };

  const exportFinancingInstallments = () => {
    downloadCsv({
      filename: 'parcelas-financiadas.csv',
      rows: (db.financingInstallments || []).map((item) => ({
        financiamento_id: item.financing_id,
        parcela: `${item.installment_number}/${item.total_installments}`,
        vencimento: item.due_date,
        valor: item.net_amount,
        pago: item.paid_amount,
        aberto: item.remaining_amount,
        status: item.status,
      })),
    });
  };

  const exportBoletos = () => {
    downloadCsv({
      filename: 'boletos.csv',
      rows: (db.boletoCharges || []).map((item) => ({
        id: item.id,
        financiamento_id: item.financing_id,
        parcela_id: item.installment_id,
        paciente_id: item.patient_id,
        tipo: item.charge_type,
        status: item.status,
        valor: item.amount,
        vencimento: item.due_date,
        pago_em: item.paid_at || '',
        linha_digitavel: item.linha_digitavel || '',
      })),
    });
  };

  return (
    <div className="stack">
      <div className="card">
        <strong>{clinic?.nomeClinica || 'Clínica'}</strong>
        <div className="muted">CNPJ: {clinic?.cnpj || '—'}</div>
      </div>
      <div className="card finance-reports-hub-banner">
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          Estes arquivos CSV complementam a{' '}
          <Link to="/financeiro/relatorios/dre">Central de Análise</Link>
          : decisão e cenários na central; extrações operacionais aqui.
        </p>
      </div>
      <Section title="Relatórios exportáveis">
        <div className="grid cards">
          <div className="card">
            <h3>Pacientes</h3>
            <button className="button secondary" type="button" onClick={exportPatients}>
              Exportar CSV
            </button>
          </div>
          <div className="card">
            <h3>Agenda</h3>
            <button className="button secondary" type="button" onClick={exportAgenda}>
              Exportar CSV
            </button>
          </div>
          <div className="card">
            <h3>Financeiro</h3>
            <button className="button secondary" type="button" onClick={exportFinance}>
              Exportar CSV
            </button>
          </div>
          <div className="card">
            <h3>Produtividade</h3>
            <button className="button secondary" type="button" onClick={exportProductivity}>
              Exportar CSV
            </button>
          </div>
          <div className="card">
            <h3>Produtividade por colaborador</h3>
            <button className="button secondary" type="button" onClick={exportCollaborators}>
              Exportar CSV
            </button>
          </div>
          <div className="card">
            <h3>Financiamentos ativos</h3>
            <button className="button secondary" type="button" onClick={exportFinancings}>
              Exportar CSV
            </button>
          </div>
          <div className="card">
            <h3>Parcelas financiadas (aging)</h3>
            <button className="button secondary" type="button" onClick={exportFinancingInstallments}>
              Exportar CSV
            </button>
          </div>
          <div className="card">
            <h3>Boletos pagos x vencidos</h3>
            <button className="button secondary" type="button" onClick={exportBoletos}>
              Exportar CSV
            </button>
          </div>
          <div className="card">
            <h3>Central de Análise</h3>
            <p className="muted">Receita, custos, lucro, margem e insights por mês.</p>
            <Link className="button secondary" to="/financeiro/relatorios/dre">
              Abrir DRE
            </Link>
          </div>
        </div>
        <p className="muted">PDF não está habilitado; use CSV conforme requisito.</p>
      </Section>
    </div>
  );
}
