import { useEffect, useRef, useState } from 'react';
import { MoreVertical, Send, X, Calendar, AlertTriangle, FileText } from 'lucide-react';

export default function FlowActionMenu({
  onReminder,
  onCancel,
  onReschedule,
  onNoShow,
  onViewDetails,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
  }, [open]);

  return (
    <div className="flow-row-menu" ref={ref}>
      <button
        type="button"
        className="flow-row-icon-button"
        onClick={() => setOpen((prev) => !prev)}
        title="Mais opções"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="flow-row-menu-dropdown">
          <button type="button" className="flow-row-menu-item" onClick={() => { onReminder(); setOpen(false); }}>
            <Send size={14} />
            <span>Enviar lembrete</span>
          </button>
          <button type="button" className="flow-row-menu-item" onClick={() => { onCancel(); setOpen(false); }}>
            <X size={14} />
            <span>Desmarcar</span>
          </button>
          <button type="button" className="flow-row-menu-item" onClick={() => { onReschedule(); setOpen(false); }}>
            <Calendar size={14} />
            <span>Reagendar</span>
          </button>
          <button type="button" className="flow-row-menu-item" onClick={() => { onNoShow(); setOpen(false); }}>
            <AlertTriangle size={14} />
            <span>Marcar falta</span>
          </button>
          <button type="button" className="flow-row-menu-item" onClick={() => { onViewDetails(); setOpen(false); }}>
            <FileText size={14} />
            <span>Ver detalhes</span>
          </button>
        </div>
      )}
    </div>
  );
}
