import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
 * Layout: overlay (sem centralização vertical) → card flex col (max-h viewport) → header | body scroll único | footer.
 */
export default function CollaboratorCreateModal({ open, user, onClose, onSaved }) {
  const formBodyRef = useRef(null);
  const [form, setForm] = useState(defaultForm);
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const tryClose = useCallback(() => {
    if (dirty) {
      if (!window.confirm('Descartar o cadastro em andamento?')) return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (open) {
      setForm(defaultForm());
      setDirty(false);
      setLocalError('');
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  /** Sempre abrir com o topo do formulário visível (evita scroll “no meio” por anchoring/restauração). */
  useLayoutEffect(() => {
    if (!open) return;
    const el = formBodyRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      tryClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, tryClose]);

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

  return (
    <div
      className="fixed inset-0 z-[1000] overflow-hidden bg-black/50 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={tryClose}
    >
      <div
        className="mx-auto mt-6 flex max-h-[calc(100vh-3rem)] w-full max-w-6xl min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collaborator-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 id="collaborator-create-title" className="text-2xl font-semibold text-slate-900">
                Novo colaborador
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Preencha os dados abaixo e salve. O colaborador só será criado após a confirmação.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              onClick={tryClose}
            >
              Fechar
            </button>
          </div>
        </header>

        <form
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          onSubmit={handleSubmit}
          id="collaborator-create-form"
        >
          <div
            ref={formBodyRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6 [overflow-anchor:none]"
          >
            {localError ? (
              <div
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                role="alert"
              >
                {localError}
              </div>
            ) : null}

            <div className="collaborator-create-modal-fields">
              <CollaboratorRhProfileFields profile={profile} disabled={false} onPatch={patchProfile} photoSlot={null} />
              <div className="collaborator-rh-block border-b-0 pb-0 pt-2">
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
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
            <button type="button" className="button secondary" onClick={tryClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? 'Salvando…' : 'Salvar colaborador'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
