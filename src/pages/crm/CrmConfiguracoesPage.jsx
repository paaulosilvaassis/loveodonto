import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  GitBranch,
  MessageCircle,
  RefreshCw,
  Settings,
  Share2,
  Sparkles,
  Stethoscope,
  Target,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import Button from '../../components/Button.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { ensureCrmSettingsForTenant } from '../../services/crmSettingsService.js';
import {
  PipelineSettingsModule,
  SourcesSettingsModule,
  InterestsSettingsModule,
  TeamSettingsModule,
  GoalsSettingsModule,
  FollowUpSettingsModule,
  LossReasonsSettingsModule,
  WhatsAppSettingsModule,
  AutomationsSettingsModule,
  ConversionSettingsModule,
} from '../../crm/ui/settings/CrmSettingsModules.jsx';

const MODULES = [
  { id: 'pipeline', label: 'Pipeline', icon: GitBranch, description: 'Etapas do funil comercial' },
  { id: 'sources', label: 'Origens', icon: Share2, description: 'Canais de captação de leads' },
  { id: 'interests', label: 'Tratamentos', icon: Stethoscope, description: 'Interesses e procedimentos' },
  { id: 'team', label: 'Equipe', icon: Users, description: 'Consultores e recepcionistas' },
  { id: 'goals', label: 'Metas', icon: Target, description: 'Objetivos comerciais mensais' },
  { id: 'followup', label: 'Follow-up', icon: CalendarClock, description: 'Prazos e alertas automáticos' },
  { id: 'loss', label: 'Motivos de Perda', icon: XCircle, description: 'Por que leads são perdidos' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, description: 'Mensagens e templates' },
  { id: 'automations', label: 'Automações', icon: Zap, description: 'Regras comerciais inteligentes' },
  { id: 'conversion', label: 'Conversão', icon: RefreshCw, description: 'Lead virando paciente' },
];

/**
 * Painel administrativo completo do setor comercial.
 */
export default function CrmConfiguracoesPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId || user?.tenant_id || '';
  const [activeModule, setActiveModule] = useState(null);
  const [bootVersion, setBootVersion] = useState(0);

  useEffect(() => {
    if (!user) return;
    try {
      ensureCrmSettingsForTenant(user);
      setBootVersion((v) => v + 1);
    } catch (err) {
      if (import.meta.env?.DEV) console.debug('ensureCrmSettings:', err?.message);
    }
  }, [user]);

  const activeMeta = useMemo(
    () => MODULES.find((m) => m.id === activeModule),
    [activeModule]
  );

  const handleBack = useCallback(() => setActiveModule(null), []);
  const handleSaved = useCallback(() => setBootVersion((v) => v + 1), []);

  const renderModule = () => {
    const props = { user, tenantId, onSaved: handleSaved, key: bootVersion };
    switch (activeModule) {
      case 'pipeline': return <PipelineSettingsModule {...props} />;
      case 'sources': return <SourcesSettingsModule {...props} />;
      case 'interests': return <InterestsSettingsModule {...props} />;
      case 'team': return <TeamSettingsModule {...props} />;
      case 'goals': return <GoalsSettingsModule {...props} />;
      case 'followup': return <FollowUpSettingsModule {...props} />;
      case 'loss': return <LossReasonsSettingsModule {...props} />;
      case 'whatsapp': return <WhatsAppSettingsModule {...props} />;
      case 'automations': return <AutomationsSettingsModule {...props} />;
      case 'conversion': return <ConversionSettingsModule {...props} />;
      default: return null;
    }
  };

  return (
    <div className="crm-settings-page">
      <header className="crm-settings-header">
        <div className="crm-settings-header-text">
          {activeModule ? (
            <Button type="button" variant="ghost" size="sm" icon={ArrowLeft} onClick={handleBack}>
              Voltar
            </Button>
          ) : (
            <span className="crm-settings-header-badge"><Sparkles size={14} /> Admin Comercial</span>
          )}
          <h1>{activeModule ? activeMeta?.label : 'Configurações do CRM'}</h1>
          <p>
            {activeModule
              ? activeMeta?.description
              : 'Configure pipeline, equipe, metas, follow-up e automações — tudo por clínica, sem alterar código.'}
          </p>
        </div>
        {!activeModule && (
          <div className="crm-settings-header-icon" aria-hidden="true">
            <Settings size={22} />
          </div>
        )}
      </header>

      {!activeModule ? (
        <div className="crm-settings-grid">
          {MODULES.map(({ id, label, icon: Icon, description }) => (
            <button
              key={id}
              type="button"
              className="crm-settings-card"
              onClick={() => setActiveModule(id)}
            >
              <span className="crm-settings-card-icon"><Icon size={22} /></span>
              <span className="crm-settings-card-label">{label}</span>
              <span className="crm-settings-card-desc">{description}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="crm-settings-module-wrap">
          {renderModule()}
        </div>
      )}

      {!activeModule && (
        <aside className="crm-settings-footer-note">
          <BarChart3 size={16} />
          <span>As alterações são salvas por clínica (<code>tenant_id</code>) e refletem em captação, pipeline e relatórios.</span>
        </aside>
      )}
    </div>
  );
}
