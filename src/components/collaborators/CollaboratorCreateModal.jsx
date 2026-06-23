import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../Button.jsx';
import { CollaboratorRhProfileFields } from './CollaboratorRhProfileFields.jsx';
import {
  addCollaboratorPhone,
  createCollaboratorWithSystemAccess,
} from '../../services/collaboratorService.js';
import { isCollaboratorEmailValid } from '../../utils/collaboratorAccessRole.js';
import { onlyDigits, isPhoneValid } from '../../utils/validators.js';
import {
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from '../ui/Modal.jsx';

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

export default function CollaboratorCreateModal({ open, user, onOpenChange, onSaved, onOpenExistingCollaborator }) {
  const formBodyRef = useRef(null);
  const [form, setForm] = useState(defaultForm);
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [duplicateRegistro, setDuplicateRegistro] = useState(null);

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
    setDuplicateRegistro(null);
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');
    setDuplicateRegistro(null);
    const nomeCompleto = form.nomeCompleto.trim();
    const apelidoRaw = form.apelido.trim();
    const apelido =
      apelidoRaw ||
      nomeCompleto
        .split(/\s+/)
        .filter(Boolean)[0] ||
      '';
    const email = form.email.trim();
    const hasValidEmail = isCollaboratorEmailValid(email);

    if (!nomeCompleto) {
      setLocalError('Nome completo é obrigatório.');
      return;
    }
    if (!apelido) {
      setLocalError('Informe um apelido ou um nome completo com pelo menos uma palavra.');
      return;
    }
    if (email && !hasValidEmail) {
      setLocalError('Informe um e-mail válido ou deixe o campo em branco para cadastrar sem acesso.');
      return;
    }

    const phone = resolveOptionalPhone();
    if (!phone.ok) {
      setLocalError(phone.message);
      return;
    }

    setSubmitting(true);
    try {
      const result = await createCollaboratorWithSystemAccess(user, {
        nomeCompleto,
        apelido,
        nomeSocial: form.nomeSocial.trim(),
        sexo: form.sexo.trim(),
        dataNascimento: form.dataNascimento.trim(),
        email,
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
      }, {
        tenant_id: user?.tenantId || '',
        send_invite: true,
      });

      const { collaborator: created, systemAccess, noAccess, accessError } = result;

      if (!phone.skip) {
        addCollaboratorPhone(user, created.id, {
          tipo: form.phoneTipo || 'Celular',
          ddd: phone.ddd,
          numero: phone.numero,
          principal: true,
        });
      }

      setDirty(false);

      const duplicateEmail = Boolean(
        accessError
        && String(accessError.message || '').toLowerCase().includes('já possui acesso nesta clínica'),
      );

      onSaved(created.id, {
        noAccess,
        systemAccess: Boolean(systemAccess),
        inviteEmail: hasValidEmail ? email.toLowerCase() : '',
        inviteFailed: Boolean(accessError && !duplicateEmail),
        duplicateEmail,
        accessErrorMessage: accessError?.message || '',
      });
    } catch (err) {
      setLocalError(err?.message || 'Não foi possível salvar o colaborador.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = submitting
    ? (isCollaboratorEmailValid(form.email) ? 'Criando colaborador e enviando convite...' : 'Salvando...')
    : 'Salvar colaborador';

  return (
    <ModalRoot
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
          return;
        }
        tryClose();
      }}
    >
      <ModalContent
        size="xl"
        className="collaborator-create-modal"
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <ModalHeader className="collaborator-create-modal__header">
          <div>
            <ModalTitle className="collaborator-create-modal__title">Novo colaborador</ModalTitle>
            <ModalDescription>
              Preencha os dados abaixo para cadastrar um novo colaborador na clínica.
            </ModalDescription>
          </div>
          <Button type="button" variant="ghost" className="collaborator-create-modal__close" onClick={tryClose}>
            Fechar
          </Button>
        </ModalHeader>

        <ModalBody ref={formBodyRef} className="scroll-area collaborator-create-modal__body">
          <form className="collaborator-create-modal__form" onSubmit={handleSubmit} id="collaborator-create-form">
            {localError ? (
              <div className="collaborator-create-modal__alert" role="alert">
                {localError}
                {duplicateRegistro?.id && onOpenExistingCollaborator ? (
                  <div style={{ marginTop: '0.75rem' }}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        onOpenExistingCollaborator({
                          id: duplicateRegistro.id,
                          status: duplicateRegistro.status,
                        });
                      }}
                    >
                      Ver cadastro existente
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="collaborator-create-modal__section-stack">
              <div className="collaborator-create-modal-fields">
                <CollaboratorRhProfileFields profile={profile} disabled={false} onPatch={patchProfile} photoSlot={null} />
              </div>

              <section className="collaborator-create-modal__section">
                <h3 className="collaborator-create-modal__section-title">Contato</h3>
                <p className="collaborator-create-modal__section-description">
                  Informações de telefone para contato principal.
                </p>
                <div className="collaborator-create-modal__contact-grid">
                  <div className="collaborator-create-modal__field">
                    <label htmlFor="new-collab-phone-tipo">Telefone - tipo</label>
                    <select
                      id="new-collab-phone-tipo"
                      className="collaborator-create-modal__control"
                      value={form.phoneTipo}
                      onChange={(e) => patchProfile({ phoneTipo: e.target.value })}
                    >
                      <option value="Celular">Celular</option>
                      <option value="Fixo">Fixo</option>
                      <option value="Comercial">Comercial</option>
                    </select>
                  </div>
                  <div className="collaborator-create-modal__field">
                    <label htmlFor="new-collab-phone-ddd">Telefone - DDD</label>
                    <input
                      id="new-collab-phone-ddd"
                      className="collaborator-create-modal__control"
                      value={form.phoneDdd}
                      onChange={(e) => patchProfile({ phoneDdd: e.target.value })}
                      placeholder="11"
                      maxLength={3}
                    />
                  </div>
                  <div className="collaborator-create-modal__field">
                    <label htmlFor="new-collab-phone-numero">Telefone - número</label>
                    <input
                      id="new-collab-phone-numero"
                      className="collaborator-create-modal__control"
                      value={form.phoneNumero}
                      onChange={(e) => patchProfile({ phoneNumero: e.target.value })}
                      placeholder="Somente números"
                    />
                  </div>
                </div>
              </section>

              <section className="collaborator-create-modal__section">
                <h3 className="collaborator-create-modal__section-title">Acesso ao sistema</h3>
                <p className="collaborator-create-modal__section-description muted">
                  Com e-mail válido, o Love Odonto cria automaticamente o usuário, envia o convite de acesso
                  e vincula o colaborador à clínica. Sem e-mail, o cadastro fica apenas como registro RH
                  (status &quot;Sem acesso&quot;).
                </p>
              </section>
            </div>
          </form>
        </ModalBody>

        <ModalFooter className="collaborator-create-modal__footer">
          <Button type="button" variant="secondary" onClick={tryClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="collaborator-create-form" disabled={submitting}>
            {submitLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}

export { CollaboratorCreateModal as NewCollaboratorDialog };
