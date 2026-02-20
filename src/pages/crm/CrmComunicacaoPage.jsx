import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CrmLayout } from '../../crm/ui/CrmLayout.jsx';
import {
  listLeads,
  listMessageLogs,
  buildWhatsAppLink,
  logMessage,
  LEAD_SOURCE_LABELS,
} from '../../services/crmService.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { MessageCircle, Send, Search, ExternalLink } from 'lucide-react';

/** Templates com texto padrão para preencher a mensagem. */
const WHATSAPP_TEMPLATES = [
  { id: 'primeiro-contato', label: 'Primeiro contato', text: 'Olá! Somos a clínica e gostaríamos de saber como podemos ajudar. Você demonstrou interesse em nossos serviços.' },
  { id: 'confirmacao-avaliacao', label: 'Confirmação de avaliação', text: 'Olá! Confirmando sua avaliação agendada. Por favor, confirme se poderá comparecer.' },
  { id: 'lembrete', label: 'Lembrete', text: 'Olá! Lembrete: você tem um compromisso em breve conosco. Qualquer dúvida, estamos à disposição.' },
  { id: 'pos-avaliacao', label: 'Pós-avaliação', text: 'Olá! Esperamos que tenha tido uma ótima experiência na avaliação. Em breve enviaremos o orçamento combinado.' },
  { id: 'followup-orcamento', label: 'Follow-up de orçamento', text: 'Olá! Passando para saber se teve oportunidade de analisar o orçamento que enviamos. Podemos tirar dúvidas.' },
  { id: 'reativacao', label: 'Reativação de paciente', text: 'Olá! Sentimos sua falta. Gostaríamos de saber se há algo em que possamos ajudar. Estamos à disposição!' },
  { id: 'pos-tratamento', label: 'Pós-tratamento', text: 'Olá! Obrigado por confiar em nós. Como está se sentindo após o tratamento? Qualquer necessidade, estamos aqui.' },
];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CrmComunicacaoPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [logsVersion, setLogsVersion] = useState(0);

  const allLeads = useMemo(() => listLeads(), []);
  const filteredLeads = useMemo(() => {
    if (!search.trim()) return allLeads;
    const q = search.trim().toLowerCase();
    return allLeads.filter(
      (l) =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.interest || '').toLowerCase().includes(q)
    );
  }, [allLeads, search]);

  const selectedLead = useMemo(
    () => (selectedLeadId ? allLeads.find((l) => l.id === selectedLeadId) : null),
    [allLeads, selectedLeadId]
  );
  const messageLogs = useMemo(
    () => (selectedLeadId ? listMessageLogs(selectedLeadId) : []),
    [selectedLeadId, logsVersion]
  );

  const handleTemplateChange = (templateId) => {
    setSelectedTemplateId(templateId || '');
    const t = WHATSAPP_TEMPLATES.find((x) => x.id === templateId);
    setMessageText(t ? t.text : '');
  };

  const handleOpenWhatsAppAndLog = () => {
    if (!selectedLead) return;
    if (!selectedLead.phone || !selectedLead.phone.replace(/\D/g, '').length) {
      alert('Este lead não possui telefone cadastrado.');
      return;
    }
    const preview = (messageText || '').trim().slice(0, 500);
    try {
      logMessage(user, selectedLead.id, {
        channel: 'whatsapp',
        templateId: selectedTemplateId || null,
        messagePreview: preview || '(link aberto sem texto)',
      });
      setLogsVersion((v) => v + 1);
    } catch (e) {
      console.error('Erro ao registrar mensagem:', e);
    }
    const link = buildWhatsAppLink(selectedLead.phone, messageText || '');
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <CrmLayout
      title="Comunicação (WhatsApp)"
      description="Selecione um lead, escreva ou escolha um template e abra a conversa no WhatsApp. O envio é registrado no histórico do lead."
    >
      <div className="crm-comunicacao-grid">
        <aside className="crm-comunicacao-leads">
          <div className="crm-leads-search" style={{ marginBottom: '0.75rem' }}>
            <Search size={18} />
            <input
              type="text"
              placeholder="Buscar lead..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ul className="crm-comunicacao-lead-list">
            {filteredLeads.length === 0 ? (
              <li className="muted">Nenhum lead encontrado.</li>
            ) : (
              filteredLeads.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    className={`crm-comunicacao-lead-item ${selectedLeadId === lead.id ? 'active' : ''}`}
                    onClick={() => setSelectedLeadId(lead.id)}
                  >
                    <span className="crm-comunicacao-lead-name">{lead.name || 'Sem nome'}</span>
                    <span className="crm-comunicacao-lead-meta">
                      {lead.phone || '—'} · {LEAD_SOURCE_LABELS[lead.source] || lead.source}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <main className="crm-comunicacao-main">
          {!selectedLead ? (
            <div className="crm-comunicacao-empty">
              <MessageCircle size={48} className="muted" aria-hidden />
              <p className="muted">Selecione um lead na lista para escrever e abrir a conversa no WhatsApp.</p>
            </div>
          ) : (
            <>
              <div className="crm-comunicacao-header">
                <div>
                  <h3 className="crm-comunicacao-lead-title">{selectedLead.name || 'Sem nome'}</h3>
                  <p className="muted">
                    {selectedLead.phone || 'Sem telefone'} · {LEAD_SOURCE_LABELS[selectedLead.source] || selectedLead.source}
                    {selectedLead.interest ? ` · ${selectedLead.interest}` : ''}
                  </p>
                </div>
                <Link to={`/crm/leads/${selectedLead.id}`} className="button secondary">
                  Ver perfil <ExternalLink size={14} />
                </Link>
              </div>

              <div className="crm-comunicacao-compose card">
                <label className="form-label">Template (opcional)</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="form-select"
                  aria-label="Template de mensagem"
                >
                  <option value="">Nenhum — mensagem livre</option>
                  {WHATSAPP_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <label className="form-label">Mensagem</label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={5}
                  placeholder="Digite a mensagem ou selecione um template..."
                  className="form-input"
                />
                <div className="crm-comunicacao-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={handleOpenWhatsAppAndLog}
                    disabled={!selectedLead.phone?.replace(/\D/g, '').length}
                  >
                    <Send size={16} /> Abrir no WhatsApp e registrar
                  </button>
                  {!selectedLead.phone?.replace(/\D/g, '').length && (
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Cadastre um telefone no perfil do lead.</span>
                  )}
                </div>
              </div>

              <div className="crm-comunicacao-history card">
                <h4>Histórico de mensagens</h4>
                {messageLogs.length === 0 ? (
                  <p className="muted">Nenhuma mensagem registrada ainda.</p>
                ) : (
                  <ul className="crm-comunicacao-log-list">
                    {messageLogs.map((log) => (
                      <li key={log.id} className="crm-comunicacao-log-item">
                        <span className="crm-comunicacao-log-date">{formatDate(log.createdAt)}</span>
                        <span className="crm-comunicacao-log-preview">
                          {log.templateId ? `[${log.templateId}] ` : ''}
                          {log.messagePreview || '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </CrmLayout>
  );
}
