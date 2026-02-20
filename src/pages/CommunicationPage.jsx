import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Field } from '../components/Field.jsx';
import { Section } from '../components/Section.jsx';
import { loadDb } from '../db/index.js';
import { createTemplate, listLogs, listQueue, listTemplates, queueMessage, sendQueuedMessage } from '../services/communicationService.js';

export default function CommunicationPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [queue, setQueue] = useState([]);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [templateForm, setTemplateForm] = useState({ name: '', channel: 'whatsapp', content: '' });
  const [messageForm, setMessageForm] = useState({ patientId: '', appointmentId: '', templateId: '', channel: 'whatsapp' });
  const db = loadDb();

  const refresh = () => {
    setTemplates(listTemplates());
    setQueue(listQueue());
    setLogs(listLogs());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleTemplate = (event) => {
    event.preventDefault();
    setError('');
    try {
      createTemplate(user, templateForm);
      setTemplateForm({ name: '', channel: 'whatsapp', content: '' });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleQueue = (event) => {
    event.preventDefault();
    setError('');
    try {
      queueMessage(user, messageForm);
      setMessageForm({ patientId: '', appointmentId: '', templateId: '', channel: 'whatsapp' });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSend = (id) => {
    sendQueuedMessage(user, id, { status: 'enviado' });
    refresh();
  };

  return (
    <div className="stack">
      <Section title="Templates de mensagens">
        <form className="form-grid" onSubmit={handleTemplate}>
          <Field label="Nome">
            <input value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} />
          </Field>
          <Field label="Canal">
            <select value={templateForm.channel} onChange={(event) => setTemplateForm({ ...templateForm, channel: event.target.value })}>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </Field>
          <Field label="Conteúdo">
            <textarea
              value={templateForm.content}
              onChange={(event) => setTemplateForm({ ...templateForm, content: event.target.value })}
              placeholder="Olá {{nome}}, sua consulta é {{data}} às {{hora}} com {{profissional}}."
            />
          </Field>
          {error ? <div className="error">{error}</div> : null}
          <button className="button primary" type="submit">
            Salvar template
          </button>
        </form>
      </Section>

      <Section title="Fila de mensagens">
        <form className="form-grid" onSubmit={handleQueue}>
          <Field label="Paciente">
            <select value={messageForm.patientId} onChange={(event) => setMessageForm({ ...messageForm, patientId: event.target.value })}>
              <option value="">Selecione</option>
              {db.patients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Consulta">
            <select value={messageForm.appointmentId} onChange={(event) => setMessageForm({ ...messageForm, appointmentId: event.target.value })}>
              <option value="">Selecione</option>
              {db.appointments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.date} {item.startTime}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Template">
            <select value={messageForm.templateId} onChange={(event) => setMessageForm({ ...messageForm, templateId: event.target.value })}>
              <option value="">Selecione</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <button className="button primary" type="submit">
            Enfileirar mensagem
          </button>
        </form>
        <div className="card">
          <h3>Fila</h3>
          <ul className="list">
            {queue.length === 0 ? (
              <li className="muted">Sem mensagens pendentes.</li>
            ) : (
              queue.map((item) => (
                <li key={item.id} className="list-item">
                  {item.patientId} · {item.channel} · {item.status}
                  <button type="button" className="button secondary" onClick={() => handleSend(item.id)}>
                    Marcar como enviado
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </Section>

      <Section title="Logs de envio">
        <div className="card">
          <ul className="list">
            {logs.length === 0 ? (
              <li className="muted">Sem logs.</li>
            ) : (
              logs.map((item) => (
                <li key={item.id}>
                  {item.sentAt} · {item.status} · {item.channel}
                </li>
              ))
            )}
          </ul>
        </div>
      </Section>
    </div>
  );
}
