export default function OdontogramActionButtons({ actions, selectedAction, onSelect, disabled }) {
  return (
    <div className="odontogram-action-grid">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          className={`odontogram-action-button ${selectedAction === action.key ? 'active' : ''}`}
          onClick={() => onSelect(action.key)}
          data-state={selectedAction === action.key ? 'active' : 'inactive'}
          disabled={disabled}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
