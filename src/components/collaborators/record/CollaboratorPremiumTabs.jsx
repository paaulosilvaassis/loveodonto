export default function CollaboratorPremiumTabs({ tabs, active, onChange }) {
  return (
    <div className="cr-tabs" role="tablist" aria-label="Seções da ficha">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`cr-tab ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(tab.value)}
          >
            {Icon ? <Icon size={14} className="cr-tab__icon" aria-hidden /> : null}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
