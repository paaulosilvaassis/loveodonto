import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import Button from '../Button.jsx';
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

export default function CollaboratorCreateModal({ open, user, onOpenChange, onSaved }) {
  const formBodyRef = useRef(null);
  const [form, setForm] = useState(defaultForm);
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const tryClose = useCallback(() => {
    if (dirty) {
      if (!window.confirm('Descartar o cadastro em andamento?')) return;
    }
    setDirty(false);
    onOpenChange(false);
  }, [dirty, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    setForm(defaultForm());
    setDirty(false);
    setLocalError('');
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      formBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  }, [open]);

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
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
          return;
        }
        tryClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 20000,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(2px)',
          }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[20001] w-[min(96vw,1150px)] max-w-none -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-2xl outline-none"
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 20001,
            width: 'min(96vw, 1150px)',
            borderRadius: '1.5rem',
            border: '0',
            background: '#fff',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            outline: 'none',
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
          }}
          onInteractOutside={(event) => {
            event.preventDefault();
          }}
        >
          <div className="flex h-[85vh] max-h-[85vh] min-h-0 flex-col">
            <header className="shrink-0 border-b border-slate-200 bg-white px-8 py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Dialog.Title className="text-3xl font-semibold tracking-tight text-slate-900">
                    Novo colaborador
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm text-slate-500">
                    Preencha os dados abaixo para cadastrar um novo colaborador na clínica.
                  </Dialog.Description>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-xl px-4 py-2 text-slate-600 hover:bg-slate-100"
                  onClick={tryClose}
                >
                  Fechar
                </Button>
              </div>
            </header>

            <form
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              onSubmit={handleSubmit}
              id="collaborator-create-form"
            >
              <div
                ref={formBodyRef}
                className="scroll-area flex-1 min-h-0 overflow-y-auto px-8 py-6"
              >
                {localError ? (
                  <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                    {localError}
                  </div>
                ) : null}

                <div className="collaborator-create-modal-fields">
                  <CollaboratorRhProfileFields profile={profile} disabled={false} onPatch={patchProfile} photoSlot={null} />
                  <section className="space-y-5">
                    <div className="space-y-1">
                      <h3 className="text-xl font-semibold text-slate-900">Contato</h3>
                      <p className="text-sm text-slate-500">Informações de telefone para contato principal.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium leading-5 text-slate-700">Telefone - tipo</label>
                        <select
                          className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                          value={form.phoneTipo}
                          onChange={(e) => patchProfile({ phoneTipo: e.target.value })}
                        >
                          <option value="Celular">Celular</option>
                          <option value="Fixo">Fixo</option>
                          <option value="Comercial">Comercial</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium leading-5 text-slate-700">Telefone - DDD</label>
                        <input
                          className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                          value={form.phoneDdd}
                          onChange={(e) => patchProfile({ phoneDdd: e.target.value })}
                          placeholder="11"
                          maxLength={3}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium leading-5 text-slate-700">Telefone - número</label>
                        <input
                          className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                          value={form.phoneNumero}
                          onChange={(e) => patchProfile({ phoneNumero: e.target.value })}
                          placeholder="Somente números"
                        />
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              <footer className="shrink-0 border-t border-slate-200 bg-white px-8 py-5">
                <div className="flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    onClick={tryClose}
                    disabled={submitting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white shadow-lg hover:opacity-95"
                    disabled={submitting}
                  >
                    {submitting ? 'Salvando...' : 'Salvar colaborador'}
                  </Button>
                </div>
              </footer>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { CollaboratorCreateModal as NewCollaboratorDialog };
