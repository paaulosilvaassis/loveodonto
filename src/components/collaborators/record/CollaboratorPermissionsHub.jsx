import { useState, useEffect, useCallback, useMemo } from 'react';
import { RotateCcw, Save, Settings2 } from 'lucide-react';
import Button from '../../Button.jsx';
import {
  ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription,
} from '../../ui/Modal.jsx';
import { useCollaboratorAccessForm } from '../../../hooks/useCollaboratorAccessForm.js';
import PermissionsModuleModal from './permissions/PermissionsModuleModal.jsx';
import PermissionsProgress from './permissions/PermissionsProgress.jsx';
import { progressVariant } from './permissions/permissionsConstants.js';

export default function CollaboratorPermissionsHub({
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

  const [configModule, setConfigModule] = useState(null);
  const [roleChangePrompt, setRoleChangePrompt] = useState(null);
  const readOnly = form.readOnly || !canEdit;

  const closeModal = useCallback(() => setConfigModule(null), []);

  const handleRoleSelectChange = useCallback((nextRole) => {
    if (readOnly || nextRole === form.role) return;
    setRoleChangePrompt({ previousRole: form.role, nextRole });
  }, [readOnly, form.role]);

  const confirmRoleChange = useCallback(() => {
    if (!roleChangePrompt?.nextRole) return;
    form.applyRoleWithDefaults(roleChangePrompt.nextRole);
    setRoleChangePrompt(null);
  }, [form, roleChangePrompt]);

  const cancelRoleChange = useCallback(() => {
    setRoleChangePrompt(null);
  }, []);

  const saveHandlers = useMemo(() => ({
    onSaveSuccess: (result) => {
      closeModal();
      onSaveSuccess?.(result);
    },
    onSaveError,
    onRepairNotice,
  }), [closeModal, onSaveSuccess, onSaveError, onRepairNotice]);

  useEffect(() => {
    onDirtyChange?.(form.dirty);
  }, [form.dirty, onDirtyChange]);

  const activeSector = configModule
    ? form.sectorsWithPerms.find((s) => s.key === configModule)
    : null;

  return (
    <div className="cr-perms">
      <section className="cr-perms__profile">
        <div className="cr-perms__profile-main">
          <div>
            <span className="cr-perms__label">Perfil atual</span>
            <strong className="cr-perms__profile-name">{form.ROLE_LABELS[form.role] || form.role || '—'}</strong>
          </div>
          <div className="cr-perms__profile-select">
            <label htmlFor="perm-role-select" className="cr-perms__label">Alterar perfil</label>
            <select
              id="perm-role-select"
              value={form.role}
              disabled={readOnly}
              onChange={(e) => handleRoleSelectChange(e.target.value)}
            >
              {form.roleOptions.map((r) => (
                <option key={r} value={r}>{form.ROLE_LABELS[r] || r}</option>
              ))}
            </select>
          </div>
          <div className="cr-perms__profile-counter" aria-live="polite">
            <span className="cr-perms__label">Total selecionado</span>
            <strong>{form.allowedCount}/{form.totalPerms}</strong>
          </div>
        </div>
        <div className="cr-perms__profile-actions">
          <Button variant="secondary" size="sm" icon={RotateCcw} disabled={readOnly} onClick={form.restoreRoleDefaults}>
            Aplicar perfil padrão
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Save}
            loading={form.saving}
            disabled={readOnly || !form.dirty}
            onClick={() => form.handleSave(saveHandlers)}
          >
            Salvar permissões
          </Button>
        </div>
      </section>

      <section className="cr-perms__modules">
        <h3 className="cr-perms__section-title">Resumo por módulo</h3>
        <p className="cr-perms__section-desc muted">Clique em Configurar para ajustar as permissões de cada área.</p>
        <div className="cr-perms__module-grid">
          {form.sectorsWithPerms.map((sector) => {
            const { selected, total } = form.sectorCount(sector.key);
            const variant = progressVariant(selected, total);
            return (
              <article key={sector.key} className={`cr-perms__module-card cr-perms__module-card--${variant}`}>
                <div className="cr-perms__module-head">
                  <strong>{sector.label}</strong>
                  <span className={`cr-perms__module-counter cr-perms__module-counter--${variant}`}>
                    {selected}/{total}
                  </span>
                </div>
                <PermissionsProgress selected={selected} total={total} />
                <Button variant="ghost" size="sm" icon={Settings2} onClick={() => setConfigModule(sector.key)}>
                  Configurar
                </Button>
              </article>
            );
          })}
        </div>
      </section>

      <PermissionsModuleModal
        open={Boolean(configModule)}
        sector={activeSector}
        form={form}
        readOnly={readOnly}
        saveHandlers={saveHandlers}
        onClose={closeModal}
      />

      <ModalRoot open={Boolean(roleChangePrompt)} onOpenChange={(next) => { if (!next) cancelRoleChange(); }}>
        <ModalContent size="sm">
          <ModalHeader>
            <ModalTitle>Alterar perfil</ModalTitle>
            <ModalDescription>
              Deseja aplicar o perfil padrão e substituir as permissões atuais?
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <p className="muted">
              O perfil será alterado para{' '}
              <strong>{form.ROLE_LABELS[roleChangePrompt?.nextRole] || roleChangePrompt?.nextRole}</strong>.
              {' '}As permissões personalizadas serão substituídas pelo padrão deste perfil.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={cancelRoleChange}>Cancelar</Button>
            <Button variant="primary" onClick={confirmRoleChange}>Aplicar perfil padrão</Button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
