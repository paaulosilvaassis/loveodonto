import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getRegionDisplay, QUADRANT_OPTIONS, REGION_TYPE_OPTIONS } from './planningUtils.js';

function ToothIcon() {
  return (
    <svg
      className="clinical-planning-region-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M12 3c-2.5 0-4.5 1.8-5 4.2-.3 1.5-.2 3.2.4 4.6.6 1.3 1.1 2.4 1.3 3.8.2 1.8-.4 3.9-1.2 5.4-.4.8-.1 1.7.7 2 1 .4 2.1-.2 2.4-1.2.5-1.6.8-3.3 1.4-4.8.6-1.5 1.5-1.5 2.1 0 .6 1.5.9 3.2 1.4 4.8.3 1 1.4 1.6 2.4 1.2.8-.3 1.1-1.2.7-2-.8-1.5-1.4-3.6-1.2-5.4.2-1.4.7-2.5 1.3-3.8.6-1.4.7-3.1.4-4.6C16.5 4.8 14.5 3 12 3z" />
    </svg>
  );
}

export function PlanningRegionField({ item, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const regionType = item.regionType || 'tooth';

  useEffect(() => {
    const handleOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
  }, [open]);

  const handleTypeChange = (type) => {
    if (type === 'arcada_superior') {
      onChange({ regionType: type, region: 'Arcada superior', tooth: '' });
    } else if (type === 'arcada_inferior') {
      onChange({ regionType: type, region: 'Arcada inferior', tooth: '' });
    } else if (type === 'quadrante') {
      onChange({ regionType: type, region: 'Q1', tooth: 'Q1' });
    } else if (type === 'livre') {
      onChange({ regionType: type, region: item.region || '', tooth: '' });
    } else {
      onChange({ regionType: type, tooth: item.tooth || '', region: '' });
    }
  };

  return (
    <div className="clinical-planning-region" ref={ref}>
      <button
        type="button"
        className="clinical-planning-region-trigger"
        onClick={() => setOpen((prev) => !prev)}
        title="Definir região"
      >
        <ToothIcon />
        <span>{getRegionDisplay(item)}</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="clinical-planning-region-panel">
          <div className="clinical-planning-region-types">
            {REGION_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={regionType === opt.value ? 'is-active' : ''}
                onClick={() => handleTypeChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {regionType === 'tooth' ? (
            <input
              type="text"
              inputMode="numeric"
              className="clinical-planning-region-input"
              placeholder="Ex: 11, 36"
              value={item.tooth || ''}
              onChange={(e) => onChange({ regionType: 'tooth', tooth: e.target.value, region: '' })}
            />
          ) : null}
          {regionType === 'quadrante' ? (
            <select
              className="clinical-planning-region-input"
              value={item.tooth || item.region || 'Q1'}
              onChange={(e) =>
                onChange({ regionType: 'quadrante', tooth: e.target.value, region: e.target.value })
              }
            >
              {QUADRANT_OPTIONS.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          ) : null}
          {regionType === 'livre' ? (
            <input
              type="text"
              className="clinical-planning-region-input"
              placeholder="Descreva a região"
              value={item.region || ''}
              onChange={(e) => onChange({ regionType: 'livre', region: e.target.value, tooth: '' })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
