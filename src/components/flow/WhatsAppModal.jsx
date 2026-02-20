import { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { listTemplates } from '../../services/communicationService.js';
import { loadDb } from '../../db/index.js';

export default function WhatsAppModal({ open, onClose, appointment, onSend, user }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open]);

  const loadTemplates = () => {
    try {
      const db = loadDb();
      const whatsappTemplates = (db.messageTemplates || []).filter(
        (t) => t.channel === 'whatsapp' || !t.channel
      );
      setTemplates(whatsappTemplates);
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
      setTemplates([]);
    }
  };

  const handleSend = async () => {
    if (!selectedTemplate && !customMessage.trim()) {
      alert('Selecione um template ou digite uma mensagem personalizada');
      return;
    }

    setLoading(true);
    try {
      const messageContent = selectedTemplate 
        ? templates.find((t) => t.id === selectedTemplate)?.content || customMessage
        : customMessage;

      await onSend({
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        templateId: selectedTemplate || null,
        messageContent,
      });

      onClose();
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      alert(error.message || 'Erro ao enviar mensagem');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Enviar Lembrete WhatsApp</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-field">
            <label>Template</label>
            <select
              value={selectedTemplate}
              onChange={(e) => {
                setSelectedTemplate(e.target.value);
                if (e.target.value) {
                  const template = templates.find((t) => t.id === e.target.value);
                  if (template) {
                    setCustomMessage(template.content);
                  }
                }
              }}
            >
              <option value="">Selecione um template...</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Mensagem Personalizada</label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={6}
              placeholder="Digite sua mensagem ou selecione um template acima..."
            />
          </div>

          {appointment.patient && (
            <div className="whatsapp-modal-preview">
              <strong>Para:</strong> {appointment.patient.full_name || appointment.patient.nickname}
              {appointment.phone && (
                <>
                  <br />
                  <strong>Telefone:</strong> {appointment.phone.ddd} {appointment.phone.number}
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleSend}
            disabled={loading || (!selectedTemplate && !customMessage.trim())}
          >
            <Send size={16} />
            {loading ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
