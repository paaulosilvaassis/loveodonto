import { useState, useRef, useEffect } from 'react';
import { 
  Clock, 
  User, 
  Phone, 
  CheckCircle2, 
  Send, 
  MessageSquare, 
  FileText, 
  X,
  Calendar,
  ArrowRight,
  MoreVertical,
  PlayCircle
} from 'lucide-react';
import StatusBadge from './StatusBadge.jsx';
import { APPOINTMENT_STATUS } from '../../services/appointmentService.js';

// Função auxiliar para formatar telefone
const formatPhoneDisplay = (phone) => {
  if (!phone) return '';
  const ddd = phone.ddd || '';
  const number = phone.number || '';
  return ddd && number ? `(${ddd}) ${number}` : number || ddd || '';
};

export default function FlowPatientCard({ 
  appointment, 
  onCheckIn, 
  onSendToJourney, 
  onWhatsAppReminder,
  onConfirm,
  onOpenChart,
  onCancel,
  onOpenWhatsApp,
  onFinish,
  user
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { patient, professional, phone } = appointment;

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropdownOpen]);

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    return timeStr.slice(0, 5);
  };

  const formatPatientName = () => {
    if (!patient) return 'Paciente não encontrado';
    return patient.full_name || patient.nickname || patient.social_name || 'Paciente';
  };

  const getProcedureTags = () => {
    const tags = [];
    const typeCategory = appointment.typeCategory || 'Consulta';
    const specialty = appointment.specialty || professional?.specialty || 'Geral';
    
    tags.push(typeCategory);
    tags.push(specialty);
    
    return tags;
  };

  // Determinar CTA principal baseado no status (conforme especificação)
  const getPrimaryAction = () => {
    const status = appointment.status;
    
    // AGENDADO/EM_CONFIRMACAO -> "Confirmar"
    if (status === APPOINTMENT_STATUS.AGENDADO || status === APPOINTMENT_STATUS.EM_CONFIRMACAO) {
      return {
        label: 'Confirmar',
        icon: CheckCircle2,
        onClick: () => onConfirm(appointment.id),
      };
    }
    
    // CONFIRMADO -> "Chegou"
    if (status === APPOINTMENT_STATUS.CONFIRMADO) {
      return {
        label: 'Chegou',
        icon: CheckCircle2,
        onClick: () => onCheckIn(appointment.id),
      };
    }
    
    // CHEGOU -> "Iniciar atendimento" (Enviar para Jornada)
    if (status === APPOINTMENT_STATUS.CHEGOU && appointment.checkInAt) {
      return {
        label: 'Iniciar atendimento',
        icon: PlayCircle,
        onClick: () => onSendToJourney(appointment.id),
      };
    }
    
    // EM_ATENDIMENTO -> "Finalizar"
    if (status === APPOINTMENT_STATUS.EM_ATENDIMENTO) {
      return {
        label: 'Finalizar',
        icon: CheckCircle2,
        onClick: () => {
          if (onFinish) {
            onFinish(appointment.id);
          }
        },
      };
    }
    
    // FINALIZADO -> sem CTA (ou oculto)
    if (status === APPOINTMENT_STATUS.FINALIZADO || status === APPOINTMENT_STATUS.ATENDIDO) {
      return null;
    }
    
    return null;
  };

  const primaryAction = getPrimaryAction();
  const canConfirm = appointment.status === APPOINTMENT_STATUS.AGENDADO || appointment.status === APPOINTMENT_STATUS.EM_CONFIRMACAO;

  return (
    <div className="appointment-card-premium">
      <div className="appointment-card-content">
        {/* Header: Hora + Profissional à esquerda, Status à direita */}
        <div className="appointment-card-header">
          <div className="appointment-card-header-left">
            <div className="appointment-card-time">
              <Clock size={14} />
              <span className="appointment-card-time-text">{formatTime(appointment.startTime)}</span>
            </div>
            {professional && (
              <div className="appointment-card-professional">
                <User size={12} />
                <span>{professional.nomeCompleto || professional.name}</span>
              </div>
            )}
          </div>
          <StatusBadge status={appointment.status} size="sm" />
        </div>

        {/* Body: Nome + Telefone + Chips */}
        <div className="appointment-card-body">
          <h3 className="appointment-card-name">{formatPatientName()}</h3>
          
          {phone && (
            <div className="appointment-card-phone">
              <Phone size={12} />
              <span>{formatPhoneDisplay(phone)}</span>
            </div>
          )}

          {/* Chips de procedimento */}
          <div className="appointment-card-chips">
            {getProcedureTags().map((tag, idx) => (
              <span key={idx} className="appointment-card-chip">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Footer: Ações */}
        <div className="appointment-card-footer">
          {/* CTA Principal */}
          {primaryAction && (() => {
            const IconComponent = primaryAction.icon;
            return (
              <button
                type="button"
                className="appointment-card-cta-primary"
                onClick={primaryAction.onClick}
              >
                <IconComponent size={14} />
                <span>{primaryAction.label}</span>
              </button>
            );
          })()}

          {/* Ações rápidas: WhatsApp e Prontuário */}
          <div className="appointment-card-quick-actions">
            <button
              type="button"
              className="appointment-card-action-icon"
              onClick={() => onOpenWhatsApp(patient?.id)}
              title="Abrir WhatsApp"
            >
              <MessageSquare size={16} />
            </button>
            <button
              type="button"
              className="appointment-card-action-icon"
              onClick={() => onOpenChart(patient?.id)}
              title="Abrir Prontuário"
            >
              <FileText size={16} />
            </button>
          </div>

          {/* Menu Dropdown */}
          <div className="appointment-card-dropdown-wrapper" ref={dropdownRef}>
            <button
              type="button"
              className="appointment-card-action-icon appointment-card-dropdown-trigger"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              title="Mais opções"
            >
              <MoreVertical size={16} />
            </button>

            {dropdownOpen && (
              <div className="appointment-card-dropdown-menu">
                {canConfirm && (
                  <button
                    type="button"
                    className="appointment-card-dropdown-item"
                    onClick={() => {
                      onConfirm(appointment.id);
                      setDropdownOpen(false);
                    }}
                  >
                    <CheckCircle2 size={14} />
                    <span>Confirmar agendamento</span>
                  </button>
                )}
                <button
                  type="button"
                  className="appointment-card-dropdown-item"
                  onClick={() => {
                    onWhatsAppReminder(appointment);
                    setDropdownOpen(false);
                  }}
                >
                  <Send size={14} />
                  <span>Enviar lembrete WhatsApp</span>
                </button>
                <button
                  type="button"
                  className="appointment-card-dropdown-item"
                  onClick={() => {
                    onCancel(appointment);
                    setDropdownOpen(false);
                  }}
                >
                  <X size={14} />
                  <span>Desmarcar</span>
                </button>
                <button
                  type="button"
                  className="appointment-card-dropdown-item"
                  onClick={() => {
                    window.location.href = `/gestao/agenda?patientId=${appointment.patientId}&reschedule=true`;
                    setDropdownOpen(false);
                  }}
                >
                  <Calendar size={14} />
                  <span>Reagendar</span>
                </button>
                <button
                  type="button"
                  className="appointment-card-dropdown-item"
                  onClick={() => {
                    onOpenChart(patient?.id);
                    setDropdownOpen(false);
                  }}
                >
                  <FileText size={14} />
                  <span>Abrir prontuário</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
