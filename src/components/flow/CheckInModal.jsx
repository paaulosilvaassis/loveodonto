import { useMemo, useState } from 'react';
import { APPOINTMENT_STATUS } from '../../services/appointmentService.js';
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from '../ui/Modal.jsx';

const ELIGIBLE_STATUSES = [
  APPOINTMENT_STATUS.AGENDADO,
  APPOINTMENT_STATUS.EM_CONFIRMACAO,
  APPOINTMENT_STATUS.CONFIRMADO,
];

export default function CheckInModal({ open, onClose, appointments, onCheckIn }) {
  const [query, setQuery] = useState('');

  const candidates = useMemo(() => {
    const base = (appointments || []).filter((apt) =>
      ELIGIBLE_STATUSES.includes(apt.status)
    );
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((apt) => {
      const patientName = (apt.patient?.full_name || apt.patient?.nickname || '').toLowerCase();
      const phone = apt.phone ? `${apt.phone.ddd}${apt.phone.number}` : '';
      return patientName.includes(q) || phone.includes(q);
    });
  }, [appointments, query]);

  const handleOpenChange = (next) => {
    if (!next) {
      setQuery('');
      onClose();
    }
  };

  const handleSelect = async (appointmentId) => {
    await onCheckIn(appointmentId);
    setQuery('');
    onClose();
  };

  return (
    <ModalRoot open={open} onOpenChange={handleOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Registrar Chegada</ModalTitle>
        </ModalHeader>

        <ModalBody>
          <div className="form-field">
            <label>Buscar paciente</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome ou telefone..."
            />
          </div>
          <div className="flow-checkin-list">
            {candidates.length === 0 ? (
              <div className="flow-checkin-empty">Nenhum agendamento elegível.</div>
            ) : (
              candidates.map((apt) => (
                <button
                  key={apt.id}
                  type="button"
                  className="flow-checkin-item"
                  onClick={() => handleSelect(apt.id)}
                >
                  <span>{apt.patient?.full_name || apt.patient?.nickname || 'Paciente'}</span>
                  <span>{apt.startTime}</span>
                </button>
              ))
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            className="button secondary"
            onClick={() => handleOpenChange(false)}
          >
            Fechar
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
