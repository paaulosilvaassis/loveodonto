import { useState, useEffect } from 'react';
import { RotateCcw, Save, Settings2, X } from 'lucide-react';
import Button from '../../Button.jsx';
import { useCollaboratorAccessForm } from '../../../hooks/useCollaboratorAccessForm.js';
import {
  ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription,
} from '../../ui/Modal.jsx';

const ACTION_HINTS = {
  view: 'Visualizar informações',
  create: 'Cadastrar novos registros',
  edit: 'Alterar dados existentes',
  delete: 'Remover registros',
  export: 'Baixar relatórios',
  send: 'Disparar mensagens',
  cancel: 'Cancelar ações',
  move_stage: 'Mover etapas',
};

const ACTION_VERBS = {
  view: 'visualizar',
  create: 'criar',
  edit: 'editar',
  delete: 'excluir',
  export: 'exportar',
  send: 'enviar',
  cancel: 'cancelar',
  move_stage: 'mover',
};

function humanActionLabel(actionKey, featureLabel) {
  const verb = ACTION_VERBS[actionKey] || actionKey;
  return `Pode ${verb} em ${featureLabel}`;
}

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
  const readOnly = form.readOnly || !canEdit;
  const saveHandlers = { onSaveSuccess, onSaveError };

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
              onChange={(e) => { form.setRole(e.target.value); form.setDirty(true); }}
            >
              {form.roleOptions.map((r) => (
                <option key={r} value={r}>{form.ROLE_LABELS[r] || r}</option>
              ))}
            </select>
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
            const pct = total ? Math.round((selected / total) * 100) : 0;
            return (
              <article key={sector.key} className="cr-perms__module-card">
                <div className="cr-perms__module-head">
                  <strong>{sector.label}</strong>
                  <span>{selected}/{total}</span>
                </div>
                <div className="cr-perms__progress" aria-hidden>
                  <span style={{ width: `${pct}%` }} />
                </div>
                <Button variant="ghost" size="sm" icon={Settings2} onClick={() => setConfigModule(sector.key)}>
                  Configurar
                </Button>
              </article>
            );
          })}
        </div>
      </section>

      <ModalRoot open={Boolean(configModule)} onOpenChange={(open) => { if (!open) setConfigModule(null); }}>
        <ModalContent size="lg">
          <ModalHeader>
            <ModalTitle>{activeSector?.label || 'Permissões'}</ModalTitle>
            <ModalDescription>Defina o que este colaborador pode fazer em cada funcionalidade.</ModalDescription>
          </ModalHeader>
          <ModalBody>
            {activeSector?.rows.map((row) => (
              <div key={row.key} className="cr-perms__feature">
                <div className="cr-perms__feature-head">
                  <strong>{row.label}</strong>
                </div>
                <div className="cr-perms__feature-actions">
                  {row.actions.map((actionKey) => {
                    const perm = row.permByAction[actionKey];
                    if (!perm) return null;
                    const checked = form.effectivePermission(perm.id);
                    const hint = ACTION_HINTS[actionKey] || form.ACTION_LABELS[actionKey];
                    return (
                      <label key={actionKey} className={`cr-perms__action ${checked ? 'is-on' : ''}`} title={humanActionLabel(actionKey, row.label)}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={readOnly}
                          onChange={(e) => form.setPermission(perm.id, e.target.checked)}
                        />
                        <span className="cr-perms__action-label">{form.ACTION_LABELS[actionKey] || actionKey}</span>
                        <span className="cr-perms__action-hint">{hint}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" icon={X} onClick={() => setConfigModule(null)}>Fechar</Button>
            <Button variant="primary" icon={Save} loading={form.saving} disabled={readOnly || !form.dirty} onClick={() => form.handleSave(saveHandlers)}>
              Salvar permissões
            </Button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
