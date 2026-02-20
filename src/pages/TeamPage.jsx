import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Field } from '../components/Field.jsx';
import { Section } from '../components/Section.jsx';
import { loadDb } from '../db/index.js';
import { listAppointments } from '../services/appointmentService.js';
import { createRoom, createUser, listRooms, listTimeEntries, listUsers, registerTimeEntry } from '../services/teamService.js';

export default function TeamPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [userForm, setUserForm] = useState({ name: '', role: 'recepcao', commissionRate: 0.05 });
  const [roomForm, setRoomForm] = useState({ name: '' });
  const [timeForm, setTimeForm] = useState({ userId: '', date: '', startTime: '', endTime: '', note: '' });

  const refresh = () => {
    setUsers(listUsers());
    setRooms(listRooms());
    setEntries(listTimeEntries());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleUser = (event) => {
    event.preventDefault();
    setError('');
    try {
      createUser(user, userForm);
      setUserForm({ name: '', role: 'recepcao', commissionRate: 0.05 });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRoom = (event) => {
    event.preventDefault();
    setError('');
    try {
      createRoom(user, roomForm);
      setRoomForm({ name: '' });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTime = (event) => {
    event.preventDefault();
    setError('');
    try {
      registerTimeEntry(user, timeForm);
      setTimeForm({ userId: '', date: '', startTime: '', endTime: '', note: '' });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const appointments = listAppointments();
  const schedule = users
    .filter((item) => item.role === 'profissional')
    .map((professional) => ({
      ...professional,
      appointments: appointments.filter((appt) => appt.professionalId === professional.id),
    }));

  const db = loadDb();

  return (
    <div className="stack">
      <Section title="Usuários e permissões">
        <form className="form-grid" onSubmit={handleUser}>
          <Field label="Nome">
            <input value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} />
          </Field>
          <Field label="Cargo">
            <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}>
              <option value="admin">Admin</option>
              <option value="recepcao">Recepção</option>
              <option value="profissional">Profissional</option>
            </select>
          </Field>
          <Field label="Comissão (%)">
            <input
              type="number"
              step="0.01"
              value={userForm.commissionRate}
              onChange={(event) => setUserForm({ ...userForm, commissionRate: event.target.value })}
            />
          </Field>
          {error ? <div className="error">{error}</div> : null}
          <button className="button primary" type="submit">
            Criar usuário
          </button>
        </form>
        <div className="card">
          <ul className="list">
            {users.map((item) => (
              <li key={item.id}>
                {item.name} · {item.role}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Salas/Consultórios">
        <form className="form-grid" onSubmit={handleRoom}>
          <Field label="Nome da sala">
            <input value={roomForm.name} onChange={(event) => setRoomForm({ ...roomForm, name: event.target.value })} />
          </Field>
          <button className="button primary" type="submit">
            Adicionar sala
          </button>
        </form>
        <div className="card">
          <ul className="list">
            {rooms.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Escala por profissional">
        <div className="grid cards">
          {schedule.map((professional) => (
            <div className="card" key={professional.id}>
              <h3>{professional.name}</h3>
              <ul className="list">
                {professional.appointments.length === 0 ? (
                  <li className="muted">Sem consultas.</li>
                ) : (
                  professional.appointments.map((appt) => (
                    <li key={appt.id}>
                      {appt.date} · {appt.startTime}-{appt.endTime}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Registro de ponto">
        <form className="form-grid" onSubmit={handleTime}>
          <Field label="Usuário">
            <select value={timeForm.userId} onChange={(event) => setTimeForm({ ...timeForm, userId: event.target.value })}>
              <option value="">Selecione</option>
              {db.users.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input type="date" value={timeForm.date} onChange={(event) => setTimeForm({ ...timeForm, date: event.target.value })} />
          </Field>
          <Field label="Entrada">
            <input type="time" value={timeForm.startTime} onChange={(event) => setTimeForm({ ...timeForm, startTime: event.target.value })} />
          </Field>
          <Field label="Saída">
            <input type="time" value={timeForm.endTime} onChange={(event) => setTimeForm({ ...timeForm, endTime: event.target.value })} />
          </Field>
          <Field label="Observação">
            <input value={timeForm.note} onChange={(event) => setTimeForm({ ...timeForm, note: event.target.value })} />
          </Field>
          <button className="button primary" type="submit">
            Registrar ponto
          </button>
        </form>
        <div className="card">
          <ul className="list">
            {entries.length === 0 ? (
              <li className="muted">Sem registros.</li>
            ) : (
              entries.map((item) => (
                <li key={item.id}>
                  {item.date} · {item.startTime}-{item.endTime}
                </li>
              ))
            )}
          </ul>
        </div>
      </Section>
    </div>
  );
}
