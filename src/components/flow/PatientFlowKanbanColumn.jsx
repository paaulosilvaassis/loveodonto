import PatientFlowCard, { MIME_APPOINTMENT_ID, MIME_FLOW_COLUMN } from './PatientFlowCard.jsx';

/**
 * Coluna droppable do Kanban operacional.
 */
export default function PatientFlowKanbanColumn({
  column,
  cards = [],
  onMoveCard,
  onOpenPatient,
}) {
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('pf-flow-column--drag-over');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('pf-flow-column--drag-over');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('pf-flow-column--drag-over');
    const appointmentId = e.dataTransfer.getData(MIME_APPOINTMENT_ID);
    const fromColumn = e.dataTransfer.getData(MIME_FLOW_COLUMN);
    if (!appointmentId || !onMoveCard) return;
    if (fromColumn === column.id) return;
    onMoveCard(appointmentId, column.id);
  };

  return (
    <div
      className={`pf-flow-column pf-flow-column--${column.tone}`}
      data-column-id={column.id}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="pf-flow-column-header">
        <span className="pf-flow-column-emoji" aria-hidden="true">{column.emoji}</span>
        <span className="pf-flow-column-label">{column.label}</span>
        <span className="pf-flow-column-count">{cards.length}</span>
      </div>
      <div className="pf-flow-column-cards">
        {cards.length === 0 ? (
          <div className="pf-flow-column-empty">
            <p>Arraste um paciente para cá</p>
          </div>
        ) : (
          cards.map((card) => (
            <PatientFlowCard
              key={card.appointmentId}
              card={card}
              columnId={column.id}
              onOpenPatient={onOpenPatient}
            />
          ))
        )}
      </div>
    </div>
  );
}
