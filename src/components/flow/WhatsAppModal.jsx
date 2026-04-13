import { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { loadDb } from '../../db/index.js';
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from '../ui/Modal.jsx';

export default function WhatsAppModal({ open, onClose, appointment, onSend }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      const db = loadDb();
      const whatsappTemplates = (db.messageTemplates || []).filter(
        (t) => t.channel === 'whatsapp' || !t.channel
      );
      setTemplates(whatsappTemplates);
    } catch {
      setTemplates([]);
    }
    setSelectedTemplate('');
    setCustomMessage('');
    setLoading(false);
  }, [open]);

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
      alert(error.message || 'Erro ao enviar mensagem');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Enviar Lembrete WhatsApp</ModalTitle>
        </ModalHeader>

        <ModalBody>
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

          {appointment?.patient && (
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
        </ModalBody>

        <ModalFooter>
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
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
