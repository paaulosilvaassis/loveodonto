export const Tabs = ({ tabs, active, onChange, variant = 'default' }) => (
  <div className={`tabs ${variant === 'record' ? 'tabs--record' : ''}`} role="tablist">
    {tabs.map((tab) => {
      const Icon = tab.icon;
      return (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          className={`tab ${active === tab.value ? 'active' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {Icon ? <Icon size={16} className="tab__icon" aria-hidden /> : null}
          {tab.label}
        </button>
      );
    })}
  </div>
);
