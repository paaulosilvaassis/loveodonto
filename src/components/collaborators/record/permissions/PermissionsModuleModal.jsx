import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, X } from 'lucide-react';
import Button from '../../../Button.jsx';
import {
  ModalRoot, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalTitle, ModalDescription, ModalClose,
} from '../../../ui/Modal.jsx';
import { SaveToast } from '../RecordUi.jsx';
import PermissionsToolbar, { PermissionsSectorHeader, PermissionsColumnHeader } from './PermissionsToolbar.jsx';
import PermissionsFeatureBlock from './PermissionsFeatureBlock.jsx';
import PermissionsProgress from './PermissionsProgress.jsx';
import { COLUMN_ACTIONS, progressVariant } from './permissionsConstants.js';

const FEATURE_BATCH = 4;

export default function PermissionsModuleModal({
  open,
  sector,
  form,
  readOnly,
  saveHandlers,
  onClose,
}) {
  const [toastMessage, setToastMessage] = useState('');
  const [visibleFeatures, setVisibleFeatures] = useState(FEATURE_BATCH);

  useEffect(() => {
    if (!open) {
      setVisibleFeatures(FEATURE_BATCH);
      return undefined;
    }
    setVisibleFeatures(FEATURE_BATCH);
    let cancelled = false;
    const rows = sector?.rows?.length || 0;
    if (rows <= FEATURE_BATCH) return undefined;

    const grow = () => {
      if (cancelled) return;
      setVisibleFeatures((prev) => {
        const next = Math.min(prev + FEATURE_BATCH, rows);
        if (next < rows) requestAnimationFrame(grow);
        return next;
      });
    };
    requestAnimationFrame(grow);
    return () => { cancelled = true; };
  }, [open, sector?.key, sector?.rows?.length]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = setTimeout(() => setToastMessage(''), 3200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const sectorSelected = useMemo(() => {
    if (!sector) return 0;
    return sector.allPerms.filter((p) => form.effectivePermission(p.id)).length;
  }, [sector, form.effectivePermission, form.overrides, form.role]);

  const sectorTotal = sector?.allPerms?.length || 0;

  const columnStats = useMemo(() => {
    if (!sector) return {};
    const stats = {};
    for (const actionKey of COLUMN_ACTIONS) {
      const perms = sector.allPerms.filter((p) => p.action_key === actionKey);
      const selected = perms.filter((p) => form.effectivePermission(p.id)).length;
      stats[actionKey] = { selected, total: perms.length };
    }
    return stats;
  }, [sector, form.effectivePermission, form.overrides, form.role]);

  const visibleRows = useMemo(
    () => (sector?.rows || []).slice(0, visibleFeatures),
    [sector?.rows, visibleFeatures],
  );

  const handleSelectAll = useCallback(() => {
    const count = form.selectAll();
    setToastMessage(`✓ ${count} permissões concedidas.`);
  }, [form]);

  const handleClearAll = useCallback(() => {
    form.clearAll();
    setToastMessage('✓ Todas as permissões removidas.');
  }, [form]);

  const handleToggleSector = useCallback((allowed) => {
    if (!sector) return;
    if (allowed) form.selectAllInSector(sector.key);
    else form.clearAllInSector(sector.key);
  }, [form, sector]);

  const handleToggleRow = useCallback((row, allowed) => {
    form.setRowPermissions(row, allowed);
  }, [form]);

  const handleToggleColumn = useCallback((actionKey, allowed) => {
    if (!sector) return;
    form.setActionInSector(sector.key, actionKey, allowed);
  }, [form, sector]);

  const handleCopy = useCallback(async () => {
    const ok = await form.copyPermissions();
    setToastMessage(ok ? '✓ Permissões copiadas.' : 'Não foi possível copiar.');
  }, [form]);

  const handlePaste = useCallback(async () => {
    const result = await form.pastePermissions();
    if (result.ok) {
      setToastMessage(`✓ ${result.count} permissões coladas.`);
    } else {
      setToastMessage(result.error || 'Não foi possível colar.');
    }
  }, [form]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    const saved = await form.handleSave({
      onSaveSuccess: (result) => {
        onClose();
        saveHandlers?.onSaveSuccess?.(result);
      },
      onSaveError: (message) => {
        const text = message || 'Erro ao salvar permissões.';
        setToastMessage(text);
        saveHandlers?.onSaveError?.(message);
      },
    });
    if (saved) onClose();
  }, [form, saveHandlers, onClose]);

  const progressClass = progressVariant(sectorSelected, sectorTotal);

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="xl" className="cr-perms-modal">
        <ModalHeader className="cr-perms-modal__header">
          <div>
            <ModalTitle>{sector?.label || 'Permissões'}</ModalTitle>
            <ModalDescription>Defina o que este colaborador pode fazer em cada funcionalidade.</ModalDescription>
          </div>
          <div className="cr-perms-modal__header-end">
            <span className={`cr-perms-modal__badge cr-perms-modal__badge--${progressClass}`}>
              {sectorSelected}/{sectorTotal}
            </span>
            <ModalClose className="cr-perms-modal__close" aria-label="Fechar">
              <X size={18} />
            </ModalClose>
          </div>
        </ModalHeader>

        <div className="cr-perms-modal__toolbar-wrap">
          <PermissionsToolbar
            readOnly={readOnly}
            allowedCount={form.allowedCount}
            totalPerms={form.totalPerms}
            onSelectAll={handleSelectAll}
            onClearAll={handleClearAll}
            onRestoreDefaults={form.restoreRoleDefaults}
            onCopy={handleCopy}
            onPaste={handlePaste}
          />
        </div>

        <ModalBody className="cr-perms-modal__body">
          {sector ? (
            <>
              <PermissionsSectorHeader
                sectorLabel={sector.label}
                readOnly={readOnly}
                sectorSelected={sectorSelected}
                sectorTotal={sectorTotal}
                onToggleSector={handleToggleSector}
              />
              <PermissionsProgress
                selected={sectorSelected}
                total={sectorTotal}
                className="cr-perms-modal__progress"
              />
              <div className="cr-perms-modal__columns" role="group" aria-label="Seleção por coluna">
                {COLUMN_ACTIONS.map((actionKey) => {
                  const stat = columnStats[actionKey] || { selected: 0, total: 0 };
                  if (stat.total === 0) return null;
                  return (
                    <PermissionsColumnHeader
                      key={actionKey}
                      actionKey={actionKey}
                      actionLabel={form.ACTION_LABELS[actionKey] || actionKey}
                      readOnly={readOnly}
                      selected={stat.selected}
                      total={stat.total}
                      onToggleColumn={handleToggleColumn}
                    />
                  );
                })}
              </div>
              <div className="cr-perms-modal__features">
                {visibleRows.map((row) => (
                  <PermissionsFeatureBlock
                    key={row.key}
                    row={row}
                    actionLabels={form.ACTION_LABELS}
                    readOnly={readOnly}
                    effectivePermission={form.effectivePermission}
                    onTogglePermission={form.setPermission}
                    onToggleRow={handleToggleRow}
                  />
                ))}
              </div>
            </>
          ) : null}
        </ModalBody>

        {form.dirty ? (
          <ModalFooter className="cr-perms-modal__footer">
            <Button variant="ghost" icon={X} onClick={handleCancel}>Cancelar</Button>
            <Button
              variant="primary"
              icon={Save}
              loading={form.saving}
              disabled={readOnly}
              onClick={handleSave}
            >
              Salvar permissões
            </Button>
          </ModalFooter>
        ) : (
          <ModalFooter className="cr-perms-modal__footer cr-perms-modal__footer--idle">
            <Button variant="ghost" icon={X} onClick={handleCancel}>Fechar</Button>
          </ModalFooter>
        )}

        <SaveToast
          message={toastMessage}
          type={toastMessage && !toastMessage.startsWith('✓') ? 'error' : 'success'}
        />
      </ModalContent>
    </ModalRoot>
  );
}
