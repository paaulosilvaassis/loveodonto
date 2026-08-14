import { useState } from 'react';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../ui/Modal.jsx';
import SignatureCanvas from './SignatureCanvas.jsx';
import { signContractOnScreen } from '../../services/contractModuleService.js';
import { getPatient } from '../../services/patientService.js';
import { assertClinicalSignatureReady } from '../../contracts/clinicalSignatureReadiness.js';

export default function ContractSignModal({
  open,
  onOpenChange,
  user,
  contract,
  onSigned,
}) {
  const [signerName, setSignerName] = useState('');
  const [signerCpf, setSignerCpf] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleOpen = (next) => {
    if (next && contract?.patientId) {
      const p = getPatient(contract.patientId);
      setSignerName(p?.profile?.full_name || '');
      setSignerCpf(p?.profile?.cpf || '');
    }
    if (!next) {
      setError('');
      setSignatureData('');
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!contract?.id) return;
    setBusy(true);
    setError('');
    try {
      if (contract.quoteSource === 'clinical_budget') {
        assertClinicalSignatureReady({
          appointmentId: contract.quoteId,
          budgetId: contract.budgetId,
          patientId: contract.patientId,
          contractId: contract.id,
          user,
        }, { forSign: true });
      }
      const result = signContractOnScreen(user, contract.id, {
        signerName,
        signerCpf,
        signatureImageDataUrl: signatureData,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      });
      onSigned?.(result);
      handleOpen(false);
    } catch (e) {
      setError(e?.message || 'Erro ao registrar assinatura.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={handleOpen}>
      <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>Assinar contrato</ModalTitle>
          <ModalDescription>
            {formatFriendlyContractNumber(contract?.contractNumber, 1)} — capture a assinatura do paciente ou responsável.
          </ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
          <label className="block text-sm font-medium">
            Nome do signatário
            <input
              className="w-full mt-1 border border-[var(--color-border)] rounded px-3 py-2"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            CPF
            <input
              className="w-full mt-1 border border-[var(--color-border)] rounded px-3 py-2"
              value={signerCpf}
              onChange={(e) => setSignerCpf(e.target.value)}
            />
          </label>
          <div>
            <span className="text-sm font-medium">Assinatura</span>
            <SignatureCanvas onChange={setSignatureData} className="mt-2" />
          </div>
        </ModalBody>
        <ModalFooter>
          <button type="button" className="button secondary" onClick={() => handleOpen(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy || !signatureData || !signerName.trim()}
            onClick={handleSubmit}
          >
            {busy ? 'Registrando...' : 'Confirmar assinatura'}
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
