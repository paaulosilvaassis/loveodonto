import { useEffect, useMemo, useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../ui/Modal.jsx';
import {
  LEGAL_SIGNATURE_TYPE_LABELS,
  SIGN_LINK_EXPIRY_OPTIONS,
} from '../../contracts/contractConstants.js';
import { getContractSettings } from '../../services/contractModuleService.js';
import {
  buildSignatureSendFormDefaults,
  resolveRequiredSignatureType,
  sendContractForDigitalSignature,
} from '../../services/contractSignatureFlowService.js';
import { PATIENT_EMAIL_REQUIRED_MSG } from '../../services/patientEmail.js';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';

const FORM_ID = 'send-contract-signature-form';

export default function SendContractSignatureModal({
  open,
  onOpenChange,
  user,
  contract,
  budget,
  professional,
  treatmentName,
  onSent,
}) {
  const settings = useMemo(() => getContractSettings(user), [user]);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const requiredSignatureType = useMemo(
    () => resolveRequiredSignatureType({ budget, settings }),
    [budget, settings],
  );

  useEffect(() => {
    if (!open || !contract?.patientId) return;
    const defaults = buildSignatureSendFormDefaults({
      patientId: contract.patientId,
      professional,
      settings,
      contractId: contract.id,
    });
    setForm({
      ...defaults,
      signatureType: requiredSignatureType,
      linkExpiryDays: settings.signLinkExpiryDays || 7,
      treatmentName: treatmentName || '',
      budget,
      professional,
    });
    setError('');
  }, [open, contract?.patientId, professional, settings, requiredSignatureType, treatmentName, budget]);

  const handleClose = (next) => {
    if (!next) setError('');
    onOpenChange(next);
  };

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!contract?.id || !user || busy) return;
    if (!String(form.patientEmail || '').trim()) {
      setError(PATIENT_EMAIL_REQUIRED_MSG);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await sendContractForDigitalSignature(user, contract.id, form);
      onSent?.(result);
      handleClose(false);
    } catch (err) {
      setError(err?.message || 'Não foi possível enviar o contrato para assinatura.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={handleClose}>
      <ModalContent size="lg" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>Enviar contrato para assinatura</ModalTitle>
          <ModalDescription>
            {formatFriendlyContractNumber(contract?.contractNumber, 1)} — informe o e-mail do paciente.
            O link só é enviado depois que o provedor confirmar o disparo.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <form id={FORM_ID} className="space-y-4" onSubmit={handleSubmit}>
            {error ? <p className="text-sm text-[var(--color-error)]">{error}</p> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium sm:col-span-2">
                Nome do paciente
                <input
                  className="w-full mt-1 border border-[var(--color-border)] rounded px-3 py-2"
                  value={form.patientName || ''}
                  onChange={(e) => updateField('patientName', e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                CPF do paciente
                <input
                  className="w-full mt-1 border border-[var(--color-border)] rounded px-3 py-2"
                  value={form.patientCpf || ''}
                  onChange={(e) => updateField('patientCpf', e.target.value)}
                  required={settings.requireCpfForSignature}
                />
              </label>
              <label className="block text-sm font-medium">
                E-mail do paciente
                <input
                  type="email"
                  className="w-full mt-1 border border-[var(--color-border)] rounded px-3 py-2"
                  value={form.patientEmail || ''}
                  onChange={(e) => updateField('patientEmail', e.target.value)}
                  required
                  aria-required="true"
                />
                {!String(form.patientEmail || '').trim() ? (
                  <span className="block mt-1 text-xs text-[var(--color-error)]">{PATIENT_EMAIL_REQUIRED_MSG}</span>
                ) : null}
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Telefone / WhatsApp
                <input
                  className="w-full mt-1 border border-[var(--color-border)] rounded px-3 py-2"
                  value={form.patientPhone || ''}
                  onChange={(e) => updateField('patientPhone', e.target.value)}
                />
              </label>
              {form.guardianEmail !== undefined ? (
                <label className="block text-sm font-medium sm:col-span-2">
                  E-mail do responsável legal
                  <input
                    type="email"
                    className="w-full mt-1 border border-[var(--color-border)] rounded px-3 py-2"
                    value={form.guardianEmail || ''}
                    onChange={(e) => updateField('guardianEmail', e.target.value)}
                    placeholder="Obrigatório para menores de idade"
                  />
                </label>
              ) : null}
              <label className="block text-sm font-medium">
                E-mail do responsável técnico
                <input
                  type="email"
                  className="w-full mt-1 border border-[var(--color-border)] rounded px-3 py-2"
                  value={form.technicalEmail || ''}
                  onChange={(e) => updateField('technicalEmail', e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                E-mail da clínica
                <input
                  type="email"
                  className="w-full mt-1 border border-[var(--color-border)] rounded px-3 py-2"
                  value={form.clinicEmail || ''}
                  onChange={(e) => updateField('clinicEmail', e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                Tipo de assinatura
                <select
                  className="w-full mt-1 border border-[var(--color-border)] rounded px-3 py-2"
                  value={form.signatureType || requiredSignatureType}
                  onChange={(e) => updateField('signatureType', e.target.value)}
                >
                  {Object.entries(LEGAL_SIGNATURE_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Prazo de validade do link
                <select
                  className="w-full mt-1 border border-[var(--color-border)] rounded px-3 py-2"
                  value={form.linkExpiryDays || 7}
                  onChange={(e) => updateField('linkExpiryDays', Number(e.target.value))}
                >
                  {SIGN_LINK_EXPIRY_OPTIONS.map((days) => (
                    <option key={days} value={days}>{days} dias</option>
                  ))}
                </select>
              </label>
            </div>

            <p className="text-sm text-slate-500">
              O envio será registrado na trilha de auditoria jurídica com hash do documento, identificação do signatário e plataforma utilizada.
            </p>
          </form>
        </ModalBody>
        <ModalFooter>
          <button type="button" className="button secondary" onClick={() => handleClose(false)} disabled={busy}>
            Cancelar
          </button>
          <button
            type="submit"
            form={FORM_ID}
            className="button primary"
            disabled={busy || !String(form.patientEmail || '').trim()}
          >
            {busy ? 'Enviando…' : 'Enviar para assinatura'}
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
