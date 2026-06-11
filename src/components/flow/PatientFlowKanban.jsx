import PatientFlowKanbanColumn from './PatientFlowKanbanColumn.jsx';

/**
 * Kanban operacional — jornada visual do paciente.
 */
export default function PatientFlowKanban({ kanban, onMoveCard, onOpenPatient }) {
  if (!kanban?.meta) return null;

  return (
    <div className="pf-flow-kanban-scroll">
      <div className="pf-flow-kanban">
        {kanban.meta.map((column) => (
          <PatientFlowKanbanColumn
            key={column.id}
            column={column}
            cards={kanban.columns[column.id] || []}
            onMoveCard={onMoveCard}
            onOpenPatient={onOpenPatient}
          />
        ))}
      </div>
    </div>
  );
}
