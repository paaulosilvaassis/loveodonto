import { useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../ui/Modal.jsx';
import { ANAMNESIS_ATTACH_OPTIONS } from './clinicalAppointmentConfig.js';

export function AnamnesisAttachModal({ open, onClose, patient, selectedKeys = [], onConfirm }) {
  const [selected, setSelected] = useState(() => new Set(selectedKeys));

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getPreview = (key) => {
    const profile = patient?.profile || patient || {};
    const map = {
      chiefComplaint: profile.chiefComplaint || profile.queixaPrincipal,
      healthHistory: profile.healthHistory || profile.historicoSaude,
      allergies: profile.allergies || profile.alergias,
      medications: profile.medications || profile.medicamentos,
      systemicConditions: profile.systemicConditions || profile.condicoesSistemicas,
      clinicalNotes: profile.clinicalNotes || profile.observacoesClinicas,
      risks: profile.risks || profile.riscos,
      restrictions: profile.restrictions || profile.restricoes,
    };
    const value = map[key];
    if (!value) return '—';
    if (Array.isArray(value)) return value.join(', ') || '—';
    return String(value).slice(0, 80) + (String(value).length > 80 ? '…' : '');
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onClose();
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="lg" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>Incluir dados da anamnese</ModalTitle>
          <ModalDescription>
            Selecione quais informações clínicas serão anexadas ao planejamento e orçamento.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <ul className="clinical-anamnesis-select-list">
            {ANAMNESIS_ATTACH_OPTIONS.map((opt) => (
              <li key={opt.key}>
                <label className="clinical-anamnesis-select-item">
                  <input
                    type="checkbox"
                    checked={selected.has(opt.key)}
                    onChange={() => toggle(opt.key)}
                  />
                  <span className="clinical-anamnesis-select-label">
                    <strong>{opt.label}</strong>
                    <small>{getPreview(opt.key)}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </ModalBody>
        <ModalFooter>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="button primary" onClick={handleConfirm}>
            Confirmar seleção
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
