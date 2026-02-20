import { Section } from '../components/Section.jsx';
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

  return (
    <div className="stack">
      <div className="card">
        <strong>{clinic?.nomeClinica || 'Clínica'}</strong>
        <div className="muted">CNPJ: {clinic?.cnpj || '—'}</div>
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
        </div>
        <p className="muted">PDF não está habilitado; use CSV conforme requisito.</p>
      </Section>
    </div>
  );
}
