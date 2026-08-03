import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalTitle,
  ModalDescription,
} from '../../components/ui/Modal.jsx';
import Button from '../../components/Button.jsx';
import { Tabs } from '../../components/Tabs.jsx';
import { LeadTimeline } from './LeadTimeline.jsx';
import {
  LEAD_SOURCE_LABELS,
  LEAD_INTEREST_LABELS,
  getLeadById,
  updateLead,
  listLeadEvents,
  createFollowUp,
  listFollowUps,
} from '../../services/crmService.js';
import { formatPhone, onlyDigits } from '../../utils/validators.js';
import { formatCurrencyBRL, parseCurrencyBRL } from '../../utils/currency.js';

const TABS = [
  { value: 'dados', label: 'Dados do lead' },
  { value: 'historico', label: 'Histórico' },
  { value: 'acoes', label: 'Próximas ações' },
  { value: 'conversao', label: 'Conversão' },
];

const FOLLOW_UP_TYPES = ['retorno', 'ligação', 'whatsapp', 'avaliação'];
const PRIORITY_OPTIONS = [
  { value: '', label: 'Sem prioridade' },
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
];

function DadosTab({ lead, user, users, onSaved, onError }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name: lead.name || '',
      phone: lead.phone ? formatPhone(lead.phone) : '',
      source: lead.source || '',
      interest: lead.interest || '',
      assignedToUserId: lead.assignedToUserId || '',
      estimatedValue: Number(lead.estimatedValue) > 0 ? formatCurrencyBRL(lead.estimatedValue) : '',
      notes: lead.notes || '',
    });
  }, [lead]);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = () => {
    setSaving(true);
    try {
      updateLead(user, lead.id, {
        name: form.name.trim(),
        phone: onlyDigits(form.phone),
        source: form.source,
        interest: form.interest,
        assignedToUserId: form.assignedToUserId || null,
        estimatedValue: form.estimatedValue ? parseCurrencyBRL(form.estimatedValue) : null,
        notes: form.notes,
      });
      onSaved('Dados do lead atualizados.');
    } catch (err) {
      onError(err?.message || 'Erro ao salvar o lead.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crm-lead-details-form">
      <div className="crm-captacao-form-row">
        <div className="form-field">
          <label htmlFor="ld-name">Nome</label>
          <input id="ld-name" type="text" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="ld-phone">Telefone</label>
          <input
            id="ld-phone"
            type="tel"
            value={form.phone || ''}
            onChange={(e) => set('phone', formatPhone(e.target.value))}
          />
        </div>
      </div>
      <div className="crm-captacao-form-row">
        <div className="form-field">
          <label htmlFor="ld-source">Origem</label>
          <select id="ld-source" value={form.source || ''} onChange={(e) => set('source', e.target.value)}>
            {Object.entries(LEAD_SOURCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="ld-interest">Interesse</label>
          <select id="ld-interest" value={form.interest || ''} onChange={(e) => set('interest', e.target.value)}>
            <option value="">Selecione</option>
            {Object.entries(LEAD_INTEREST_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="crm-captacao-form-row">
        <div className="form-field">
          <label htmlFor="ld-responsible">Responsável</label>
          <select
            id="ld-responsible"
            value={form.assignedToUserId || ''}
            onChange={(e) => set('assignedToUserId', e.target.value)}
          >
            <option value="">Sem responsável</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.id}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="ld-value">Valor estimado</label>
          <input
            id="ld-value"
            type="text"
            inputMode="numeric"
            value={form.estimatedValue || ''}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '');
              set('estimatedValue', digits ? formatCurrencyBRL(parseInt(digits, 10) / 100) : '');
            }}
            placeholder="R$ 0,00"
          />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="ld-notes">Observações</label>
        <textarea id="ld-notes" rows={3} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
      </div>
      <div className="crm-lead-details-actions-row">
        <Button type="button" variant="primary" loading={saving} onClick={handleSave}>
          Salvar dados
        </Button>
      </div>
    </div>
  );
}

function AcoesTab({ lead, user, onSaved, onError, onSchedule }) {
  const [dueAt, setDueAt] = useState('');
  const [type, setType] = useState('retorno');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState(lead.priority || '');

  const pending = useMemo(
    () => listFollowUps({ leadId: lead.id, pending: true }),
    [lead.id, lead.updatedAt]
  );

  const handleCreateFollowUp = () => {
    if (!dueAt) {
      onError('Informe a data do follow-up.');
      return;
    }
    try {
      createFollowUp(user, lead.id, { dueAt, type, notes });
      setDueAt('');
      setNotes('');
      onSaved('Follow-up criado.');
    } catch (err) {
      onError(err?.message || 'Erro ao criar follow-up.');
    }
  };

  const handlePriorityChange = (value) => {
    setPriority(value);
    try {
      updateLead(user, lead.id, { priority: value });
      onSaved('Prioridade atualizada.');
    } catch (err) {
      onError(err?.message || 'Erro ao atualizar prioridade.');
    }
  };

  return (
    <div className="crm-lead-details-form">
      {pending.length > 0 && (
        <div className="crm-lead-details-followups">
          <h4>Follow-ups pendentes</h4>
          <ul>
            {pending.map((f) => (
              <li key={f.id}>
                <strong>{f.type || 'retorno'}</strong>
                {' — '}
                {f.dueAt ? new Date(f.dueAt).toLocaleDateString('pt-BR') : 'sem data'}
                {f.notes ? ` · ${f.notes}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="crm-captacao-form-row">
        <div className="form-field">
          <label htmlFor="ld-fu-date">Data do follow-up</label>
          <input id="ld-fu-date" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="ld-fu-type">Tipo</label>
          <select id="ld-fu-type" value={type} onChange={(e) => setType(e.target.value)}>
            {FOLLOW_UP_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="ld-fu-notes">Anotações</label>
        <textarea id="ld-fu-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="crm-lead-details-actions-row">
        <Button type="button" variant="secondary" onClick={handleCreateFollowUp}>
          Criar follow-up
        </Button>
        <Button type="button" variant="ghost" onClick={() => onSchedule?.(lead)}>
          Agendar avaliação
        </Button>
      </div>
      <div className="form-field">
        <label htmlFor="ld-priority">Prioridade do lead</label>
        <select id="ld-priority" value={priority} onChange={(e) => handlePriorityChange(e.target.value)}>
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ConversaoTab({ lead, onConvert, onMarkLost }) {
  if (lead.patientId) {
    return (
      <div className="crm-lead-details-conversion">
        <p className="crm-lead-details-converted">
          Este lead já foi convertido em paciente.
        </p>
        <Link to={`/crm/leads/${lead.id}`} className="crm-lead-details-profile-link">
          Ver perfil completo do lead <ExternalLink size={14} />
        </Link>
      </div>
    );
  }
  return (
    <div className="crm-lead-details-conversion">
      <p>
        Converter cria o cadastro do paciente e vincula ao lead. Se o CPF já existir,
        você poderá vincular o lead ao paciente existente. A conversão é sempre manual.
      </p>
      <div className="crm-lead-details-actions-row">
        <Button type="button" variant="primary" onClick={() => onConvert?.(lead)}>
          Converter em paciente
        </Button>
        <Button type="button" variant="danger" onClick={() => onMarkLost?.(lead)}>
          Marcar como perdido
        </Button>
      </div>
    </div>
  );
}

/**
 * Modal de detalhes do lead com abas: Dados, Histórico, Próximas ações e Conversão.
 */
export function LeadDetailsModal({
  open,
  onClose,
  leadId,
  user,
  users = [],
  onChanged,
  onConvert,
  onMarkLost,
  onSchedule,
}) {
  const [tab, setTab] = useState('dados');
  const [version, setVersion] = useState(0);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (open) {
      setTab('dados');
      setFeedback(null);
      setVersion((v) => v + 1);
    }
  }, [open, leadId]);

  const lead = useMemo(
    () => (open && leadId ? getLeadById(leadId) : null),
    [open, leadId, version]
  );
  const events = useMemo(
    () => (open && leadId ? listLeadEvents(leadId) : []),
    [open, leadId, version]
  );

  const handleSaved = (message) => {
    setFeedback({ type: 'success', message });
    setVersion((v) => v + 1);
    onChanged?.();
  };
  const handleError = (message) => setFeedback({ type: 'error', message });

  if (!lead) return null;

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="lg" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>{lead.name || 'Lead'}</ModalTitle>
          <ModalDescription>
            {formatPhone(lead.phone || '') || 'Sem telefone'} · {LEAD_SOURCE_LABELS[lead.source] || lead.source || 'Origem não informada'}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          {feedback && (
            <div
              className={`crm-lead-details-feedback crm-lead-details-feedback--${feedback.type}`}
              role={feedback.type === 'error' ? 'alert' : 'status'}
            >
              {feedback.message}
            </div>
          )}
          <div className="crm-lead-details-tab-content">
            {tab === 'dados' && (
              <DadosTab lead={lead} user={user} users={users} onSaved={handleSaved} onError={handleError} />
            )}
            {tab === 'historico' && (
              <LeadTimeline
                events={events}
                lead={lead}
                phoneForEvent={(ev) => ev?.data?.phone || lead.phone || ''}
                onCreateFollowUp={() => setTab('acoes')}
                onOpenSchedule={() => onSchedule?.(lead)}
              />
            )}
            {tab === 'acoes' && (
              <AcoesTab lead={lead} user={user} onSaved={handleSaved} onError={handleError} onSchedule={onSchedule} />
            )}
            {tab === 'conversao' && (
              <ConversaoTab lead={lead} onConvert={onConvert} onMarkLost={onMarkLost} />
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </ModalRoot>
  );
}
