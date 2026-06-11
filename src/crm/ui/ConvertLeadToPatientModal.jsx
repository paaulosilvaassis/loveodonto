import { useEffect, useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../../components/ui/Modal.jsx';
import Button from '../../components/Button.jsx';
import { createPatientQuick, addPatientPhone, searchPatients } from '../../services/patientService.js';
import { convertLeadToPatient } from '../../services/crmService.js';
import { formatCpf, isCpfValid, onlyDigits } from '../../utils/validators.js';
import { normalizeText } from '../../services/helpers.js';

const FORM_ID = 'convert-lead-to-patient-form';

const parseLeadPhone = (digits) => {
  if (!digits || digits.length < 10) return { ddd: '', number: '' };
  return { ddd: digits.slice(0, 2), number: digits.slice(2, 11) };
};

/**
 * Converte um lead da Captação em paciente (cadastro mínimo + vínculo CRM).
 * Não envolve agendamento — apenas createPatientQuick + convertLeadToPatient.
 */
export function ConvertLeadToPatientModal({ open, onClose, lead, user, onSuccess }) {
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [sex, setSex] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingPatient, setExistingPatient] = useState(null);

  useEffect(() => {
    if (open && lead) {
      setFullName(normalizeText(lead.name) || '');
      setCpf('');
      setSex('');
      setBirthDate('');
      setError('');
      setExistingPatient(null);
    }
  }, [open, lead]);

  const finishSuccess = (patientName) => {
    if (onSuccess) onSuccess(patientName);
    onClose();
  };

  const handleLinkExisting = () => {
    if (!existingPatient || !lead) return;
    setSubmitting(true);
    setError('');
    try {
      convertLeadToPatient(user, lead.id, existingPatient.id);
      finishSuccess(existingPatient.full_name || fullName);
    } catch (err) {
      setError(err?.message || 'Erro ao vincular paciente.');
    } finally {
      setSubmitting(false);
    }
  };

  const validate = (fullNameTrim, cpfDigits) => {
    if (!fullNameTrim) return 'Nome completo é obrigatório.';
    if (!cpfDigits || cpfDigits.length !== 11) return 'CPF é obrigatório (11 dígitos).';
    if (!isCpfValid(cpf)) return 'CPF inválido.';
    if (!normalizeText(sex)) return 'Sexo é obrigatório.';
    if (!normalizeText(birthDate)) return 'Data de nascimento é obrigatória.';
    return '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!lead) return;
    setError('');
    setExistingPatient(null);

    const fullNameTrim = normalizeText(fullName);
    const cpfDigits = onlyDigits(cpf);
    const validationError = validate(fullNameTrim, cpfDigits);
    if (validationError) {
      setError(validationError);
      return;
    }

    const { exactMatch } = searchPatients('cpf', cpfDigits);
    if (exactMatch) {
      setExistingPatient(exactMatch);
      setError('CPF já cadastrado. Você pode vincular o lead a este paciente existente.');
      return;
    }

    setSubmitting(true);
    try {
      const created = createPatientQuick(user, {
        full_name: fullNameTrim,
        sex: normalizeText(sex),
        birth_date: normalizeText(birthDate),
        cpf: cpfDigits,
      });
      const patientId = created.patientId || created.profile?.id;
      if (!patientId) throw new Error('ID do paciente inválido.');

      const leadPhone = lead.phone ? onlyDigits(String(lead.phone)) : '';
      if (leadPhone.length >= 10) {
        try {
          const { ddd, number } = parseLeadPhone(leadPhone);
          if (ddd && number) {
            addPatientPhone(user, patientId, {
              ddd,
              number,
              is_primary: true,
              is_whatsapp: true,
            });
          }
        } catch (phoneErr) {
          if (import.meta.env?.DEV) console.debug('Telefone do lead não adicionado:', phoneErr?.message);
        }
      }

      convertLeadToPatient(user, lead.id, patientId);
      finishSuccess(fullNameTrim);
    } catch (err) {
      setError(err?.message || 'Falha ao converter lead em paciente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>Converter lead em paciente</ModalTitle>
          <ModalDescription>
            Preencha os dados mínimos para criar o cadastro do paciente e vincular ao lead
            {lead?.name ? ` “${lead.name}”` : ''}.
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          {error && (
            <div className="crm-captacao-modal-error" role="alert">
              {error}
              {existingPatient && (
                <div className="crm-captacao-modal-error-actions">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={submitting}
                    onClick={handleLinkExisting}
                  >
                    Vincular este paciente ao lead
                  </Button>
                </div>
              )}
            </div>
          )}
          <form id={FORM_ID} onSubmit={handleSubmit} className="crm-captacao-form" noValidate>
            <div className="form-field">
              <label htmlFor="convert-lead-name">Nome completo</label>
              <input
                id="convert-lead-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nome do paciente"
              />
            </div>
            <div className="crm-captacao-form-row">
              <div className="form-field">
                <label htmlFor="convert-lead-cpf">CPF</label>
                <input
                  id="convert-lead-cpf"
                  type="text"
                  inputMode="numeric"
                  value={formatCpf(cpf)}
                  onChange={(e) => {
                    setCpf(e.target.value);
                    setExistingPatient(null);
                    if (error) setError('');
                  }}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="form-field">
                <label htmlFor="convert-lead-sex">Sexo</label>
                <select id="convert-lead-sex" value={sex} onChange={(e) => setSex(e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="convert-lead-birth">Data de nascimento</label>
              <input
                id="convert-lead-birth"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={submitting}>
            Converter em paciente
          </Button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
