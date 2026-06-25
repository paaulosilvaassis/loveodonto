import { memo, useCallback, useEffect, useRef } from 'react';
import {
  CheckSquare,
  Square,
  RotateCcw,
  ClipboardCopy,
  ClipboardPaste,
} from 'lucide-react';
import { checkboxTriState } from './permissionsConstants.js';

function TriStateCheckbox({ id, label, checked, indeterminate, disabled, onChange, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={`cr-perms-toolbar__check ${className}`.trim()} htmlFor={id}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span>{label}</span>
    </label>
  );
}

function ToolbarButton({ icon: Icon, label, disabled, onClick }) {
  return (
    <button type="button" className="cr-perms-toolbar__btn" disabled={disabled} onClick={onClick}>
      <Icon size={15} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

function PermissionsToolbar({
  readOnly,
  allowedCount,
  totalPerms,
  onSelectAll,
  onClearAll,
  onRestoreDefaults,
  onCopy,
  onPaste,
}) {
  const handleSelectAll = useCallback(() => {
    onSelectAll();
  }, [onSelectAll]);

  const handleClearAll = useCallback(() => {
    onClearAll();
  }, [onClearAll]);

  return (
    <div className="cr-perms-toolbar">
      <div className="cr-perms-toolbar__actions">
        <ToolbarButton
          icon={CheckSquare}
          label="Selecionar tudo"
          disabled={readOnly}
          onClick={handleSelectAll}
        />
        <ToolbarButton
          icon={Square}
          label="Limpar tudo"
          disabled={readOnly}
          onClick={handleClearAll}
        />
        <ToolbarButton
          icon={RotateCcw}
          label="Restaurar perfil padrão"
          disabled={readOnly}
          onClick={onRestoreDefaults}
        />
        <ToolbarButton
          icon={ClipboardCopy}
          label="Copiar permissões"
          disabled={readOnly}
          onClick={onCopy}
        />
        <ToolbarButton
          icon={ClipboardPaste}
          label="Colar permissões"
          disabled={readOnly}
          onClick={onPaste}
        />
      </div>
      <span className="cr-perms-toolbar__counter" aria-live="polite">
        {allowedCount}/{totalPerms} permissões selecionadas
      </span>
    </div>
  );
}

export function PermissionsSectorHeader({
  sectorLabel,
  readOnly,
  sectorSelected,
  sectorTotal,
  onToggleSector,
}) {
  const sectorState = checkboxTriState(sectorSelected, sectorTotal);

  const handleSectorToggle = useCallback((e) => {
    onToggleSector(e.target.checked);
  }, [onToggleSector]);

  return (
    <div className="cr-perms-sector-head">
      <TriStateCheckbox
        id="perm-sector-all"
        label="Selecionar todas as permissões deste módulo"
        checked={sectorState.checked}
        indeterminate={sectorState.indeterminate}
        disabled={readOnly}
        onChange={handleSectorToggle}
        className="cr-perms-sector-head__check"
      />
      <span className="cr-perms-sector-head__meta">
        <strong>{sectorLabel}</strong>
        <span className="cr-perms-sector-head__counter">{sectorSelected}/{sectorTotal}</span>
      </span>
    </div>
  );
}

export function PermissionsColumnHeader({
  actionKey,
  actionLabel,
  readOnly,
  selected,
  total,
  onToggleColumn,
}) {
  const colState = checkboxTriState(selected, total);
  const inputId = `perm-col-${actionKey}`;
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = colState.indeterminate;
  }, [colState.indeterminate]);

  const handleToggle = useCallback((e) => {
    onToggleColumn(actionKey, e.target.checked);
  }, [onToggleColumn, actionKey]);

  return (
    <label className="cr-perms-col-head" htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        checked={colState.checked}
        disabled={readOnly || total === 0}
        onChange={handleToggle}
      />
      <span>{actionLabel}</span>
    </label>
  );
}

export default memo(PermissionsToolbar);
