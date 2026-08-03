import { useState, useEffect, useMemo } from 'react';
import {
  createPatientQuick,
  addPatientPhone,
  searchPatients,
  updatePatientDocuments,
  updatePatientRelationships,
} from '../../services/patientService.js';
import { convertLeadToPatient, LEAD_SOURCE_LABELS } from '../../services/crmService.js';
import { updateAppointment } from '../../services/appointmentService.js';
import { formatCpf, isCpfValid, onlyDigits } from '../../utils/validators.js';
import { normalizeText } from '../../services/helpers.js';
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from '../ui/Modal.jsx';

const FRIENDLY_ERROR = 'Não foi possível cadastrar/vincular o paciente. Tente novamente.';

const parseLeadPhone = (digits) => {
  if (!digits || digits.length < 10) return { ddd: '', number: '' };
  return { ddd: digits.slice(0, 2), number: digits.slice(2, 11) };
};

const formatLeadPhone = (phone) => {
  const digits = onlyDigits(String(phone || ''));
  if (digits.length < 10) return phone || '—';
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  if (rest.length === 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest}`;
};

const buildCrmObservation = (lead) => {
  const parts = [];
  const sourceLabel = LEAD_SOURCE_LABELS[lead?.source] || lead?.source;
  if (sourceLabel) parts.push(`Origem CRM: ${sourceLabel}`);
  if (lead?.notes?.trim()) parts.push(lead.notes.trim());
  return parts.join('\n');
};

const linkPatientToLeadAppointment = (user, leadId, appointmentId, patientId) => {
  convertLeadToPatient(user, leadId, patientId);
  updateAppointment(user, appointmentId, { patientId });
};

export function RegisterPatientFromLeadModal({
  open,
  onClose,
  lead,
  appointmentId,
  user,
  tenantId,
  onSuccess,
}) {
  const [full_name, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [sex, setSex] = useState('');
  const [birth_date, setBirthDate] = useState('');
  const [personal_email, setPersonalEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingPatient, setExistingPatient] = useState(null);

  const crmObservation = useMemo(() => buildCrmObservation(lead), [lead]);
  const leadPhoneDigits = lead?.phone ? onlyDigits(String(lead.phone)) : '';

  useEffect(() => {
    if (!open || !lead) return;
    setFullName(normalizeText(lead.name) || '');
    setCpf('');
    setSex('');
    setBirthDate('');
    setPersonalEmail(normalizeText(lead.email) || '');
    setError('');
    setExistingPatient(null);
  }, [open, lead]);

  const handleLinkExisting = () => {
    if (!existingPatient || !lead?.id || !appointmentId) return;
    setSubmitting(true);
    setError('');
    try {
      linkPatientToLeadAppointment(user, lead.id, appointmentId, existingPatient.id);
      onSuccess?.();
      onClose();
    } catch (err) {
      if (import.meta.env?.DEV) console.debug('register-from-lead:link-existing', err);
      setError(FRIENDLY_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  const findDuplicatePatient = (cpfDigits, phoneDigits) => {
    if (cpfDigits?.length === 11) {
      const { exactMatch } = searchPatients('cpf', cpfDigits, tenantId);
      if (exactMatch) return exactMatch;
    }
    if (phoneDigits?.length >= 10) {
      const { exactMatch } = searchPatients('phone', phoneDigits, tenantId);
      if (exactMatch) return exactMatch;
    }
    return null;
  };

  const handleSubmit = (event) => {
    event?.preventDefault?.();
    setError('');
    setExistingPatient(null);

    const fullNameTrim = normalizeText(full_name);
    const cpfDigits = onlyDigits(cpf);

    if (!fullNameTrim) {
      setError('Nome completo é obrigatório.');
      return;
    }
    if (!cpfDigits || cpfDigits.length !== 11) {
      setError('CPF é obrigatório (11 dígitos).');
      return;
    }
    if (!isCpfValid(cpf)) {
      setError('CPF inválido.');
      return;
    }
    if (!normalizeText(sex)) {
      setError('Sexo é obrigatório.');
      return;
    }
    if (!normalizeText(birth_date)) {
      setError('Data de nascimento é obrigatória.');
      return;
    }

    const duplicate = findDuplicatePatient(cpfDigits, leadPhoneDigits);
    if (duplicate) {
      setExistingPatient(duplicate);
      const byPhone = leadPhoneDigits.length >= 10
        && searchPatients('phone', leadPhoneDigits, tenantId).exactMatch?.id === duplicate.id;
      setError(
        byPhone
          ? 'Já existe um paciente com este telefone. Você pode vinculá-lo ao agendamento.'
          : 'CPF já cadastrado. Você pode vincular este paciente ao agendamento.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = createPatientQuick(user, {
        full_name: fullNameTrim,
        sex: normalizeText(sex),
        birth_date: normalizeText(birth_date),
        cpf: cpfDigits,
        lead_source: lead?.source || 'crm_pipeline',
        tenant_id: tenantId,
      });
      const patientId = created.patientId || created.profile?.id;
      if (!patientId) throw new Error('ID do paciente inválido.');

      if (leadPhoneDigits.length >= 10) {
        const { ddd, number } = parseLeadPhone(leadPhoneDigits);
        if (ddd && number) {
          addPatientPhone(user, patientId, {
            ddd,
            number,
            is_primary: true,
            is_whatsapp: true,
          });
        }
      }

      if (normalizeText(personal_email)) {
        updatePatientDocuments(user, patientId, { personal_email });
      }

      if (crmObservation) {
        updatePatientRelationships(user, patientId, { notes: crmObservation });
      }

      linkPatientToLeadAppointment(user, lead.id, appointmentId, patientId);
      onSuccess?.();
      onClose();
    } catch (err) {
      if (import.meta.env?.DEV) console.debug('register-from-lead:submit', err);
      const msg = err?.message || '';
      if (String(msg).includes('CPF já cadastrado')) {
        const match = searchPatients('cpf', cpfDigits, tenantId).exactMatch;
        if (match) {
          setExistingPatient(match);
          setError('CPF já cadastrado. Você pode vincular este paciente ao agendamento.');
          return;
        }
      }
      if (leadPhoneDigits.length >= 10) {
        const match = searchPatients('phone', leadPhoneDigits, tenantId).exactMatch;
        if (match) {
          setExistingPatient(match);
          setError('Já existe um paciente com este telefone. Você pode vinculá-lo ao agendamento.');
          return;
        }
      }
      setError(FRIENDLY_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalRoot
      open={open && Boolean(lead)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <ModalContent
        size="md"
        className="register-from-lead-modal"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <ModalHeader className="appointment-details-header">
          <ModalTitle>Cadastrar paciente (agendamento do lead)</ModalTitle>
        </ModalHeader>

        <ModalBody className="appointment-details-body register-from-lead-body">
          <p className="register-from-lead-intro">
            Preencha os dados mínimos para vincular o lead ao cadastro de paciente e liberar edição e confirmação de chegada.
          </p>

          {error ? (
            <div className="register-from-lead-error" role="alert">
              {error}
              {existingPatient ? (
                <div className="register-from-lead-link-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={handleLinkExisting}
                    disabled={submitting}
                  >
                    {submitting ? 'Vinculando…' : 'Vincular este paciente ao agendamento'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <form id="register-from-lead-form" className="register-from-lead-form" onSubmit={handleSubmit}>
            <label className="register-from-lead-field">
              <span className="register-from-lead-label">Nome completo</span>
              <input
                type="text"
                value={full_name}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nome do lead"
                className="register-from-lead-input"
              />
            </label>

            <label className="register-from-lead-field">
              <span className="register-from-lead-label">Telefone (do lead)</span>
              <input
                type="text"
                value={formatLeadPhone(lead?.phone)}
                readOnly
                className="register-from-lead-input"
                aria-readonly="true"
              />
            </label>

            <label className="register-from-lead-field">
              <span className="register-from-lead-label">E-mail</span>
              <input
                type="email"
                value={personal_email}
                onChange={(e) => setPersonalEmail(e.target.value)}
                placeholder="E-mail do lead (opcional)"
                className="register-from-lead-input"
              />
            </label>

            {crmObservation ? (
              <label className="register-from-lead-field">
                <span className="register-from-lead-label">Observação / origem CRM</span>
                <textarea
                  value={crmObservation}
                  readOnly
                  rows={3}
                  className="register-from-lead-input"
                  aria-readonly="true"
                />
              </label>
            ) : null}

            <label className="register-from-lead-field">
              <span className="register-from-lead-label">CPF</span>
              <input
                type="text"
                value={formatCpf(cpf)}
                onChange={(e) => {
                  setCpf(e.target.value);
                  setExistingPatient(null);
                  if (error) setError('');
                }}
                placeholder="000.000.000-00"
                className="register-from-lead-input"
              />
            </label>

            <label className="register-from-lead-field">
              <span className="register-from-lead-label">Sexo</span>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="register-from-lead-input register-from-lead-select"
              >
                <option value="">Selecione</option>
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
                <option value="Outro">Outro</option>
              </select>
            </label>

            <label className="register-from-lead-field">
              <span className="register-from-lead-label">Data de nascimento</span>
              <input
                type="date"
                value={birth_date}
                onChange={(e) => setBirthDate(e.target.value)}
                className="register-from-lead-input"
              />
            </label>
          </form>
        </ModalBody>

        <ModalFooter className="appointment-details-footer register-from-lead-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            form="register-from-lead-form"
            className="button primary"
            disabled={submitting}
          >
            {submitting ? 'Salvando…' : 'Cadastrar e vincular ao agendamento'}
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
