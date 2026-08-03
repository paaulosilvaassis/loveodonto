import { useMemo, useState, useEffect } from 'react';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';
import { can } from '../../permissions/permissions.js';
import { useAuth } from '../../auth/useAuth.js';
import { CONTRACT_HASHTAG_DEFS } from '../../contracts/hashtagRegistry.js';
import ContractRichEditor from '../../components/contracts/ContractRichEditor.jsx';
import {
  listContractTemplates,
  listBlocksForTemplate,
  upsertContractBlock,
  createClinicCustomTemplate,
  deleteClinicTemplate,
  duplicateClinicTemplate,
  restoreSystemDefaultTemplate,
  listGeneratedContracts,
  cancelGeneratedContract,
  listContractAuditLogs,
} from '../../services/contractService.js';
import { findUnknownHashtags } from '../../contracts/hashtagRegistry.js';

const TABS = [
  { id: 'config', label: 'Configuração' },
  { id: 'padrao', label: 'Contrato padrão' },
  { id: 'proprio', label: 'Contrato próprio' },
  { id: 'gerados', label: 'Contratos gerados' },
  { id: 'hashtags', label: 'Hashtags' },
];

export default function AdminContratosConsentimentosPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('config');
  const [toast, setToast] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [customName, setCustomName] = useState('Contrato personalizado');
  const [customContent, setCustomContent] = useState('<p></p>');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const bump = () => setRefresh((x) => x + 1);

  const templates = useMemo(() => {
    void refresh;
    return listContractTemplates();
  }, [refresh]);

  const systemTpl = useMemo(
    () => templates.find((t) => t.type === 'system_default'),
    [templates],
  );

  const customTpls = useMemo(
    () => templates.filter((t) => t.type === 'clinic_custom'),
    [templates],
  );

  const blocks = useMemo(() => {
    if (!systemTpl?.id) return [];
    return listBlocksForTemplate(systemTpl.id);
  }, [systemTpl, refresh]);

  const generated = useMemo(() => {
    void refresh;
    return listGeneratedContracts({
      status: filterStatus || undefined,
      patientId: filterPatient.trim() || undefined,
    });
  }, [refresh, filterStatus, filterPatient]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleRestore = () => {
    if (!can(user, 'admin_contratos:edit_system_clause')) {
      showToast('Sem permissão para restaurar o padrão do sistema.', 'error');
      return;
    }
    try {
      restoreSystemDefaultTemplate(user);
      bump();
      showToast('Modelo padrão restaurado.');
    } catch (e) {
      showToast(e?.message || 'Erro ao restaurar.', 'error');
    }
  };

  const handleSaveBlock = (block) => {
    if (!can(user, 'admin_contratos:update_template')) {
      showToast('Sem permissão.', 'error');
      return;
    }
    try {
      const unknown = findUnknownHashtags(block.content || '');
      if (unknown.length) {
        showToast(`Hashtags desconhecidas: ${unknown.join(', ')}`, 'error');
        return;
      }
      upsertContractBlock(user, {
        id: block.id,
        templateId: block.templateId,
        blockNumber: block.blockNumber,
        title: block.title,
        content: block.content,
        isActive: block.isActive,
        conditionType: block.conditionType,
        orderIndex: block.orderIndex,
      });
      bump();
      showToast('Bloco salvo.');
    } catch (e) {
      showToast(e?.message || 'Erro ao salvar bloco.', 'error');
    }
  };

  const handleCreateCustom = () => {
    if (!can(user, 'admin_contratos:create')) {
      showToast('Sem permissão.', 'error');
      return;
    }
    try {
      createClinicCustomTemplate(user, { name: customName, content: customContent });
      setCustomContent('<p></p>');
      bump();
      showToast('Modelo próprio criado.');
    } catch (e) {
      showToast(e?.message || 'Erro.', 'error');
    }
  };

  const audits = useMemo(() => {
    void refresh;
    return listContractAuditLogs(null).slice(0, 80);
  }, [refresh]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Contratos e consentimentos</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Modelos com hashtags (#tag), geração a partir de orçamentos aprovados e auditoria local. Textos legais são base — revise com assessoria jurídica.
        </p>
      </header>

      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              tab === t.id
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4 bg-[var(--color-bg-card)]">
          <h2 className="text-lg font-semibold">Configuração</h2>
          <ul className="list-disc pl-5 text-sm text-[var(--color-text-muted)] space-y-2">
            <li>Hashtags substituem dados da clínica, paciente e orçamento no momento da geração.</li>
            <li>Contratos finalizados ficam imutáveis; alterações exigem novo documento.</li>
            <li>Modo SaaS: sincronização opcional com Supabase quando a migration 006 estiver aplicada.</li>
          </ul>
        </section>
      )}

      {tab === 'padrao' && systemTpl && (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h2 className="text-lg font-semibold">Contrato padrão (blocos)</h2>
            <button type="button" className="button secondary text-sm" onClick={handleRestore}>
              Restaurar padrão do sistema
            </button>
          </div>
          <div className="space-y-6">
            {blocks.map((b) => (
              <BlockEditorCard key={b.id} block={b} onSave={handleSaveBlock} />
            ))}
          </div>
        </section>
      )}

      {tab === 'proprio' && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Contratos próprios</h2>
          <div className="rounded-lg border border-[var(--color-border)] p-4 bg-[var(--color-bg-card)] space-y-3">
            <label className="block text-sm font-medium">Nome do modelo</label>
            <input
              className="w-full max-w-md border border-[var(--color-border)] rounded px-3 py-2"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
            <ContractRichEditor initialHtml={customContent} onChange={setCustomContent} />
            <button type="button" className="button primary" onClick={handleCreateCustom}>
              Criar modelo
            </button>
          </div>
          <ul className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-card)]">
            {customTpls.map((t) => (
              <li key={t.id} className="p-4 flex flex-wrap gap-2 items-center justify-between">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    v{t.version} · uso {t.usageCount || 0}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="button small secondary"
                    onClick={() => {
                      duplicateClinicTemplate(user, t.id);
                      bump();
                      showToast('Duplicado.');
                    }}
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="button small secondary"
                    onClick={() => {
                      try {
                        deleteClinicTemplate(user, t.id);
                        bump();
                        showToast('Excluído.');
                      } catch (e) {
                        showToast(e?.message || 'Não foi possível excluir.', 'error');
                      }
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'gerados' && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Contratos gerados</h2>
          <div className="flex flex-wrap gap-3">
            <select
              className="border border-[var(--color-border)] rounded px-2 py-1 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              <option value="draft">Rascunho</option>
              <option value="generated">Finalizado</option>
              <option value="canceled">Cancelado</option>
            </select>
            <input
              className="border border-[var(--color-border)] rounded px-2 py-1 text-sm flex-1 min-w-[160px]"
              placeholder="Filtrar por ID paciente"
              value={filterPatient}
              onChange={(e) => setFilterPatient(e.target.value)}
            />
          </div>
          <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-bg-subtle)] text-left">
                  <th className="p-2">Número</th>
                  <th className="p-2">Paciente</th>
                  <th className="p-2">Origem</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {generated.map((c, index) => (
                  <tr key={c.id} className="border-t border-[var(--color-border)]">
                    <td className="p-2 tabular-nums">{formatFriendlyContractNumber(c.contractNumber, index + 1)}</td>
                    <td className="p-2">{c.patientId}</td>
                    <td className="p-2">{c.quoteSource}</td>
                    <td className="p-2">{c.status}</td>
                    <td className="p-2">
                      {c.status !== 'canceled' && can(user, 'admin_contratos:cancel') && (
                        <button
                          type="button"
                          className="text-xs text-[var(--color-error)]"
                          onClick={() => {
                            cancelGeneratedContract(user, c.id);
                            bump();
                            showToast('Contrato cancelado.');
                          }}
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {can(user, 'admin_contratos:view_audit') && (
            <div className="mt-6">
              <h3 className="text-md font-semibold mb-2">Auditoria recente</h3>
              <ul className="text-xs text-[var(--color-text-muted)] space-y-1 max-h-48 overflow-y-auto font-mono">
                {audits.map((a) => (
                  <li key={a.id}>
                    {a.createdAt} · {a.action} · {a.contractId || '—'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tab === 'hashtags' && (
        <section className="overflow-x-auto border border-[var(--color-border)] rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-bg-subtle)] text-left">
                <th className="p-2">Tag</th>
                <th className="p-2">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACT_HASHTAG_DEFS.map((d) => (
                <tr key={d.tag} className="border-t border-[var(--color-border)]">
                  <td className="p-2 font-mono">{d.tag}</td>
                  <td className="p-2">{d.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function BlockEditorCard({ block, onSave }) {
  const [local, setLocal] = useState(block);
  useEffect(() => {
    setLocal(block);
  }, [block]);
  const unknown = findUnknownHashtags(local.content || '');
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4 bg-[var(--color-bg-card)] space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h3 className="font-medium">
          Bloco {block.blockNumber}: {block.title}
        </h3>
        <span className="text-xs text-[var(--color-text-muted)]">
          {local.isActive === false ? 'Inativo' : 'Ativo'}
        </span>
      </div>
      <ContractRichEditor
        key={block.id}
        initialHtml={local.content || ''}
        onChange={(html) => setLocal((s) => ({ ...s, content: html }))}
      />
      {unknown.length > 0 && (
        <p className="text-xs text-[var(--color-warning)]">Tags desconhecidas: {unknown.join(', ')}</p>
      )}
      <button type="button" className="button primary text-sm" onClick={() => onSave({ ...local })}>
        Salvar bloco
      </button>
    </div>
  );
}
