import { useState } from 'react';
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from '../ui/Modal.jsx';

export default function OpenCashRegisterModal({ open, onClose, onConfirm, selectedDate, userName }) {
  const [initialCash, setInitialCash] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const handleOpenChange = (next) => {
    if (!next) {
      setError('');
      onClose();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    try {
      onConfirm({ initialCash: Number(initialCash || 0), note });
      setInitialCash('');
      setNote('');
    } catch (err) {
      setError(err?.message || 'Erro ao abrir caixa.');
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={handleOpenChange}>
      <ModalContent size="sm" className="finance-cash-modal">
        <ModalHeader>
          <ModalTitle>Abertura de Caixa</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <form className="finance-cash-form" id="open-cash-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <label>
                Data
                <input type="date" value={selectedDate} readOnly />
              </label>
            </div>
            <div className="form-row">
              <label>
                Usuário responsável
                <input type="text" value={userName} readOnly />
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
          </form>
        </ModalBody>
        <ModalFooter>
          <button type="button" className="button secondary" onClick={() => handleOpenChange(false)}>
            Cancelar
          </button>
          <button type="submit" form="open-cash-form" className="button primary">
            Confirmar abertura
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
