import FlowRowItem from './FlowRowItem.jsx';

export default function FlowPatientList({ 
  appointments, 
  onCheckIn,
  onSendToConsultingRoom,
  onReminder,
  onConfirm,
  onOpenChart,
  onCancel,
  onOpenWhatsApp,
  onFinish,
  onReschedule,
  onNoShow,
  onViewDetails,
  user
}) {
  if (appointments.length === 0) {
    return (
      <div className="flow-patient-list-empty">
        <p>Nenhum agendamento encontrado para esta data.</p>
      </div>
    );
  }

  return (
    <div className="flow-row-list">
      {appointments.map((appointment) => (
        <FlowRowItem
          key={appointment.id}
          appointment={appointment}
          onCheckIn={onCheckIn}
          onSendToConsultingRoom={onSendToConsultingRoom}
          onReminder={onReminder}
          onConfirm={onConfirm}
          onOpenChart={onOpenChart}
          onCancel={onCancel}
          onOpenWhatsApp={onOpenWhatsApp}
          onFinish={onFinish}
          onReschedule={onReschedule}
          onNoShow={onNoShow}
          onViewDetails={onViewDetails}
          user={user}
        />
      ))}
    </div>
  );
}
