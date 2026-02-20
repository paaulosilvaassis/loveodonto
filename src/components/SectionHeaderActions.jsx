export const SectionHeaderActions = ({ title, isEditing, onEdit, onSave, onCancel, loading }) => {
  const canEdit = typeof onEdit === 'function';
  const isBusy = Boolean(loading);

  return (
    <div className="section-header-actions">
      <div className="section-header-actions-title">
        {typeof title === 'string' ? <h3>{title}</h3> : title}
      </div>
      <div className="section-header-actions-buttons">
        {isEditing ? (
          <>
            <button className="button secondary" type="button" onClick={onCancel} disabled={isBusy}>
              Cancelar
            </button>
            <button className="button primary" type="button" onClick={onSave} disabled={isBusy}>
              Salvar
            </button>
          </>
        ) : (
          <button className="button secondary" type="button" onClick={onEdit} disabled={!canEdit || isBusy}>
            <span className="button-icon" aria-hidden="true">
              ✏
            </span>
            Editar
          </button>
        )}
      </div>
    </div>
  );
};
