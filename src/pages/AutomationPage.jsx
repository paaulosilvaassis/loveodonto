import { useEffect, useState } from 'react';
import { Section } from '../components/Section.jsx';
import { generateAutomationTasks, listAutomationTasks } from '../services/automationService.js';
import { generateAppointmentReminders } from '../services/communicationService.js';

export default function AutomationPage() {
  const [tasks, setTasks] = useState([]);

  const refresh = () => setTasks(listAutomationTasks());

  useEffect(() => {
    refresh();
  }, []);

  const handleGenerate = () => {
    generateAutomationTasks();
    refresh();
  };

  const handleReminders = () => {
    generateAppointmentReminders();
    refresh();
  };

  return (
    <div className="stack">
      <Section title="Fila de automações">
        <div className="list-actions">
          <button className="button primary" type="button" onClick={handleGenerate}>
            Gerar tarefas automáticas
          </button>
          <button className="button secondary" type="button" onClick={handleReminders}>
            Gerar lembretes de consultas
          </button>
        </div>
        <div className="card">
          <ul className="list">
            {tasks.length === 0 ? (
              <li className="muted">Sem tarefas.</li>
            ) : (
              tasks.map((task) => (
                <li key={task.id}>
                  {task.type} · {task.description}
                </li>
              ))
            )}
          </ul>
        </div>
      </Section>
    </div>
  );
}
