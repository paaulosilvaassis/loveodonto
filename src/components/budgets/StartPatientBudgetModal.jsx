import { useMemo, useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../ui/Modal.jsx';
import { loadDb } from '../../db/index.js';
import { getPreviousBudgetImportContext } from '../../services/clinicalBudgetLockService.js';
import { findActiveClinicalAppointmentId } from '../../services/clinicalBudgetHubService.js';

export function StartPatientBudgetModal({
  open,
  onOpenChange,
  busy = false,
  patientId: initialPatientId = null,
  patientName: initialPatientName = '',
  onConfirm,
}) {
  const [mode, setMode] = useState('fresh');
  const [error, setError] = useState('');
  const [patientQuery, setPatientQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(
    initialPatientId ? { id: initialPatientId, name: initialPatientName } : null,
  );

  const activePatientId = selectedPatient?.id || initialPatientId || null;
  const activePatientName = selectedPatient?.name || initialPatientName || '';

  const patients = useMemo(() => {
    const db = loadDb();
    const q = patientQuery.trim().toLowerCase();
    return (db.patients || [])
      .filter((p) => {
        if (!q) return true;
        const name = (p.full_name || p.nickname || p.social_name || '').toLowerCase();
        return name.includes(q);
      })
      .slice(0, 8);
  }, [patientQuery, open]);

  const importContext = useMemo(() => {
    if (!activePatientId) return { hasPrevious: false, procedureCount: 0 };
    const appointmentId = findActiveClinicalAppointmentId(activePatientId);
    if (appointmentId) return getPreviousBudgetImportContext(appointmentId);
    const db = loadDb();
    const hasHistory = (db.clinicalAppointments || []).some(
      (ca) => ca.patientId === activePatientId && (ca.budgetHistory || []).length > 0,
    );
    return { hasPrevious: hasHistory, procedureCount: 0, canImport: false };
  }, [activePatientId, open]);

  const handleClose = () => {
    if (busy) return;
    setMode('fresh');
    setError('');
    setPatientQuery('');
    if (!initialPatientId) setSelectedPatient(null);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!activePatientId) {
      setError('Selecione um paciente.');
      return;
    }
    setError('');
    try {
      await onConfirm({ patientId: activePatientId, importProcedures: mode === 'import' });
      handleClose();
    } catch (err) {
      setError(err?.message || 'Não foi possível criar o orçamento.');
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>Criar novo orçamento</ModalTitle>
          <ModalDescription>
            O planejamento será iniciado do zero, sem reutilizar contrato ou condições financeiras antigas.
          </ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-3">
          {error ? <p className="clinical-inline-error">{error}</p> : null}

          {!initialPatientId ? (
            <div className="budget-start-patient-picker">
              <label className="block text-sm font-medium">Paciente</label>
              <input
                type="search"
                className="w-full mt-1 border border-[var(--color-border)] rounded-md px-3 py-2"
                placeholder="Buscar paciente por nome"
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
              />
              {selectedPatient ? (
                <p className="text-sm mt-2">
                  Selecionado: <strong>{selectedPatient.name}</strong>
                </p>
              ) : (
                <ul className="budgets-hub-patient-list">
                  {patients.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="budgets-hub-patient-item"
                        onClick={() => setSelectedPatient({
                          id: p.id,
                          name: p.full_name || p.nickname || p.social_name,
                        })}
                      >
                        {p.full_name || p.nickname || p.social_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm">
              Paciente: <strong>{activePatientName}</strong>
            </p>
          )}

          <p className="text-sm text-[var(--color-text-muted)]">
            Deseja importar procedimentos de orçamento anterior?
          </p>
          <div className="budget-start-mode-options">
            <label className={`budget-start-mode-option${mode === 'fresh' ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="budget-start-mode"
                checked={mode === 'fresh'}
                onChange={() => setMode('fresh')}
              />
              <span>
                <strong>Começar do zero</strong>
                <em>Planejamento limpo, sem procedimentos importados.</em>
              </span>
            </label>
            {importContext.hasPrevious ? (
              <label className={`budget-start-mode-option${mode === 'import' ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="budget-start-mode"
                  checked={mode === 'import'}
                  onChange={() => setMode('import')}
                  disabled={!importContext.procedureCount}
                />
                <span>
                  <strong>Importar orçamento anterior</strong>
                  <em>
                    {importContext.procedureCount
                      ? `${importContext.procedureCount} procedimento(s) do ${importContext.budgetNumber || 'orçamento anterior'}.`
                      : 'Orçamento anterior sem procedimentos para importar.'}
                  </em>
                </span>
              </label>
            ) : null}
          </div>
        </ModalBody>
        <ModalFooter className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="button secondary" onClick={handleClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="button primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Criando…' : 'Confirmar e abrir planejamento'}
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
