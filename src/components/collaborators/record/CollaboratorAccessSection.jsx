import { useCallback, useEffect, useState } from 'react';
import { Info, Mail, Shield, UserX } from 'lucide-react';
import Button from '../../Button.jsx';
import { Field } from '../../Field.jsx';
import { useCollaboratorAccessForm } from '../../../hooks/useCollaboratorAccessForm.js';
import CollaboratorAccessManagementCard from '../../access/CollaboratorAccessManagementCard.jsx';
import { accessStatusBadgeClass } from '../../../utils/inviteStatus.js';
import { isSaasModeEnabled } from '../../../services/saasAuthService.js';
import {
  fetchCollaboratorAccessAudit,
  requestCollaboratorPasswordReset,
  sendCollaboratorInvite,
} from '../../../services/collaboratorAccessProvisionService.js';

export default function CollaboratorAccessSection({
  collaboratorId,
  targetUserId,
  tenantUser,
  collaboratorEmail,
  saasTenantId,
  linkedDisplayName,
  currentUser,
  canEdit,
  accessDisplayStatus,
  onSaveSuccess,
  onSaveError,
  onRepairNotice,
  onAccessChanged,
  onDeactivateAccess,
  onGoToProfile,
  onDirtyChange,
}) {
  const form = useCollaboratorAccessForm({
    collaboratorId,
    targetUserId,
    tenantUser,
    collaboratorEmail,
    saasTenantId,
    linkedDisplayName,
    currentUser,
    accessDisplayStatus,
    onAccessChanged,
  });

  const [auditEvents, setAuditEvents] = useState([]);
  const readOnly = form.readOnly || !canEdit;
  const saveHandlers = { onSaveSuccess, onSaveError, onRepairNotice };
  const inviteEmail = (form.credEmail || collaboratorEmail || '').trim().toLowerCase();

  useEffect(() => {
    onDirtyChange?.(form.dirty);
  }, [form.dirty, onDirtyChange]);

  const loadAudit = useCallback(async () => {
    if (!isSaasModeEnabled() || !saasTenantId || !inviteEmail) return;
    try {
      const result = await fetchCollaboratorAccessAudit({
        tenant_id: saasTenantId,
        email: inviteEmail,
      });
      setAuditEvents(Array.isArray(result?.events) ? result.events : []);
    } catch {
      setAuditEvents([]);
    }
  }, [saasTenantId, inviteEmail]);

  const handleSendInvite = async () => {
    if (!collaboratorId || !saasTenantId || !inviteEmail) {
      onSaveError?.('Informe um e-mail válido antes de enviar o convite.');
      return;
    }
    form.setSaving(true);
    try {
      await sendCollaboratorInvite({
        tenant_id: saasTenantId,
        collaborator_id: collaboratorId,
        collaborator_full_name: (linkedDisplayName || '').trim() || inviteEmail,
        email: inviteEmail,
        profile_role: form.role || 'atendimento',
        repair_stale_auth: true,
        tenantUser,
      });
      onAccessChanged?.();
      onSaveSuccess?.({ inviteSent: true });
      await loadAudit();
    } catch (err) {
      onSaveError?.(err?.message || 'Não foi possível enviar o convite. Tente novamente.');
    } finally {
      form.setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!saasTenantId || !inviteEmail) return;
    form.setSaving(true);
    try {
      const result = await requestCollaboratorPasswordReset({
        tenant_id: saasTenantId,
        email: inviteEmail,
        collaborator_id: collaboratorId || tenantUser?.collaborator_id || null,
      });
      onAccessChanged?.();
      if (result?.auth_recreated) {
        onRepairNotice?.(result.message);
      } else {
        onSaveSuccess?.({
          passwordResetSent: true,
          message: result?.message || `Link de redefinição enviado para: ${inviteEmail}`,
        });
      }
      if (result?.audit) {
        setAuditEvents((prev) => [result.audit, ...prev]);
      }
      await loadAudit();
    } catch (err) {
      onSaveError?.(err?.message || 'Não foi possível enviar o e-mail. Tente novamente.');
    } finally {
      form.setSaving(false);
    }
  };

  return (
    <div className="cr-access">
      {!tenantUser?.id && !form.effectiveTargetUserId && form.hasSystemAccess ? (
        <p className="cr-access__banner" role="status">
          <Info size={15} aria-hidden />
          Informe o e-mail de acesso e salve para enviar o convite ao colaborador.
        </p>
      ) : null}

      <section className="cr-access__card">
        <header className="cr-access__card-head">
          <Shield size={16} aria-hidden />
          <div>
            <h3>Acesso ao sistema</h3>
            <p className="muted">O colaborador cria a senha pelo link enviado por e-mail.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.hasSystemAccess}
            className={`access-tab-toggle ${form.hasSystemAccess ? 'on' : 'off'}`}
            disabled={readOnly}
            onClick={() => { form.setHasSystemAccess((v) => !v); form.setDirty(true); }}
          >
            <span className="access-tab-toggle-slider" />
          </button>
        </header>

        {form.hasSystemAccess ? (
          <div className="cr-access__grid">
            <Field label="E-mail de acesso">
              <input
                type="email"
                value={form.credEmail}
                disabled={readOnly}
                placeholder="email@exemplo.com"
                onChange={(e) => { form.setCredEmail(e.target.value); form.setDirty(true); }}
              />
            </Field>
            <div className="cr-access__readonly">
              <span className="cr-access__readonly-label">Status do convite</span>
              <span className={accessStatusBadgeClass(form.resolvedAccessStatus.key)}>{form.resolvedAccessStatus.label}</span>
            </div>
            <div className="cr-access__readonly">
              <span className="cr-access__readonly-label">Perfil no sistema</span>
              <strong>{form.ROLE_LABELS[form.role] || form.role || '—'}</strong>
            </div>
            <div className="cr-access__readonly">
              <span className="cr-access__readonly-label">Data do convite</span>
              <strong>{form.lastInviteLabel}</strong>
            </div>
            <Field label="Perfil de acesso">
              <select
                value={form.role}
                disabled={readOnly}
                onChange={(e) => { form.setRole(e.target.value); form.setDirty(true); }}
              >
                {form.roleOptions.map((r) => (
                  <option key={r} value={r}>{form.ROLE_LABELS[r] || r}</option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <p className="muted">O colaborador não terá login enquanto o acesso estiver desativado.</p>
        )}

        {!form.credEmail.trim() && onGoToProfile ? (
          <button type="button" className="cr-access__link" onClick={onGoToProfile}>Informar e-mail em Contatos</button>
        ) : null}

        <footer className="cr-access__footer">
          {form.canResendInvite ? (
            <Button variant="secondary" size="sm" icon={Mail} disabled={readOnly || form.saving} onClick={() => form.handleResendInvite(saveHandlers)}>
              Reenviar convite
            </Button>
          ) : null}
          {onDeactivateAccess ? (
            <Button variant="secondary" size="sm" icon={UserX} disabled={readOnly || form.saving} onClick={onDeactivateAccess}>
              Desativar acesso
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            disabled={readOnly || form.saving || !form.dirty}
            loading={form.saving}
            onClick={() => form.handleSave(saveHandlers)}
          >
            Salvar acesso
          </Button>
        </footer>
      </section>

      {form.hasSystemAccess ? (
        <CollaboratorAccessManagementCard
          tenantUser={tenantUser}
          collaboratorEmail={form.credEmail || collaboratorEmail}
          saasTenantId={saasTenantId}
          collaboratorId={collaboratorId}
          linkedDisplayName={linkedDisplayName}
          currentUser={currentUser}
          canEdit={canEdit}
          saving={form.saving}
          auditEvents={auditEvents}
          onLoadAudit={loadAudit}
          onSendInvite={handleSendInvite}
          onResendInvite={() => form.handleResendInvite(saveHandlers)}
          onResetPassword={handleResetPassword}
          onDeactivateAccess={onDeactivateAccess}
        />
      ) : null}
    </div>
  );
}
