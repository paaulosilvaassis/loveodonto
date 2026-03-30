import { useEffect, useState } from 'react';
import { Field } from '../Field.jsx';
import { CollaboratorRhProfileFields } from './CollaboratorRhProfileFields.jsx';
import { addCollaboratorPhone, createCollaborator } from '../../services/collaboratorService.js';
import { onlyDigits, isPhoneValid } from '../../utils/validators.js';

const defaultForm = () => ({
  nomeCompleto: '',
  apelido: '',
  nomeSocial: '',
  sexo: '',
  dataNascimento: '',
  email: '',
  rhCategoria: '',
  cargo: '',
  rhFuncaoDescricao: '',
  conselhoNome: 'CRO',
  conselhoUf: '',
  registroProfissional: '',
  especialidades: [],
  tipoVinculo: '',
  setor: '',
  status: 'ativo',
  phoneTipo: 'Celular',
  phoneDdd: '',
  phoneNumero: '',
});

/**
 * Modal de cadastro inicial: persiste apenas no submit (createCollaborator + telefone opcional).
 */
export default function CollaboratorCreateModal({ open, user, onClose, onSaved }) {
  const [form, setForm] = useState(defaultForm);
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(defaultForm());
      setDirty(false);
      setLocalError('');
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const profile = form;
  const patchProfile = (partial) => {
    setDirty(true);
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const resolveOptionalPhone = () => {
    const ddd = onlyDigits(form.phoneDdd);
    const numero = onlyDigits(form.phoneNumero);
    if (!ddd && !numero) return { ok: true, skip: true };
    const composed = `${ddd}${numero}`;
    if (!isPhoneValid(composed)) {
      return { ok: false, message: 'Telefone inválido. Corrija ou deixe DDD e número em branco.' };
    }
    return { ok: true, skip: false, ddd, numero };
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setLocalError('');
    const nomeCompleto = form.nomeCompleto.trim();
    const apelidoRaw = form.apelido.trim();
    const apelido =
      apelidoRaw ||
      nomeCompleto
        .split(/\s+/)
        .filter(Boolean)[0] ||
      '';

    if (!nomeCompleto) {
      setLocalError('Nome completo é obrigatório.');
      return;
    }
    if (!apelido) {
      setLocalError('Informe um apelido ou um nome completo com pelo menos uma palavra.');
      return;
    }

    const phone = resolveOptionalPhone();
    if (!phone.ok) {
      setLocalError(phone.message);
      return;
    }

    setSubmitting(true);
    try {
      const created = createCollaborator(user, {
        nomeCompleto,
        apelido,
        nomeSocial: form.nomeSocial.trim(),
        sexo: form.sexo.trim(),
        dataNascimento: form.dataNascimento.trim(),
        email: form.email.trim(),
        rhCategoria: form.rhCategoria.trim(),
        cargo: form.cargo.trim(),
        rhFuncaoDescricao: form.rhFuncaoDescricao.trim(),
        conselhoNome: form.conselhoNome.trim(),
        conselhoUf: form.conselhoUf.trim(),
        registroProfissional: form.registroProfissional.trim(),
        especialidades: Array.isArray(form.especialidades) ? form.especialidades : [],
        tipoVinculo: form.tipoVinculo.trim(),
        setor: form.setor.trim(),
        status: form.status || 'ativo',
      });
      if (!phone.skip) {
        addCollaboratorPhone(user, created.id, {
          tipo: form.phoneTipo || 'Celular',
          ddd: phone.ddd,
          numero: phone.numero,
          principal: true,
        });
      }
      setDirty(false);
      onSaved(created.id);
    } catch (err) {
      setLocalError(err?.message || 'Não foi possível salvar o colaborador.');
    } finally {
      setSubmitting(false);
    }
  };

  const requestClose = () => {
    if (dirty) {
      if (!window.confirm('Descartar o cadastro em andamento?')) return;
    }
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal-content modal-content-large"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collaborator-create-title"
      >
        <div className="inline-actions" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 id="collaborator-create-title">Novo colaborador</h3>
          <button type="button" className="button secondary" onClick={requestClose}>
            Fechar
          </button>
        </div>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Preencha os dados abaixo e salve. O colaborador só será criado após a confirmação.
        </p>

        {localError ? <div className="error" style={{ marginBottom: '1rem' }}>{localError}</div> : null}

        <form onSubmit={handleSubmit}>
          <div className="collaborator-create-modal-body">
            <CollaboratorRhProfileFields
              profile={profile}
              disabled={false}
              onPatch={patchProfile}
              photoSlot={null}
            />
            <div className="collaborator-rh-block" style={{ borderBottom: 'none', paddingTop: '0.5rem' }}>
              <h4 className="collaborator-rh-block-title">Contato</h4>
              <div className="form-grid">
                <Field label="Telefone — tipo">
                  <select value={form.phoneTipo} onChange={(e) => patchProfile({ phoneTipo: e.target.value })}>
                    <option value="Celular">Celular</option>
                    <option value="Fixo">Fixo</option>
                    <option value="Comercial">Comercial</option>
                  </select>
                </Field>
                <Field label="Telefone — DDD">
                  <input
                    value={form.phoneDdd}
                    onChange={(e) => patchProfile({ phoneDdd: e.target.value })}
                    placeholder="11"
                    maxLength={3}
                  />
                </Field>
                <Field label="Telefone — número">
                  <input
                    value={form.phoneNumero}
                    onChange={(e) => patchProfile({ phoneNumero: e.target.value })}
                    placeholder="Somente números"
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="inline-actions" style={{ marginTop: '1.25rem' }}>
            <button type="button" className="button secondary" onClick={requestClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? 'Salvando…' : 'Salvar colaborador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
