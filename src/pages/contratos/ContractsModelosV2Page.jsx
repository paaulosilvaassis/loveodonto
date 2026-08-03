/**
 * Administração de Modelos v2 — Phase 10.4.
 * Isolado do legado. Rota só monta com feature flag.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/useAuth.js';
import { listContractTemplateVariables } from '../../domain/contracts/templates/contract-template-variables.catalog.ts';
import { contentSchemaToHtml } from '../../domain/contracts/templates/contract-template-content.schema.ts';
import { defaultContractClauseLibrary } from '../../domain/contracts/templates/contract-clause.library.ts';
import { renderContractTemplate } from '../../domain/contracts/templates/contract-template-parser.ts';
import { buildPreviewVariableValues } from '../../domain/contracts/templates/contract-template-variables.catalog.ts';
import {
  getContractTemplatesV2Service,
  mapContractTemplatesV2Error,
} from '../../services/contractTemplatesV2Service.js';
import {
  BLOCK_TYPE_LABELS,
  defaultEditorSchema,
  duplicateBlock,
  insertBlock,
  insertVariableToken,
  moveBlock,
  removeBlock,
  sortBlocks,
} from '../../components/contracts/v2/templateEditorUtils.js';

const EMPTY_FILTERS = {
  search: '',
  documentType: '',
  status: '',
  includeArchived: false,
};

function actorFromUser(user) {
  return {
    userId: user?.id || user?.authUserId || 'unknown',
    displayName: user?.name || user?.email,
    permissions: user?.permissions || [
      // Sem ampliar RBAC real: UI usa permissões injetadas em testes.
      // Em produção com flag off a rota não monta.
    ],
  };
}

export default function ContractsModelosV2Page() {
  const { user } = useAuth();
  const service = useMemo(() => getContractTemplatesV2Service(), []);
  const tenantId = user?.tenantId || user?.activeTenantId || '';

  const [mode, setMode] = useState('list'); // list | edit | preview | validate
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);
  const [draftMeta, setDraftMeta] = useState(null);
  const [schema, setSchema] = useState(defaultEditorSchema());
  const [requirements, setRequirements] = useState(null);
  const [changeSummary, setChangeSummary] = useState('');
  const [validation, setValidation] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [toast, setToast] = useState(null);

  const actor = useMemo(() => actorFromUser(user), [user]);
  const variables = useMemo(() => listContractTemplateVariables(), []);
  const clauses = useMemo(() => defaultContractClauseLibrary.listSystemClauses(), []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleError = useCallback((err) => {
    const mapped = mapContractTemplatesV2Error(err);
    setError(mapped.message);
    showToast(mapped.message, 'error');
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await service.listTemplates(tenantId, {
        search: filters.search || undefined,
        documentType: filters.documentType || undefined,
        status: filters.status || undefined,
        includeArchived: filters.includeArchived,
      }, actor);
      setItems(result.items || []);
    } catch (err) {
      handleError(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [service, tenantId, filters, actor, handleError]);

  useEffect(() => {
    if (mode === 'list') loadList();
  }, [mode, loadList]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const openEditor = async (templateId) => {
    setLoading(true);
    setError(null);
    try {
      const d = await service.getTemplate(tenantId, templateId, actor);
      if (!d) {
        setError('Modelo não encontrado.');
        return;
      }
      setDetails(d);
      setSelectedId(templateId);
      setDraftMeta({
        name: d.template.name,
        description: d.template.description || '',
        documentType: d.template.documentType,
        category: d.template.category || '',
        isDefault: d.template.isDefault,
      });
      setRequirements({ ...d.template.requirements });
      const contentSchema = d.currentVersion?.contentSchema || defaultEditorSchema();
      setSchema(contentSchema);
      setChangeSummary('');
      setValidation(null);
      setMode('edit');
      setDirty(false);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const createNew = async () => {
    setLoading(true);
    try {
      const created = await service.createTemplate(tenantId, {
        name: 'Novo modelo',
        documentType: 'SERVICE_CONTRACT',
        category: 'geral',
        initialContentSchema: defaultEditorSchema(),
      }, actor);
      showToast('Modelo criado como rascunho.');
      await openEditor(created.id);
    } catch (err) {
      handleError(err);
      setLoading(false);
    }
  };

  const saveDraft = async () => {
    if (!details?.currentVersion) return;
    setLoading(true);
    try {
      await service.updateTemplateDraft(tenantId, selectedId, {
        name: draftMeta.name,
        description: draftMeta.description,
        category: draftMeta.category,
        isDefault: draftMeta.isDefault,
        requirements,
        expectedRowVersion: details.template.rowVersion,
      }, actor);
      await service.updateVersionDraft(
        tenantId,
        selectedId,
        details.currentVersion.id,
        {
          contentSchema: schema,
          contentHtml: contentSchemaToHtml(schema),
          expectedRowVersion: details.currentVersion.rowVersion,
        },
        actor,
      );
      setDirty(false);
      showToast('Rascunho salvo.');
      await openEditor(selectedId);
    } catch (err) {
      handleError(err);
      setLoading(false);
    }
  };

  const runValidate = async () => {
    if (!details?.currentVersion) return;
    try {
      await saveDraft();
      const result = await service.validateVersion(
        tenantId,
        selectedId,
        details.currentVersion.id,
        actor,
      );
      setValidation(result);
      setMode('validate');
    } catch (err) {
      handleError(err);
    }
  };

  const runPreview = () => {
    const html = contentSchemaToHtml(schema);
    const rendered = renderContractTemplate(html, buildPreviewVariableValues(), { mode: 'preview' });
    setPreviewHtml(rendered.html);
    setMode('preview');
  };

  const submitReview = async () => {
    if (!details?.currentVersion) return;
    try {
      await saveDraft();
      await service.submitVersionForReview(
        tenantId,
        selectedId,
        details.currentVersion.id,
        actor,
      );
      showToast('Enviado para revisão.');
      await openEditor(selectedId);
    } catch (err) {
      handleError(err);
    }
  };

  const publish = async () => {
    if (!details?.currentVersion) return;
    if (!String(changeSummary || '').trim()) {
      showToast('Informe o resumo das alterações.', 'error');
      return;
    }
    setLoading(true);
    try {
      await service.publishVersion(
        tenantId,
        selectedId,
        details.currentVersion.id,
        { changeSummary },
        actor,
      );
      setConfirmPublish(false);
      showToast('Versão publicada.');
      setDirty(false);
      await openEditor(selectedId);
    } catch (err) {
      handleError(err);
      setLoading(false);
    }
  };

  const duplicate = async (templateId) => {
    try {
      const copy = await service.duplicateTemplate(tenantId, templateId, actor);
      showToast('Modelo duplicado.');
      await openEditor(copy.id);
    } catch (err) {
      handleError(err);
    }
  };

  const archive = async (templateId) => {
    if (!window.confirm('Arquivar este modelo? Ele não poderá ser selecionado para novos documentos.')) {
      return;
    }
    try {
      await service.archiveTemplate(tenantId, templateId, actor);
      showToast('Modelo arquivado.');
      setMode('list');
      loadList();
    } catch (err) {
      handleError(err);
    }
  };

  const leaveEditor = () => {
    if (dirty && !window.confirm('Há alterações não salvas. Deseja sair mesmo assim?')) {
      return;
    }
    setMode('list');
    setSelectedId(null);
    setDetails(null);
    setDirty(false);
  };

  const updateSchemaBlocks = (nextBlocks) => {
    setSchema((prev) => ({ ...prev, blocks: nextBlocks }));
    setDirty(true);
  };

  const selectedBlockId = null; // reserved for future selection panel

  return (
    <div className="ctr-page space-y-4" data-testid="contracts-modelos-v2-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}

      <header className="ctr-section">
        <h2 className="ctr-section-title">Modelos v2</h2>
        <p className="ctr-hint">
          Fundação administrativa de modelos versionados. Feature flag controlada — sem impacto no legado.
        </p>
      </header>

      {error && (
        <div className="ctr-section" role="alert" data-testid="contracts-modelos-v2-error">
          <p className="ctr-hint" style={{ color: 'var(--color-danger, #b91c1c)' }}>{error}</p>
        </div>
      )}

      {mode === 'list' && (
        <section className="ctr-section space-y-4" aria-label="Lista de modelos v2">
          <div className="ctr-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" className="button" onClick={createNew} disabled={loading}>
              Criar modelo
            </button>
            <button type="button" className="button secondary" onClick={loadList} disabled={loading}>
              Atualizar
            </button>
          </div>

          <div className="ctr-filters" style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
            <label>
              Busca
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                aria-label="Buscar modelos"
              />
            </label>
            <label>
              Tipo
              <select
                value={filters.documentType}
                onChange={(e) => setFilters((f) => ({ ...f, documentType: e.target.value }))}
                aria-label="Filtrar por tipo"
              >
                <option value="">Todos</option>
                <option value="SERVICE_CONTRACT">Contrato de serviço</option>
                <option value="INFORMED_CONSENT">Consentimento</option>
              </select>
            </label>
            <label>
              Status
              <select
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                aria-label="Filtrar por status"
              >
                <option value="">Todos</option>
                <option value="DRAFT">Rascunho</option>
                <option value="IN_REVIEW">Em revisão</option>
                <option value="PUBLISHED">Publicado</option>
                <option value="ARCHIVED">Arquivado</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'end', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={filters.includeArchived}
                onChange={(e) => setFilters((f) => ({ ...f, includeArchived: e.target.checked }))}
              />
              Incluir arquivados
            </label>
          </div>

          {loading && <p className="ctr-hint">Carregando…</p>}
          {!loading && items.length === 0 && !error && (
            <p className="ctr-hint" data-testid="contracts-modelos-v2-empty">Nenhum modelo v2 encontrado.</p>
          )}

          <ul className="ctr-template-list" aria-label="Modelos">
            {items.map((item) => (
              <li key={item.id} className="ctr-template-item">
                <div>
                  <strong>{item.name}</strong>
                  <span className="ctr-template-meta">
                    {item.documentType}
                    {item.category ? ` · ${item.category}` : ''}
                    {` · ${item.templateStatus}`}
                    {item.isDefault ? ' · Padrão' : ''}
                    {item.currentVersionId ? ` · ver. atual` : ''}
                  </span>
                </div>
                <div className="ctr-actions">
                  <button type="button" className="button small" onClick={() => openEditor(item.id)}>
                    Editar
                  </button>
                  <button type="button" className="button small secondary" onClick={() => duplicate(item.id)}>
                    Duplicar
                  </button>
                  <button type="button" className="button small secondary" onClick={() => archive(item.id)}>
                    Arquivar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(mode === 'edit' || mode === 'preview' || mode === 'validate') && details && (
        <section className="ctr-section" aria-label="Editor de modelo v2" data-testid="contracts-modelos-v2-editor">
          <div className="ctr-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            <button type="button" className="button secondary" onClick={leaveEditor}>Voltar</button>
            <button type="button" className="button" onClick={saveDraft} disabled={loading}>Salvar rascunho</button>
            <button type="button" className="button secondary" onClick={runPreview}>Pré-visualizar</button>
            <button type="button" className="button secondary" onClick={runValidate}>Validar</button>
            <button type="button" className="button secondary" onClick={submitReview}>Enviar para revisão</button>
            <button type="button" className="button" onClick={() => setConfirmPublish(true)}>Publicar</button>
          </div>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(180px,220px) 1fr minmax(200px,260px)' }}>
            <aside aria-label="Paleta" className="space-y-3">
              <h3 className="ctr-section-title" style={{ fontSize: '1rem' }}>Blocos</h3>
              {Object.keys(BLOCK_TYPE_LABELS).map((type) => (
                <button
                  key={type}
                  type="button"
                  className="button small secondary"
                  style={{ display: 'block', width: '100%', marginBottom: '0.25rem' }}
                  onClick={() => updateSchemaBlocks(insertBlock(schema.blocks, type))}
                >
                  + {BLOCK_TYPE_LABELS[type]}
                </button>
              ))}
              <h3 className="ctr-section-title" style={{ fontSize: '1rem' }}>Variáveis</h3>
              <ul style={{ maxHeight: 180, overflow: 'auto', paddingLeft: '1rem' }}>
                {variables.slice(0, 40).map((v) => (
                  <li key={v.key}>
                    <button
                      type="button"
                      className="button small secondary"
                      onClick={() => {
                        const blocks = sortBlocks(schema.blocks);
                        const para = [...blocks].reverse().find((b) => b.type === 'PARAGRAPH');
                        if (!para) {
                          updateSchemaBlocks(insertBlock(blocks, 'VARIABLE', { variableKey: v.key }));
                          return;
                        }
                        updateSchemaBlocks(blocks.map((b) => (
                          b.id === para.id
                            ? { ...b, text: insertVariableToken(b.text, v.key) }
                            : b
                        )));
                      }}
                    >
                      {v.key}
                    </button>
                  </li>
                ))}
              </ul>
              <h3 className="ctr-section-title" style={{ fontSize: '1rem' }}>Cláusulas</h3>
              <ul style={{ maxHeight: 160, overflow: 'auto', paddingLeft: '1rem' }}>
                {clauses.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="button small secondary"
                      onClick={() => updateSchemaBlocks(insertBlock(schema.blocks, 'CLAUSE', {
                        clauseCode: c.clauseCode,
                        title: c.title,
                        content: c.content,
                      }))}
                    >
                      {c.title}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <div aria-label="Documento" className="space-y-3">
              {mode === 'preview' && (
                <div
                  className="ctr-preview"
                  data-testid="contracts-modelos-v2-preview"
                  style={{
                    border: '1px solid var(--border-color, #d4d4d8)',
                    padding: '1rem',
                    minHeight: 320,
                    background: 'var(--surface, #fff)',
                  }}
                  // HTML já sanitizado pelo renderer
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
              {mode === 'validate' && validation && (
                <div data-testid="contracts-modelos-v2-validation">
                  <p><strong>{validation.valid ? 'Válido' : 'Inválido'}</strong></p>
                  <ul>
                    {validation.errors.map((e) => (
                      <li key={`${e.code}-${e.message}`} style={{ color: '#b91c1c' }}>{e.message}</li>
                    ))}
                    {validation.warnings.map((w) => (
                      <li key={`${w.code}-${w.message}`}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {mode === 'edit' && sortBlocks(schema.blocks).map((block) => (
                <article
                  key={block.id}
                  className="ctr-block"
                  style={{ border: '1px solid var(--border-color, #e4e4e7)', padding: '0.75rem', borderRadius: 4 }}
                  aria-label={`Bloco ${BLOCK_TYPE_LABELS[block.type] || block.type}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <strong>{BLOCK_TYPE_LABELS[block.type] || block.type}</strong>
                    <div className="ctr-actions">
                      <button type="button" className="button small secondary" onClick={() => updateSchemaBlocks(moveBlock(schema.blocks, block.id, 'up'))} aria-label="Mover para cima">↑</button>
                      <button type="button" className="button small secondary" onClick={() => updateSchemaBlocks(moveBlock(schema.blocks, block.id, 'down'))} aria-label="Mover para baixo">↓</button>
                      <button type="button" className="button small secondary" onClick={() => updateSchemaBlocks(duplicateBlock(schema.blocks, block.id))}>Duplicar</button>
                      <button type="button" className="button small secondary" disabled={block.required} onClick={() => updateSchemaBlocks(removeBlock(schema.blocks, block.id))}>Remover</button>
                    </div>
                  </div>
                  {(block.type === 'HEADING' || block.type === 'PARAGRAPH' || block.type === 'CLAUSE') && (
                    <label style={{ display: 'block' }}>
                      Texto
                      <textarea
                        value={block.type === 'CLAUSE' ? block.content : block.text}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateSchemaBlocks(schema.blocks.map((b) => {
                            if (b.id !== block.id) return b;
                            if (b.type === 'CLAUSE') return { ...b, content: value };
                            return { ...b, text: value };
                          }));
                        }}
                        rows={block.type === 'HEADING' ? 2 : 4}
                        style={{ width: '100%' }}
                      />
                    </label>
                  )}
                  {block.type === 'VARIABLE' && (
                    <p><code>{`{{${block.variableKey}}}`}</code></p>
                  )}
                  {['SIGNATURES', 'ODONTOGRAM', 'FINANCIAL_SUMMARY', 'TREATMENT_TABLE', 'PAGE_BREAK', 'DIVIDER'].includes(block.type) && (
                    <p className="ctr-hint">Bloco estrutural — renderizado no preview.</p>
                  )}
                </article>
              ))}
            </div>

            <aside aria-label="Propriedades" className="space-y-3">
              <h3 className="ctr-section-title" style={{ fontSize: '1rem' }}>Propriedades</h3>
              <label>
                Nome
                <input
                  value={draftMeta?.name || ''}
                  onChange={(e) => {
                    setDraftMeta((m) => ({ ...m, name: e.target.value }));
                    setDirty(true);
                  }}
                  aria-invalid={!draftMeta?.name}
                />
                {!draftMeta?.name && <span className="ctr-hint">Nome obrigatório</span>}
              </label>
              <label>
                Descrição
                <textarea
                  value={draftMeta?.description || ''}
                  onChange={(e) => {
                    setDraftMeta((m) => ({ ...m, description: e.target.value }));
                    setDirty(true);
                  }}
                  rows={3}
                />
              </label>
              <label>
                Categoria
                <input
                  value={draftMeta?.category || ''}
                  onChange={(e) => {
                    setDraftMeta((m) => ({ ...m, category: e.target.value }));
                    setDirty(true);
                  }}
                />
              </label>
              <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(draftMeta?.isDefault)}
                  onChange={(e) => {
                    setDraftMeta((m) => ({ ...m, isDefault: e.target.checked }));
                    setDirty(true);
                  }}
                />
                Modelo padrão
              </label>

              <h3 className="ctr-section-title" style={{ fontSize: '1rem' }}>Requisitos</h3>
              {requirements && Object.keys(requirements).filter((k) => typeof requirements[k] === 'boolean').map((key) => (
                <label key={key} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(requirements[key])}
                    onChange={(e) => {
                      setRequirements((r) => ({ ...r, [key]: e.target.checked }));
                      setDirty(true);
                    }}
                  />
                  {key}
                </label>
              ))}

              <h3 className="ctr-section-title" style={{ fontSize: '1rem' }}>Versão</h3>
              <p className="ctr-hint">
                Status: {details.currentVersion?.status || '—'}
                <br />
                Nº: {details.currentVersion?.versionNumber || '—'}
              </p>
              <label>
                Resumo das alterações (publicação)
                <textarea
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  rows={3}
                  aria-label="Resumo das alterações"
                />
              </label>
            </aside>
          </div>
        </section>
      )}

      {confirmPublish && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-title"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'grid', placeItems: 'center', zIndex: 50,
          }}
        >
          <div style={{ background: '#fff', padding: '1.25rem', maxWidth: 420, borderRadius: 8 }}>
            <h3 id="publish-title">Confirmar publicação</h3>
            <p>A versão publicada ficará imutável. Continuar?</p>
            <div className="ctr-actions" style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="button" onClick={publish} disabled={loading}>Publicar</button>
              <button type="button" className="button secondary" onClick={() => setConfirmPublish(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* selectedBlockId reservado para painel futuro */}
      <span hidden>{selectedBlockId}</span>
    </div>
  );
}
