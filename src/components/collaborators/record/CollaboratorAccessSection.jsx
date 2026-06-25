import { useCallback, useEffect, useState } from 'react';
import { Info, Mail, Shield, UserCheck, UserX } from 'lucide-react';
import Button from '../../Button.jsx';
import { Field } from '../../Field.jsx';
import { useCollaboratorAccessForm } from '../../../hooks/useCollaboratorAccessForm.js';
import CollaboratorAccessManagementCard from '../../access/CollaboratorAccessManagementCard.jsx';
import IdentityHealthBanner from '../../access/IdentityHealthBanner.jsx';
import { accessStatusBadgeClass } from '../../../utils/inviteStatus.js';
import { isSaasModeEnabled } from '../../../services/saasAuthService.js';
import {
  fetchCollaboratorAccessAudit,
  requestCollaboratorPasswordReset,
  sendCollaboratorInvite,
} from '../../../services/collaboratorAccessProvisionService.js';
import { reconcileCollaboratorAccessState } from '../../../services/collaboratorAccessRecoveryService.js';
import { isTenantSystemAccessActive } from '../../../utils/collaboratorAccessManagement.js';
import {
  fetchIdentityByCollaborator,
  fetchIdentityEvents,
  repairIdentity,
  revokeIdentitySessions,
  IDENTITY_STATUS_LABELS,
  IDENTITY_HEALTH_LABELS,
} from '../../../services/identityService.js';

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
  onToggleSystemAccess,
  onGoToProfile,
  onDirtyChange,
  onRecovered,
  onIdentityChange,
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
  const [identity, setIdentity] = useState(null);
  const [identityEvents, setIdentityEvents] = useState([]);
  const readOnly = form.readOnly || !canEdit;
  const saveHandlers = { onSaveSuccess, onSaveError, onRepairNotice };
  const inviteEmail = (form.credEmail || collaboratorEmail || '').trim().toLowerCase();
  const accessActive = tenantUser?.id
    ? isTenantSystemAccessActive(tenantUser)
    : form.hasSystemAccess;

  useEffect(() => {
    onDirtyChange?.(form.dirty);
  }, [form.dirty, onDirtyChange]);

  useEffect(() => {
    if (!collaboratorId || !saasTenantId) return;
    let active = true;
    (async () => {
      const result = await reconcileCollaboratorAccessState({
        collaboratorId,
        collaborator: {
          email: collaboratorEmail,
          nomeCompleto: linkedDisplayName,
          apelido: linkedDisplayName,
        },
        tenantUser,
        tenantId: saasTenantId,
        currentUser,
      });
      if (!active) return;
      if (result.recovered || result.access?.userId) {
        onRecovered?.(result);
      }
    })();
    return () => { active = false; };
  }, [
    collaboratorId,
    saasTenantId,
    tenantUser?.id,
    tenantUser?.user_id,
    collaboratorEmail,
    linkedDisplayName,
    currentUser,
    onRecovered,
  ]);

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

  const loadIdentity = useCallback(async () => {
    if (!isSaasModeEnabled() || !saasTenantId || !collaboratorId) {
      setIdentity(null);
      setIdentityEvents([]);
      onIdentityChange?.(null);
      return;
    }
    try {
      const row = await fetchIdentityByCollaborator({
        tenantId: saasTenantId,
        collaboratorId,
        email: inviteEmail,
      });
      setIdentity(row);
      onIdentityChange?.(row);
      if (row?.id) {
        const eventsResult = await fetchIdentityEvents(row.id, saasTenantId, 10);
        setIdentityEvents(Array.isArray(eventsResult?.events) ? eventsResult.events : []);
      } else {
        setIdentityEvents([]);
      }
    } catch {
      setIdentity(null);
      setIdentityEvents([]);
      onIdentityChange?.(null);
    }
  }, [saasTenantId, collaboratorId, inviteEmail, onIdentityChange]);

  useEffect(() => {
    loadIdentity();
  }, [loadIdentity]);

  const handleRepairIdentity = async () => {
    if (!identity?.id || !saasTenantId) return;
    form.setSaving(true);
    try {
      await repairIdentity(identity.id, { tenant_id: saasTenantId });
      onRepairNotice?.('Acesso reparado automaticamente.');
      onAccessChanged?.();
      await loadIdentity();
      await loadAudit();
    } catch (err) {
      onSaveError?.(err?.message || 'Não foi possível reparar o acesso.');
    } finally {
      form.setSaving(false);
    }
  };

  const handleRevokeSessions = async () => {
    if (!identity?.id || !saasTenantId) return;
    form.setSaving(true);
    try {
      await revokeIdentitySessions(identity.id, { tenant_id: saasTenantId });
      onSaveSuccess?.({ message: 'Sessões revogadas com sucesso.' });
      await loadIdentity();
    } catch (err) {
      onSaveError?.(err?.message || 'Não foi possível revogar as sessões.');
    } finally {
      form.setSaving(false);
    }
  };

  const handleSendInvite = async () => {
    if (!collaboratorId || !saasTenantId || !inviteEmail) {
      onSaveError?.('Informe um e-mail válido antes de enviar o convite.');
      return;
    }
    form.setSaving(true);
    try {
      const result = await sendCollaboratorInvite({
        tenant_id: saasTenantId,
        collaborator_id: collaboratorId,
        collaborator_full_name: (linkedDisplayName || '').trim() || inviteEmail,
        email: inviteEmail,
        profile_role: form.role || 'atendimento',
        repair_stale_auth: true,
      }, { onRepairNotice, tenantUser });
      onAccessChanged?.();
      const delivery = result?.invite_delivery;
      if (result?.repairedBrokenLink || result?.repaired_broken_link) {
        onRepairNotice?.('Vínculo de acesso corrigido automaticamente.');
      }
      onSaveSuccess?.({
        inviteSent: result?.emailSent ?? result?.inviteSent,
        message: result?.message || (delivery?.setupLink
          ? 'Link de acesso gerado. Copie e envie ao colaborador se o e-mail não chegar.'
          : 'Convite enviado por e-mail.'),
      });
      await loadAudit();
      await loadIdentity();
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
      if (result?.auth_recreated || result?.invite_resent) {
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
      await loadIdentity();
    } catch (err) {
      onSaveError?.(err?.message || 'Não foi possível enviar o e-mail. Tente novamente.');
    } finally {
      form.setSaving(false);
    }
  };

  return (
    <div className="cr-access">
      <IdentityHealthBanner
        identity={identity}
        canEdit={canEdit}
        saving={form.saving}
        onRepair={identity?.id ? handleRepairIdentity : null}
      />

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
          {onToggleSystemAccess && tenantUser?.id ? (
            <Button
              variant="secondary"
              size="sm"
              icon={accessActive ? UserX : UserCheck}
              disabled={readOnly || form.saving}
              onClick={onToggleSystemAccess}
            >
              {accessActive ? 'Desativar acesso' : 'Ativar acesso'}
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

      {tenantUser?.id ? (
        <CollaboratorAccessManagementCard
          tenantUser={tenantUser}
          identity={identity}
          collaboratorEmail={form.credEmail || collaboratorEmail}
          saasTenantId={saasTenantId}
          collaboratorId={collaboratorId}
          linkedDisplayName={linkedDisplayName}
          currentUser={currentUser}
          canEdit={canEdit}
          saving={form.saving}
          auditEvents={auditEvents}
          identityEvents={identityEvents}
          onLoadAudit={loadAudit}
          onSendInvite={handleSendInvite}
          onResendInvite={() => form.handleResendInvite(saveHandlers)}
          onResetPassword={handleResetPassword}
          onToggleSystemAccess={onToggleSystemAccess}
          onRepairIdentity={identity?.id ? handleRepairIdentity : null}
          onRevokeSessions={identity?.id ? handleRevokeSessions : null}
          statusLabels={IDENTITY_STATUS_LABELS}
          healthLabels={IDENTITY_HEALTH_LABELS}
        />
      ) : null}
    </div>
  );
}
