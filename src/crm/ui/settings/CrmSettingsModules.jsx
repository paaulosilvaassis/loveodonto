import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/Button.jsx';
import { CrmOrderedListEditor } from './CrmOrderedListEditor.jsx';
import { PipelineStagesEditor } from './PipelineStagesEditor.jsx';
import {
  listLeadSourcesForTenant,
  listLeadInterestsForTenant,
  listLossReasonsForTenant,
  listCommercialTeamForTenant,
  getCommercialGoalsSettings,
  getFollowUpSettings,
  getWhatsAppSettings,
  getConversionSettings,
  listAutomationsForTenant,
  saveLeadSourcesForTenant,
  saveLeadInterestsForTenant,
  saveLossReasonsForTenant,
  saveCommercialTeamForTenant,
  saveCommercialGoalsSettings,
  saveFollowUpSettings,
  saveWhatsAppSettings,
  saveConversionSettings,
  saveAutomationsForTenant,
} from '../../../services/crmSettingsService.js';
import {
  countLeadsByStageKey,
  ensurePipelineStagesForTenant,
  listPipelineStagesForTenant,
} from '../../../services/crmPipelineStageService.js';
import { listUsers } from '../../../services/teamService.js';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import { loadDb } from '../../../db/index.js';

function SettingsPanel({ title, description, children, onSave, saving, saveLabel = 'Salvar alterações' }) {
  return (
    <div className="crm-settings-panel">
      <header className="crm-settings-panel-header">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      {children}
      {onSave && (
        <footer className="crm-settings-panel-footer">
          <Button type="button" variant="primary" loading={saving} onClick={onSave}>{saveLabel}</Button>
        </footer>
      )}
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((type, message) => setToast({ type, message }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  return { toast, show };
}

export function PipelineSettingsModule({ user, tenantId, onSaved }) {
  const [version, setVersion] = useState(0);
  const stages = useMemo(() => {
    ensurePipelineStagesForTenant(user);
    return listPipelineStagesForTenant(tenantId, { includeInactive: true });
  }, [user, tenantId, version]);
  const leadCounts = useMemo(() => countLeadsByStageKey(tenantId), [tenantId, version]);

  return (
    <SettingsPanel
      title="Pipeline comercial"
      description="Configure as etapas do funil: ordem, cor, tipo (normal, conversão ou perda) e status."
    >
      <PipelineStagesEditor
        user={user}
        stages={stages}
        leadCounts={leadCounts}
        onSaved={() => { setVersion((v) => v + 1); onSaved?.(); }}
      />
    </SettingsPanel>
  );
}

export function SourcesSettingsModule({ user, tenantId, onSaved }) {
  const { toast, show } = useToast();
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(listLeadSourcesForTenant(tenantId).map((s) => ({ ...s })));
  }, [tenantId]);

  const handleSave = () => {
    setSaving(true);
    try {
      saveLeadSourcesForTenant(user, items);
      show('success', 'Origens salvas com sucesso.');
      onSaved?.();
    } catch (err) {
      show('error', err?.message || 'Erro ao salvar origens.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <SettingsPanel title="Origens dos leads" description="Canais de captação da clínica." onSave={handleSave} saving={saving}>
        <CrmOrderedListEditor items={items} onChange={setItems} placeholder="Ex.: Instagram" addLabel="Adicionar origem" />
      </SettingsPanel>
    </>
  );
}

export function InterestsSettingsModule({ user, tenantId, onSaved }) {
  const { toast, show } = useToast();
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItems(listLeadInterestsForTenant(tenantId).map((i) => ({ ...i })));
  }, [tenantId]);

  const handleSave = () => {
    setSaving(true);
    try {
      saveLeadInterestsForTenant(user, items);
      show('success', 'Tratamentos salvos com sucesso.');
      onSaved?.();
    } catch (err) {
      show('error', err?.message || 'Erro ao salvar tratamentos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <SettingsPanel title="Tratamentos / Interesses" description="Usados em formulários, filtros e relatórios." onSave={handleSave} saving={saving}>
        <CrmOrderedListEditor items={items} onChange={setItems} placeholder="Ex.: Implante Unitário" addLabel="Adicionar tratamento" />
      </SettingsPanel>
    </>
  );
}

export function TeamSettingsModule({ user, tenantId, onSaved }) {
  const { toast, show } = useToast();
  const [members, setMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const users = useMemo(() => listUsers().filter((u) => u.active !== false), []);

  useEffect(() => {
    const stored = listCommercialTeamForTenant(tenantId);
    setMembers(stored.length ? stored : []);
  }, [tenantId]);

  const updateMember = (index, patch) => {
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const addMember = () => {
    setMembers((prev) => [...prev, {
      name: '', role: '', jobFunction: 'consultor', monthlyGoal: 0, active: true, crmPermission: 'consultor',
    }]);
  };

  const removeMember = (index) => setMembers((prev) => prev.filter((_, i) => i !== index));

  const handleSave = () => {
    setSaving(true);
    try {
      saveCommercialTeamForTenant(user, members);
      show('success', 'Equipe comercial salva.');
      onSaved?.();
    } catch (err) {
      show('error', err?.message || 'Erro ao salvar equipe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <SettingsPanel title="Equipe comercial" description="Responsáveis pelo atendimento e metas individuais." onSave={handleSave} saving={saving}>
        {members.length === 0 && <p className="crm-dash-empty">Nenhum membro cadastrado. Adicione consultores e recepcionistas.</p>}
        <div className="crm-settings-team-list">
          {members.map((m, index) => (
            <div key={m.id || `new-${index}`} className="crm-settings-team-card">
              <div className="crm-settings-team-grid">
                <div className="form-field">
                  <label>Nome</label>
                  <input value={m.name} onChange={(e) => updateMember(index, { name: e.target.value })} placeholder="Nome completo" />
                </div>
                <div className="form-field">
                  <label>Vincular usuário</label>
                  <select value={m.userId || ''} onChange={(e) => updateMember(index, { userId: e.target.value || null })}>
                    <option value="">Nenhum</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Cargo</label>
                  <input value={m.role} onChange={(e) => updateMember(index, { role: e.target.value })} placeholder="Ex.: Consultor" />
                </div>
                <div className="form-field">
                  <label>Função CRM</label>
                  <select value={m.crmPermission} onChange={(e) => updateMember(index, { crmPermission: e.target.value })}>
                    <option value="consultor">Consultor</option>
                    <option value="recepcionista">Recepcionista</option>
                    <option value="gerente">Gerente</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Meta mensal (R$)</label>
                  <input type="number" min="0" step="500" value={m.monthlyGoal} onChange={(e) => updateMember(index, { monthlyGoal: Number(e.target.value) })} />
                </div>
                <label className="crm-settings-check">
                  <input type="checkbox" checked={m.active !== false} onChange={() => updateMember(index, { active: m.active === false })} />
                  Ativo
                </label>
              </div>
              <button type="button" className="crm-settings-list-delete" onClick={() => removeMember(index)}>Remover</button>
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={addMember}>Adicionar membro</Button>
      </SettingsPanel>
    </>
  );
}

export function GoalsSettingsModule({ user, tenantId, onSaved }) {
  const { toast, show } = useToast();
  const [form, setForm] = useState(getCommercialGoalsSettings(tenantId));
  const [saving, setSaving] = useState(false);
  const team = listCommercialTeamForTenant(tenantId);

  useEffect(() => {
    setForm(getCommercialGoalsSettings(tenantId));
  }, [tenantId]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = () => {
    setSaving(true);
    try {
      saveCommercialGoalsSettings(user, form);
      show('success', 'Metas comerciais salvas.');
      onSaved?.();
    } catch (err) {
      show('error', err?.message || 'Erro ao salvar metas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <SettingsPanel title="Metas comerciais" description="Objetivos mensais da clínica e por consultor." onSave={handleSave} saving={saving}>
        <div className="crm-settings-goals-grid">
          <div className="form-field"><label>Meta de leads</label><input type="number" min="0" value={form.leadsGoal} onChange={(e) => set('leadsGoal', Number(e.target.value))} /></div>
          <div className="form-field"><label>Meta de agendamentos</label><input type="number" min="0" value={form.appointmentsGoal} onChange={(e) => set('appointmentsGoal', Number(e.target.value))} /></div>
          <div className="form-field"><label>Meta de comparecimentos</label><input type="number" min="0" value={form.attendancesGoal} onChange={(e) => set('attendancesGoal', Number(e.target.value))} /></div>
          <div className="form-field"><label>Meta de fechamentos</label><input type="number" min="0" value={form.closingsGoal} onChange={(e) => set('closingsGoal', Number(e.target.value))} /></div>
          <div className="form-field"><label>Meta de conversão (%)</label><input type="number" min="0" max="100" value={form.conversionGoal} onChange={(e) => set('conversionGoal', Number(e.target.value))} /></div>
          <div className="form-field"><label>Meta financeira (R$)</label><input type="number" min="0" step="1000" value={form.revenueGoal} onChange={(e) => set('revenueGoal', Number(e.target.value))} /></div>
        </div>
        {team.length > 0 && (
          <div className="crm-settings-consultant-goals">
            <h3>Meta por consultor</h3>
            {team.filter((m) => m.active !== false).map((m) => {
              const cg = (form.consultantGoals || []).find((g) => g.ownerId === m.userId || g.memberId === m.id) || {};
              return (
                <div key={m.id} className="crm-settings-consultant-row">
                  <strong>{m.name}</strong>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="Meta R$"
                    value={cg.revenueGoal || ''}
                    onChange={(e) => {
                      const revenueGoal = Number(e.target.value) || 0;
                      const rest = (form.consultantGoals || []).filter((g) => g.memberId !== m.id);
                      setForm((f) => ({
                        ...f,
                        consultantGoals: [...rest, { memberId: m.id, ownerId: m.userId, name: m.name, revenueGoal }],
                      }));
                    }}
                  />
                  <span className="muted">{formatCurrencyBRL(cg.revenueGoal || 0)}</span>
                </div>
              );
            })}
          </div>
        )}
      </SettingsPanel>
    </>
  );
}

export function FollowUpSettingsModule({ user, tenantId, onSaved }) {
  const { toast, show } = useToast();
  const [form, setForm] = useState(getFollowUpSettings(tenantId));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(getFollowUpSettings(tenantId)); }, [tenantId]);

  const handleSave = () => {
    setSaving(true);
    try {
      saveFollowUpSettings(user, form);
      show('success', 'Regras de follow-up salvas.');
      onSaved?.();
    } catch (err) {
      show('error', err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <SettingsPanel title="Follow-up automático" description="Prazos e alertas para não perder oportunidades." onSave={handleSave} saving={saving}>
        <label className="crm-settings-check crm-settings-check--block">
          <input type="checkbox" checked={form.enabled} onChange={() => setForm((f) => ({ ...f, enabled: !f.enabled }))} />
          Ativar regras automáticas de follow-up
        </label>
        <div className="crm-settings-followup-grid">
          <div className="form-field">
            <label>Lead sem contato (dias)</label>
            <input type="number" min="1" value={form.leadSemContatoDays} onChange={(e) => setForm((f) => ({ ...f, leadSemContatoDays: Number(e.target.value) }))} />
          </div>
          <div className="form-field">
            <label>Lead parado (dias)</label>
            <input type="number" min="1" value={form.leadParadoDays} onChange={(e) => setForm((f) => ({ ...f, leadParadoDays: Number(e.target.value) }))} />
          </div>
          <div className="form-field">
            <label>Orçamento sem retorno (dias)</label>
            <input type="number" min="1" value={form.orcamentoSemRetornoDays} onChange={(e) => setForm((f) => ({ ...f, orcamentoSemRetornoDays: Number(e.target.value) }))} />
          </div>
        </div>
        <label className="crm-settings-check">
          <input type="checkbox" checked={form.followupVencidoAlert} onChange={() => setForm((f) => ({ ...f, followupVencidoAlert: !f.followupVencidoAlert }))} />
          Alerta vermelho para follow-up vencido
        </label>
      </SettingsPanel>
    </>
  );
}

export function LossReasonsSettingsModule({ user, tenantId, onSaved }) {
  const { toast, show } = useToast();
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const labels = listLossReasonsForTenant(tenantId);
    const stored = (loadDbLossReasons(tenantId));
    setItems(stored.length ? stored : labels.map((label) => ({ label, isActive: true })));
  }, [tenantId]);

  const handleSave = () => {
    setSaving(true);
    try {
      saveLossReasonsForTenant(user, items);
      show('success', 'Motivos de perda salvos.');
      onSaved?.();
    } catch (err) {
      show('error', err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <SettingsPanel title="Motivos de perda" description="Opções exibidas ao marcar um lead como perdido." onSave={handleSave} saving={saving}>
        <CrmOrderedListEditor items={items} onChange={setItems} placeholder="Ex.: Preço" addLabel="Adicionar motivo" />
      </SettingsPanel>
    </>
  );
}

function loadDbLossReasons(tenantId) {
  return (loadDb().crmLossReasons || []).filter((r) => r.tenant_id === tenantId);
}

export function WhatsAppSettingsModule({ user, tenantId, onSaved }) {
  const { toast, show } = useToast();
  const [form, setForm] = useState(getWhatsAppSettings(tenantId));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(getWhatsAppSettings(tenantId)); }, [tenantId]);

  const setMessage = (key, value) => {
    setForm((f) => ({ ...f, messages: { ...f.messages, [key]: value } }));
  };

  const handleSave = () => {
    setSaving(true);
    try {
      saveWhatsAppSettings(user, form);
      show('success', 'Configurações WhatsApp salvas.');
      onSaved?.();
    } catch (err) {
      show('error', err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const messageFields = [
    ['inicial', 'Mensagem inicial'],
    ['boasVindas', 'Boas-vindas'],
    ['followUp', 'Follow-up'],
    ['posAvaliacao', 'Pós-avaliação'],
    ['posOrcamento', 'Pós-orçamento'],
    ['recuperacao', 'Recuperação'],
  ];

  return (
    <>
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <SettingsPanel title="WhatsApp CRM" description="Templates e número principal. Integração API em breve." onSave={handleSave} saving={saving}>
        <div className="form-field">
          <label>Número principal (com DDD)</label>
          <input value={form.mainPhone} onChange={(e) => setForm((f) => ({ ...f, mainPhone: e.target.value }))} placeholder="5511999999999" />
        </div>
        <div className="crm-settings-whatsapp-messages">
          {messageFields.map(([key, label]) => (
            <div key={key} className="form-field">
              <label>{label}</label>
              <textarea rows={3} value={form.messages[key] || ''} onChange={(e) => setMessage(key, e.target.value)} />
            </div>
          ))}
        </div>
      </SettingsPanel>
    </>
  );
}

export function AutomationsSettingsModule({ user, tenantId, onSaved }) {
  const { toast, show } = useToast();
  const [rules, setRules] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRules(listAutomationsForTenant(tenantId).map((r) => ({ ...r })));
  }, [tenantId]);

  const updateRule = (index, patch) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRule = () => {
    setRules((prev) => [...prev, {
      name: 'Nova automação',
      trigger: { type: 'lead_created' },
      action: { type: 'create_task' },
      active: true,
    }]);
  };

  const handleSave = () => {
    setSaving(true);
    try {
      saveAutomationsForTenant(user, rules);
      show('success', 'Automações salvas.');
      onSaved?.();
    } catch (err) {
      show('error', err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const TRIGGER_OPTIONS = [
    { value: 'lead_created', label: 'Lead entra no CRM' },
    { value: 'stage_change', label: 'Mudança de fase' },
    { value: 'budget_stale', label: 'Orçamento sem retorno' },
    { value: 'lead_stalled', label: 'Lead parado' },
  ];

  const ACTION_OPTIONS = [
    { value: 'create_task', label: 'Criar tarefa' },
    { value: 'send_whatsapp', label: 'Enviar WhatsApp' },
    { value: 'create_followup', label: 'Criar follow-up' },
    { value: 'create_alert', label: 'Gerar alerta' },
  ];

  return (
    <>
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <SettingsPanel title="Automações comerciais" description="Regras de gatilho e ação para o time comercial." onSave={handleSave} saving={saving}>
        {rules.map((rule, index) => (
          <div key={rule.id || `new-${index}`} className="crm-settings-automation-card">
            <input
              className="crm-settings-automation-name"
              value={rule.name}
              onChange={(e) => updateRule(index, { name: e.target.value })}
            />
            <div className="crm-settings-automation-row">
              <select value={rule.trigger?.type} onChange={(e) => updateRule(index, { trigger: { ...rule.trigger, type: e.target.value } })}>
                {TRIGGER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={rule.action?.type} onChange={(e) => updateRule(index, { action: { ...rule.action, type: e.target.value } })}>
                {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <label className="crm-settings-check">
                <input type="checkbox" checked={rule.active !== false} onChange={() => updateRule(index, { active: rule.active === false })} />
                Ativa
              </label>
            </div>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={addRule}>Nova automação</Button>
      </SettingsPanel>
    </>
  );
}

export function ConversionSettingsModule({ user, tenantId, onSaved }) {
  const { toast, show } = useToast();
  const [form, setForm] = useState(getConversionSettings(tenantId));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(getConversionSettings(tenantId)); }, [tenantId]);

  const handleSave = () => {
    setSaving(true);
    try {
      saveConversionSettings(user, form);
      show('success', 'Configurações de conversão salvas.');
      onSaved?.();
    } catch (err) {
      show('error', err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
      <SettingsPanel title="Conversão Lead → Paciente" description="Defina quando um lead pode virar paciente." onSave={handleSave} saving={saving}>
        <div className="crm-settings-conversion-options">
          <label className="crm-settings-check crm-settings-check--block">
            <input type="checkbox" checked={form.manualEnabled} onChange={() => setForm((f) => ({ ...f, manualEnabled: !f.manualEnabled }))} />
            Conversão manual (recomendado)
          </label>
          <label className="crm-settings-check crm-settings-check--block">
            <input type="checkbox" checked={form.autoAfterEvaluation} onChange={() => setForm((f) => ({ ...f, autoAfterEvaluation: !f.autoAfterEvaluation }))} />
            Conversão automática após avaliação
          </label>
          <label className="crm-settings-check crm-settings-check--block">
            <input type="checkbox" checked={form.autoAfterClosing} onChange={() => setForm((f) => ({ ...f, autoAfterClosing: !f.autoAfterClosing }))} />
            Conversão automática após fechamento
          </label>
        </div>
        <p className="crm-settings-hint">A conversão manual preserva controle do consultor e evita cadastros duplicados.</p>
      </SettingsPanel>
    </>
  );
}
