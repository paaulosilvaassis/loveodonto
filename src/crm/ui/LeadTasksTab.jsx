import { useState, useCallback, useEffect } from 'react';
import {
  ClipboardList,
  Check,
  Pencil,
  Trash2,
  MessageCircle,
  Calendar,
  ChevronDown,
  X,
} from 'lucide-react';
import {
  listTasks,
  groupTasksByStatus,
  createTask,
  updateTask,
  completeTask,
  cancelTask,
  deleteTask,
  TASK_TYPE,
  TASK_TYPE_LABELS,
  TASK_CHANNEL,
  TASK_CHANNEL_LABELS,
  TASK_PRIORITY,
  TASK_PRIORITY_LABELS,
  TASK_STATUS,
} from '../../services/crmTaskService.js';
import { buildWhatsAppLink } from '../../services/crmService.js';
import { listUsers } from '../../services/teamService.js';
import { getProfessionalOptions } from '../../services/collaboratorService.js';

const TYPE_TITLE_PRESETS = {
  [TASK_TYPE.FOLLOWUP_BUDGET]: 'Retornar orçamento',
  [TASK_TYPE.FOLLOWUP_LEAD]: 'Retornar contato do lead',
  [TASK_TYPE.POST_CONSULT]: 'Retorno clínico',
  [TASK_TYPE.INACTIVE_PATIENT]: 'Retornar paciente inativo',
  [TASK_TYPE.CUSTOM]: '',
};

function formatDueDisplay(dueAt, status) {
  if (status === TASK_STATUS.DONE || status === TASK_STATUS.CANCELED) return null;
  const d = new Date(dueAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.floor((due - today) / (24 * 60 * 60 * 1000));
  const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return `Atrasada • ${abs} dia${abs > 1 ? 's' : ''} • ${timeStr}`;
  }
  if (diffDays === 0) return `Hoje • ${timeStr}`;
  if (diffDays === 1) return `Amanhã • ${timeStr}`;
  return `${d.toLocaleDateString('pt-BR')} • ${timeStr}`;
}

function getAssignableUsers() {
  const users = listUsers().filter((u) => u.active !== false);
  const pros = getProfessionalOptions();
  const seen = new Set();
  const result = [];
  users.forEach((u) => {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      result.push({ id: u.id, name: u.name || 'Usuário' });
    }
  });
  pros.forEach((p) => {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      result.push({ id: p.id, name: p.name || 'Profissional' });
    }
  });
  return result;
}

function TaskCard({ task, lead, onComplete, onEdit, onDelete, onWhatsApp, onSchedule, assignableUsers }) {
  const dueDisplay = formatDueDisplay(task.dueAt, task.status);
  const isPending = task.status === TASK_STATUS.PENDING;
  const isOverdue = isPending && new Date(task.dueAt) < new Date();
  const showAgendar = isPending && (task.type === TASK_TYPE.POST_CONSULT || task.type === TASK_TYPE.CUSTOM);
  const assignee = assignableUsers.find((u) => u.id === task.assignedTo);
  const phone = lead?.phone ? String(lead.phone).replace(/\D/g, '') : '';
  const whatsAppUrl = phone ? buildWhatsAppLink(phone) : '';

  return (
    <div
      className={`crm-task-card ${isOverdue ? 'crm-task-card-overdue' : ''} ${task.status === TASK_STATUS.DONE ? 'crm-task-card-done' : ''}`}
    >
      <div className="crm-task-card-head">
        <span className="crm-task-card-type">{TASK_TYPE_LABELS[task.type] || task.type}</span>
        {dueDisplay && (
          <span className={`crm-task-card-due ${isOverdue ? 'crm-task-card-due-overdue' : ''}`}>
            {dueDisplay}
          </span>
        )}
      </div>
      <h4 className="crm-task-card-title">{task.title}</h4>
      {task.description && <p className="crm-task-card-desc">{task.description}</p>}
      <div className="crm-task-card-meta">
        {assignee && <span className="crm-task-card-assignee">Responsável: {assignee.name}</span>}
        {task.channel && (
          <span className="crm-task-card-channel">
            {TASK_CHANNEL_LABELS[task.channel] || task.channel}
          </span>
        )}
      </div>
      <div className="crm-task-card-actions">
        {isPending && (
          <>
            <button type="button" className="button secondary small" onClick={() => onComplete(task)} title="Concluir">
              <Check size={14} /> Concluir
            </button>
            <button type="button" className="button secondary small" onClick={() => onEdit(task)} title="Editar">
              <Pencil size={14} /> Editar
            </button>
            {showAgendar && (
              <button type="button" className="button secondary small" onClick={() => onSchedule(task)} title="Agendar">
                <Calendar size={14} /> Agendar
              </button>
            )}
            {whatsAppUrl && task.channel === TASK_CHANNEL.WHATSAPP && (
              <a href={whatsAppUrl} target="_blank" rel="noopener noreferrer" className="button secondary small">
                <MessageCircle size={14} /> WhatsApp
              </a>
            )}
          </>
        )}
        <button type="button" className="button secondary small" onClick={() => onDelete(task)} title="Excluir">
          <Trash2 size={14} /> Excluir
        </button>
      </div>
    </div>
  );
}

function CreateTaskModal({ open, onClose, lead, user, onSuccess, editTask }) {
  const [type, setType] = useState(TASK_TYPE.FOLLOWUP_LEAD);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [dueTime, setDueTime] = useState('09:00');
  const [priority, setPriority] = useState(TASK_PRIORITY.MEDIUM);
  const [channel, setChannel] = useState(TASK_CHANNEL.WHATSAPP);
  const [assignedTo, setAssignedTo] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const assignableUsers = getAssignableUsers();

  const isEdit = Boolean(editTask);

  const resetForm = useCallback(() => {
    setType(TASK_TYPE.FOLLOWUP_LEAD);
    setTitle('');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDueAt(tomorrow.toISOString().slice(0, 10));
    setDueTime('09:00');
    setPriority(TASK_PRIORITY.MEDIUM);
    setChannel(TASK_CHANNEL.WHATSAPP);
    setAssignedTo(user?.id || '');
    setDescription('');
    setError('');
  }, [user?.id]);

  const handleTypeChange = (v) => {
    setType(v);
    if (!isEdit && TYPE_TITLE_PRESETS[v]) {
      setTitle(TYPE_TITLE_PRESETS[v]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const t = (title || '').trim();
    if (!t) {
      setError('Título é obrigatório.');
      return;
    }
    const datePart = dueAt || new Date().toISOString().slice(0, 10);
    const timePart = dueTime || '09:00';
    const dueAtIso = `${datePart}T${timePart}:00.000`;
    const dueDate = new Date(dueAtIso);
    if (Number.isNaN(dueDate.getTime())) {
      setError('Data/hora de vencimento inválida.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        updateTask(user, editTask.id, {
          type,
          title: t,
          dueAt: dueDate.toISOString(),
          priority,
          channel,
          assignedTo: assignedTo || null,
          description: (description || '').trim() || null,
        });
      } else {
        createTask(user, {
          leadId: lead?.id || null,
          patientId: lead?.patientId || null,
          title: t,
          dueAt: dueDate.toISOString(),
          type,
          channel,
          priority,
          assignedTo: assignedTo || null,
          description: (description || '').trim() || null,
        });
      }
      onSuccess?.();
      onClose();
      resetForm();
    } catch (err) {
      setError(err?.message || 'Erro ao salvar tarefa.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (isEdit && editTask) {
      setTitle(editTask.title || '');
      setType(editTask.type || TASK_TYPE.CUSTOM);
      setPriority(editTask.priority || TASK_PRIORITY.MEDIUM);
      setChannel(editTask.channel || TASK_CHANNEL.WHATSAPP);
      setAssignedTo(editTask.assignedTo || '');
      setDescription(editTask.description || '');
      const d = new Date(editTask.dueAt);
      setDueAt(d.toISOString().slice(0, 10));
      setDueTime(d.toTimeString().slice(0, 5));
    } else {
      setType(TASK_TYPE.FOLLOWUP_LEAD);
      setTitle('');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDueAt(tomorrow.toISOString().slice(0, 10));
      setDueTime('09:00');
      setPriority(TASK_PRIORITY.MEDIUM);
      setChannel(TASK_CHANNEL.WHATSAPP);
      setAssignedTo(user?.id || '');
      setDescription('');
      setError('');
    }
  }, [open, isEdit, editTask?.id, user?.id]);

  if (!open) return null;

  return (
    <div
      className="appointment-step2-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-task-title"
      onClick={onClose}
    >
      <div className="appointment-step2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="appointment-step2-header">
          <strong id="create-task-title">{isEdit ? 'Editar tarefa' : 'Nova tarefa'}</strong>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="appointment-step2-modal-form">
          <div className="appointment-step2-body">
          <div className="form-field" style={{ marginBottom: '1rem' }}>
            <label htmlFor="task-type">Tipo *</label>
            <select
              id="task-type"
              value={type}
              onChange={(e) => handleTypeChange(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
            >
              {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field" style={{ marginBottom: '1rem' }}>
            <label htmlFor="task-title">Título *</label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Retornar orçamento de implante"
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-field">
              <label htmlFor="task-due">Vencimento *</label>
              <input
                id="task-due"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                min={isEdit ? undefined : new Date().toISOString().slice(0, 10)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
              />
            </div>
            <div className="form-field">
              <label htmlFor="task-time">Horário</label>
              <input
                id="task-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-field">
              <label htmlFor="task-priority">Prioridade</label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
              >
                {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="task-channel">Canal</label>
              <select
                id="task-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
              >
                <option value="">—</option>
                {Object.entries(TASK_CHANNEL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field" style={{ marginBottom: '1rem' }}>
            <label htmlFor="task-assignee">Responsável</label>
            <select
              id="task-assignee"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
            >
              <option value="">—</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field" style={{ marginBottom: '1rem' }}>
            <label htmlFor="task-desc">Observações</label>
            <textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Observações adicionais"
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', resize: 'vertical' }}
            />
          </div>

          {error && (
            <p role="alert" style={{ marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>
              {error}
            </p>
          )}
          </div>
          <div className="appointment-step2-footer">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar tarefa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function LeadTasksTab({ leadId, lead, user, onRefresh, onOpenSchedule }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);

  const tasks = listTasks({ leadId });
  const { atrasadas, hoje, proximas, concluidas } = groupTasksByStatus(tasks);
  const assignableUsers = getAssignableUsers();

  const handleComplete = (task) => {
    try {
      completeTask(user, task.id);
      onRefresh?.();
    } catch (e) {
      if (typeof document !== 'undefined') {
        const toast = document.createElement('div');
        toast.setAttribute('role', 'alert');
        toast.className = 'toast error';
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2000;padding:12px 16px;border-radius:8px;background:#ef4444;color:#fff;';
        toast.textContent = e?.message || 'Erro ao concluir tarefa.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      }
    }
  };

  const handleEdit = (task) => {
    setEditTask(task);
    setModalOpen(true);
  };

  const handleDelete = (task) => {
    if (!confirm('Excluir esta tarefa?')) return;
    try {
      deleteTask(user, task.id);
      onRefresh?.();
    } catch (e) {
      if (typeof document !== 'undefined') {
        const toast = document.createElement('div');
        toast.setAttribute('role', 'alert');
        toast.className = 'toast error';
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2000;padding:12px 16px;border-radius:8px;background:#ef4444;color:#fff;';
        toast.textContent = e?.message || 'Erro ao excluir tarefa.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      }
    }
  };

  const handleSchedule = (task) => {
    onOpenSchedule?.(task);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditTask(null);
    onRefresh?.();
  };

  const renderGroup = (title, items, tone) => (
    items.length > 0 && (
      <section key={title} className="crm-tasks-group">
        <h3 className={`crm-tasks-group-title crm-tasks-group-${tone}`}>
          {title} <span className="crm-tasks-group-count">({items.length})</span>
        </h3>
        <div className="crm-tasks-list">
          {items.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              lead={lead}
              onComplete={handleComplete}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onWhatsApp={() => {}}
              onSchedule={handleSchedule}
              assignableUsers={assignableUsers}
            />
          ))}
        </div>
      </section>
    )
  );

  return (
    <div className="crm-tasks-tab">
      <div className="crm-tasks-header">
        <button type="button" className="button primary" onClick={() => { setEditTask(null); setModalOpen(true); }}>
          <ClipboardList size={16} /> Nova tarefa
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="muted">Nenhuma tarefa. Clique em &quot;Nova tarefa&quot; para criar.</p>
      ) : (
        <div className="crm-tasks-groups">
          {renderGroup('Atrasadas', atrasadas, 'overdue')}
          {renderGroup('Hoje', hoje, 'today')}
          {renderGroup('Próximas', proximas, 'upcoming')}
          {renderGroup('Concluídas', concluidas, 'done')}
        </div>
      )}

      <CreateTaskModal
        open={modalOpen}
        onClose={handleModalClose}
        lead={lead}
        user={user}
        onSuccess={() => onRefresh?.()}
        editTask={editTask}
      />
    </div>
  );
}
