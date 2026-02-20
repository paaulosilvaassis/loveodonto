export const Tabs = ({ tabs, active, onChange }) => (
  <div className="tabs">
    {tabs.map((tab) => (
      <button
        key={tab.value}
        type="button"
        className={`tab ${active === tab.value ? 'active' : ''}`}
        onClick={() => onChange(tab.value)}
      >
        {tab.label}
      </button>
    ))}
  </div>
);
