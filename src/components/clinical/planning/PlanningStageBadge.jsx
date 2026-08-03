import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PLANNING_STAGE_OPTIONS } from './planningUtils.js';

export function PlanningStageBadge({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current =
    PLANNING_STAGE_OPTIONS.find((s) => s.value === value) ||
    PLANNING_STAGE_OPTIONS[0];

  useEffect(() => {
    const handleOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
  }, [open]);

  return (
    <div className="clinical-planning-stage" ref={ref}>
      <button
        type="button"
        className={`clinical-planning-stage-badge tone-${current.tone}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{current.label}</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="clinical-planning-stage-menu" role="listbox">
          {PLANNING_STAGE_OPTIONS.map((stage) => (
            <button
              key={stage.value}
              type="button"
              role="option"
              aria-selected={stage.value === current.value}
              className={`clinical-planning-stage-option tone-${stage.tone}${stage.value === current.value ? ' is-selected' : ''}`}
              onClick={() => {
                onChange(stage.value);
                setOpen(false);
              }}
            >
              {stage.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
