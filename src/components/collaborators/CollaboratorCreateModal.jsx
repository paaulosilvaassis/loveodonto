import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../Button.jsx';
import { CollaboratorRhProfileFields } from './CollaboratorRhProfileFields.jsx';
import {
  addCollaboratorPhone,
  createCollaboratorWithSystemAccess,
} from '../../services/collaboratorService.js';
import {
  COLLABORATOR_PROFILE_ROLE_OPTIONS,
  isCollaboratorEmailValid,
  resolveCollaboratorProfileRole,
} from '../../utils/collaboratorAccessRole.js';
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

const STEPS = [
  { id: 1, title: 'Dados pessoais' },
  { id: 2, title: 'Função na clínica' },
  { id: 3, title: 'Acesso ao sistema' },
  { id: 4, title: 'Revisão' },
];

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
  allowSystemAccess: true,
  profileRole: '',
});

function resolveDefaultApelido(nomeCompleto, apelido) {
  const trimmed = String(apelido || '').trim();
  if (trimmed) return trimmed;
  return String(nomeCompleto || '')
    .split(/\s+/)
    .filter(Boolean)[0] || '';
}

export default function CollaboratorCreateModal({ open, user, onOpenChange, onSaved, onOpenExistingCollaborator }) {
  const formBodyRef = useRef(null);
  const [form, setForm] = useState(defaultForm);
  const [step, setStep] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState('');
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
    setStep(1);
    setDirty(false);
    setLocalError('');
    setSubmitting(false);
    setSubmitPhase('');
    setDuplicateRegistro(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      formBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  }, [open, step]);

  const patchProfile = (partial) => {
    setDirty(true);
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const resolvedProfileRole = form.profileRole
    || resolveCollaboratorProfileRole({ rhCategoria: form.rhCategoria, cargo: form.cargo });

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

  const validateStep = (currentStep) => {
    const nomeCompleto = form.nomeCompleto.trim();
    const email = form.email.trim();

    if (currentStep === 1) {
      if (!nomeCompleto) return 'Nome completo é obrigatório.';
      if (form.allowSystemAccess && !isCollaboratorEmailValid(email)) {
        return 'Informe um e-mail válido para criar o acesso ao sistema.';
      }
      if (email && !isCollaboratorEmailValid(email)) return 'E-mail inválido.';
      const phone = resolveOptionalPhone();
      if (!phone.ok) return phone.message;
    }

    if (currentStep === 2) {
      if (!form.rhCategoria.trim()) return 'Selecione a categoria do colaborador.';
      if (!form.cargo.trim()) return 'Selecione o cargo do colaborador.';
    }

    if (currentStep === 3) {
      if (form.allowSystemAccess) {
        if (!isCollaboratorEmailValid(email)) {
          return 'E-mail válido é obrigatório para colaboradores com acesso ao sistema.';
        }
        if (!resolvedProfileRole) return 'Selecione o perfil de acesso.';
      }
    }

    return '';
  };

  const goNext = () => {
    setLocalError('');
    const message = validateStep(step);
    if (message) {
      setLocalError(message);
      return;
    }
    if (step === 2 && !form.profileRole) {
      patchProfile({ profileRole: resolveCollaboratorProfileRole({ rhCategoria: form.rhCategoria, cargo: form.cargo }) });
    }
    setStep((prev) => Math.min(prev + 1, STEPS.length));
  };

  const goBack = () => {
    setLocalError('');
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');
    setDuplicateRegistro(null);

    for (let i = 1; i <= 3; i += 1) {
      const message = validateStep(i);
      if (message) {
        setLocalError(message);
        setStep(i);
        return;
      }
    }

    const nomeCompleto = form.nomeCompleto.trim();
    const apelido = resolveDefaultApelido(nomeCompleto, form.apelido);
    const email = form.email.trim().toLowerCase();
    const phone = resolveOptionalPhone();
    const profileRole = form.profileRole || resolvedProfileRole;

    setSubmitting(true);
    setSubmitPhase('Criando colaborador...');

    try {
      if (form.allowSystemAccess) {
        setSubmitPhase('Provisionando acesso...');
      }

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
        profile_role: profileRole,
        send_invite: form.allowSystemAccess,
        require_system_access: form.allowSystemAccess,
        allow_system_access: form.allowSystemAccess,
      });

      if (form.allowSystemAccess && !result.noAccess) {
        setSubmitPhase('Enviando convite...');
      }

      const { collaborator: created, systemAccess, noAccess, accessError, linkedExisting } = result;

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
        noAccess: noAccess || !form.allowSystemAccess,
        systemAccess: Boolean(systemAccess) && form.allowSystemAccess,
        inviteEmail: isCollaboratorEmailValid(email) ? email : '',
        inviteFailed: Boolean(accessError && !duplicateEmail && form.allowSystemAccess),
        duplicateEmail,
        linkedExisting: Boolean(linkedExisting),
        accessErrorMessage: accessError?.message || '',
        successMessage: linkedExisting
          ? 'Colaborador criado. Usuário já existia — acesso vinculado e convite reenviado.'
          : form.allowSystemAccess
            ? 'Colaborador criado e convite de acesso enviado.'
            : 'Colaborador criado sem acesso ao sistema.',
      });
    } catch (err) {
      setLocalError(err?.message || 'Não foi possível salvar o colaborador.');
    } finally {
      setSubmitting(false);
      setSubmitPhase('');
    }
  };

  const profileRoleLabel = COLLABORATOR_PROFILE_ROLE_OPTIONS.find(
    (item) => item.value === resolvedProfileRole,
  )?.label || resolvedProfileRole;

  const footerPrimaryLabel = submitting
    ? (submitPhase || 'Salvando...')
    : step < STEPS.length
      ? 'Continuar'
      : form.allowSystemAccess
        ? 'Salvar e enviar convite'
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
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <ModalHeader className="collaborator-create-modal__header">
          <div>
            <ModalTitle className="collaborator-create-modal__title">Novo colaborador</ModalTitle>
            <ModalDescription>
              Etapa {step} de {STEPS.length}: {STEPS[step - 1]?.title}
            </ModalDescription>
          </div>
          <Button type="button" variant="ghost" className="collaborator-create-modal__close" onClick={tryClose}>
            Fechar
          </Button>
        </ModalHeader>

        <div className="collaborator-create-wizard__steps" aria-label="Progresso do cadastro">
          {STEPS.map((item) => (
            <div
              key={item.id}
              className={`collaborator-create-wizard__step ${step === item.id ? 'is-active' : ''} ${step > item.id ? 'is-done' : ''}`}
            >
              <span className="collaborator-create-wizard__step-index">{item.id}</span>
              <span className="collaborator-create-wizard__step-label">{item.title}</span>
            </div>
          ))}
        </div>

        <ModalBody ref={formBodyRef} className="scroll-area collaborator-create-modal__body">
          <form
            className="collaborator-create-modal__form"
            onSubmit={step === STEPS.length ? handleSubmit : (e) => e.preventDefault()}
            id="collaborator-create-form"
          >
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

            {step === 1 ? (
              <section className="collaborator-create-modal__section">
                <h3 className="collaborator-create-modal__section-title">Dados pessoais</h3>
                <div className="collaborator-create-modal__contact-grid">
                  <div className="collaborator-create-modal__field collaborator-create-modal__field--wide">
                    <label htmlFor="new-collab-nome">Nome completo *</label>
                    <input
                      id="new-collab-nome"
                      className="collaborator-create-modal__control"
                      value={form.nomeCompleto}
                      onChange={(e) => patchProfile({ nomeCompleto: e.target.value })}
                      required
                    />
                  </div>
                  <div className="collaborator-create-modal__field">
                    <label htmlFor="new-collab-apelido">Apelido</label>
                    <input
                      id="new-collab-apelido"
                      className="collaborator-create-modal__control"
                      value={form.apelido}
                      onChange={(e) => patchProfile({ apelido: e.target.value })}
                    />
                  </div>
                  <div className="collaborator-create-modal__field collaborator-create-modal__field--wide">
                    <label htmlFor="new-collab-email">E-mail {form.allowSystemAccess ? '*' : ''}</label>
                    <input
                      id="new-collab-email"
                      type="email"
                      className="collaborator-create-modal__control"
                      value={form.email}
                      onChange={(e) => patchProfile({ email: e.target.value })}
                      placeholder="usuario@clinica.com"
                    />
                  </div>
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
            ) : null}

            {step === 2 ? (
              <section className="collaborator-create-modal__section">
                <h3 className="collaborator-create-modal__section-title">Função na clínica</h3>
                <div className="collaborator-create-modal-fields">
                  <CollaboratorRhProfileFields profile={form} disabled={false} onPatch={patchProfile} photoSlot={null} />
                </div>
              </section>
            ) : null}

            {step === 3 ? (
              <section className="collaborator-create-modal__section">
                <h3 className="collaborator-create-modal__section-title">Acesso ao sistema</h3>
                <p className="collaborator-create-modal__section-description muted">
                  Com acesso ativo, o Love Odonto cria o usuário, vincula à clínica e envia convite de primeiro acesso por e-mail.
                </p>
                <label className="collaborator-create-modal__checkbox">
                  <input
                    type="checkbox"
                    checked={form.allowSystemAccess}
                    onChange={(e) => patchProfile({ allowSystemAccess: e.target.checked })}
                  />
                  Permitir acesso ao sistema
                </label>
                {form.allowSystemAccess ? (
                  <div className="collaborator-create-modal__field" style={{ marginTop: '1rem' }}>
                    <label htmlFor="new-collab-profile-role">Perfil de acesso *</label>
                    <select
                      id="new-collab-profile-role"
                      className="collaborator-create-modal__control"
                      value={resolvedProfileRole}
                      onChange={(e) => patchProfile({ profileRole: e.target.value })}
                    >
                      {COLLABORATOR_PROFILE_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </section>
            ) : null}

            {step === 4 ? (
              <section className="collaborator-create-modal__section">
                <h3 className="collaborator-create-modal__section-title">Revisão e envio do convite</h3>
                <dl className="collaborator-create-review">
                  <div><dt>Nome</dt><dd>{form.nomeCompleto || '—'}</dd></div>
                  <div><dt>E-mail</dt><dd>{form.email || '—'}</dd></div>
                  <div><dt>Categoria</dt><dd>{form.rhCategoria || '—'}</dd></div>
                  <div><dt>Cargo</dt><dd>{form.cargo || '—'}</dd></div>
                  <div><dt>Status RH</dt><dd>{form.status || 'ativo'}</dd></div>
                  <div><dt>Acesso ao sistema</dt><dd>{form.allowSystemAccess ? 'Sim' : 'Não'}</dd></div>
                  {form.allowSystemAccess ? (
                    <div><dt>Perfil</dt><dd>{profileRoleLabel}</dd></div>
                  ) : null}
                </dl>
              </section>
            ) : null}
          </form>
        </ModalBody>

        <ModalFooter className="collaborator-create-modal__footer">
          <Button type="button" variant="secondary" onClick={tryClose} disabled={submitting}>
            Cancelar
          </Button>
          {step > 1 ? (
            <Button type="button" variant="secondary" onClick={goBack} disabled={submitting}>
              Voltar
            </Button>
          ) : null}
          {step < STEPS.length ? (
            <Button type="button" onClick={goNext} disabled={submitting}>
              Continuar
            </Button>
          ) : (
            <Button type="submit" form="collaborator-create-form" disabled={submitting}>
              {footerPrimaryLabel}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}

export { CollaboratorCreateModal as NewCollaboratorDialog };
