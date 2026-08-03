import { useEffect, useState } from 'react';
import { Field } from '../Field.jsx';
import Button from '../Button.jsx';
import {
  updateMemberProfile,
  updateMemberRole,
  setMemberSystemAccess,
} from '../../services/membershipService.js';
import { updateCollaborator } from '../../services/collaboratorService.js';
import {
  MEMBERSHIP_ROLES,
  MEMBERSHIP_ROLE_LABELS,
  ROLE_MASTER,
} from '../../constants/tenantRoles.js';
import { X } from 'lucide-react';

function formatUpdatedAt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function displayOrEmpty(v) {
  if (v === undefined || v === null) return '—';
  const s = String(v).trim();
  return s && s !== '—' ? s : '—';
}

export default function UsuarioMemberModal({
  open,
  member,
  mode,
  onClose,
  onSwitchMode,
  tenantId,
  actor,
  onAfterSave,
  onNotify,
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [cargo, setCargo] = useState('');
  const [role, setRole] = useState('atendimento');
  const [hasSystemAccess, setHasSystemAccess] = useState(true);
  const [saving, setSaving] = useState(false);

  const isSelf = actor?.id && member?.user_id === actor.id;
  const isEdit = mode === 'edit';
  const collaboratorId = member?.collaborator_id || null;

  useEffect(() => {
    if (!open || !member) return;
    setFullName(member.name === '—' ? '' : member.name || '');
    setEmail(member.email === '—' ? '' : member.email || '');
    setPhone(member.phone || '');
    setInternalNotes(member.internal_notes || '');
    setCargo(member.cargo === '—' ? '' : member.cargo || '');
    setRole(member.role || 'atendimento');
    setHasSystemAccess(member.has_system_access !== false);
  }, [open, member]);

  if (!open || !member) return null;

  const accessEffective =
    member.has_system_access !== false && member.user_active !== false;

  const handleSave = () => {
    setSaving(true);
    try {
      const nameTrim = fullName.trim();
      const emailTrim = email.trim().toLowerCase();
      const phoneTrim = phone.trim();
      const notesTrim = internalNotes.trim();
      const cargoTrim = cargo.trim();
      if (!nameTrim) throw new Error('Nome completo é obrigatório.');
      if (!emailTrim) throw new Error('E-mail é obrigatório.');
      if (collaboratorId && !cargoTrim) {
        throw new Error('Cargo é obrigatório para usuário vinculado a colaborador.');
      }

      updateMemberProfile(actor, tenantId, member.user_id, {
        full_name: nameTrim,
        email: emailTrim,
        phone: phoneTrim,
        internal_notes: notesTrim,
      });

      const origCargo = member.cargo === '—' ? '' : (member.cargo || '').trim();
      if (collaboratorId && cargoTrim !== origCargo) {
        updateCollaborator(actor, collaboratorId, { cargo: cargoTrim });
      }

      if (!(isSelf && member.role === ROLE_MASTER) && role !== member.role) {
        updateMemberRole(actor, tenantId, member.user_id, role);
      }

      if (
        !isSelf &&
        Boolean(hasSystemAccess) !== Boolean(member.has_system_access)
      ) {
        setMemberSystemAccess(actor, tenantId, member.user_id, hasSystemAccess);
      }

      onNotify?.('success', 'Usuário atualizado com sucesso.');
      onAfterSave?.();
      onClose?.();
    } catch (e) {
      onNotify?.('error', e?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal card" style={{ maxWidth: '520px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="flex gap-sm" style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>{isEdit ? 'Editar usuário' : 'Detalhes do usuário'}</h3>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
              {displayOrEmpty(member.tenant_name)}
            </p>
          </div>
          <button type="button" className="button secondary small" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {!isEdit ? (
          <div className="stack" style={{ gap: '0.75rem' }}>
            <p><strong>Nome:</strong> {displayOrEmpty(member.name)}</p>
            <p><strong>E-mail:</strong> {displayOrEmpty(member.email)}</p>
            <p><strong>Telefone:</strong> {displayOrEmpty(member.phone)}</p>
            <p><strong>Cargo / função:</strong> {displayOrEmpty(member.cargo === '—' ? '' : member.cargo)}</p>
            <p><strong>Perfil:</strong> {MEMBERSHIP_ROLE_LABELS[member.role] || member.role}</p>
            <p>
              <strong>Status do acesso:</strong>{' '}
              <span className={accessEffective ? 'access-badge on' : 'access-badge off'}>
                {accessEffective ? 'Ativo' : 'Inativo'}
              </span>
            </p>
            <p><strong>Observações internas:</strong> {displayOrEmpty(member.internal_notes)}</p>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Última atualização do vínculo: {formatUpdatedAt(member.updated_at)}
            </p>
            <div className="flex gap-sm" style={{ marginTop: '1rem' }}>
              <Button type="button" variant="primary" onClick={() => onSwitchMode?.('edit')}>
                Editar
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <Field label="Nome completo">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </Field>
            <Field label="E-mail">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Telefone">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Opcional" />
            </Field>
            <Field label="Cargo / função">
              {collaboratorId ? (
                <input value={cargo} onChange={(e) => setCargo(e.target.value)} required />
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Sem vínculo com cadastro de colaborador. O cargo pode ser informado apenas quando houver esse vínculo.
                </p>
              )}
            </Field>
            <Field label="Perfil de acesso">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={isSelf && member.role === ROLE_MASTER}
              >
                {MEMBERSHIP_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {MEMBERSHIP_ROLE_LABELS[r] || r}
                  </option>
                ))}
              </select>
              {isSelf && member.role === ROLE_MASTER ? (
                <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
                  Você não pode alterar seu próprio perfil de MASTER aqui.
                </p>
              ) : null}
            </Field>
            <Field label="Acesso ao sistema">
              <label className="flex gap-sm" style={{ alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={hasSystemAccess}
                  onChange={(e) => setHasSystemAccess(e.target.checked)}
                  disabled={isSelf}
                />
                <span>Usuário pode entrar no sistema</span>
              </label>
              {isSelf ? (
                <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
                  Você não pode desativar seu próprio acesso.
                </p>
              ) : null}
            </Field>
            <Field label="Observações internas">
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={3}
                placeholder="Notas visíveis apenas na gestão de usuários"
              />
            </Field>
            <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
              Última atualização do vínculo: {formatUpdatedAt(member.updated_at)}
            </p>
            <div className="flex gap-sm" style={{ marginTop: '1rem' }}>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => onSwitchMode?.('view')} disabled={saving}>
                Voltar aos detalhes
              </Button>
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
