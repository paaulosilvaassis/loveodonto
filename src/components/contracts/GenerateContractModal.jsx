import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../ui/Modal.jsx';
import { can } from '../../permissions/permissions.js';
import ContractRichEditor from './ContractRichEditor.jsx';
import { CONTRACT_HASHTAG_DEFS } from '../../contracts/hashtagRegistry.js';
import { findUnknownHashtags } from '../../contracts/hashtagRegistry.js';
import { buildContractContext, applyHashtags } from '../../services/contractRenderService.js';
import {
  listContractTemplates,
  composeTemplateHtmlForContext,
  finalizeGeneratedContract,
  updateDraftGeneratedContract,
  getGeneratedContract,
} from '../../services/contractService.js';
import { createContractDraft, ensureContractsModuleSeeded } from '../../services/contractModuleService.js';
import {
  contractHtmlWithSignatures,
  printContractElement,
  downloadContractPdfFromElement,
} from '../../services/contractPdfService.js';
import { syncGeneratedContractToSaas } from '../../services/contractSaasSyncService.js';

function canGenerateContract(user, flow) {
  if (!user) return false;
  if (flow === 'clinical') {
    return can(user, 'prontuario_contratos:create') || can(user, 'admin_contratos:generate');
  }
  return can(user, 'admin_contratos:generate');
}

function canFinalizeContract(user) {
  return can(user, 'admin_contratos:generate');
}

function canPrintContract(user) {
  return can(user, 'admin_contratos:print') || can(user, 'admin_contratos:generate');
}

function canExportPdfContract(user) {
  return can(user, 'admin_contratos:export_pdf') || can(user, 'admin_contratos:generate');
}

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   user: object,
 *   patientId: string,
 *   quoteSource: 'crm_budget'|'clinical_budget',
 *   quoteId: string,
 *   flow?: 'crm'|'clinical',
 *   onSuccess?: (contract: object) => void,
 * }} props
 */
export default function GenerateContractModal({
  open,
  onOpenChange,
  user,
  patientId,
  quoteSource,
  quoteId,
  flow = 'crm',
  onSuccess,
}) {
  const editorRef = useRef(null);
  const printRef = useRef(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [step, setStep] = useState('edit');
  const [draftContract, setDraftContract] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [tagQuery, setTagQuery] = useState('');

  const allowed = useMemo(() => canGenerateContract(user, flow === 'clinical' ? 'clinical' : 'crm'), [user, flow]);

  const refreshTemplates = useCallback(() => {
    ensureContractsModuleSeeded();
    const list = listContractTemplates();
    setTemplates(list);
    const sys = list.find((t) => t.type === 'system_default' && t.isActive !== false);
    const first = sys?.id || list[0]?.id || '';
    setSelectedTemplateId((prev) => (prev && list.some((t) => t.id === prev) ? prev : first));
  }, []);

  useEffect(() => {
    if (!open) return;
    setError('');
    setStep('edit');
    setDraftContract(null);
    setToast(null);
    refreshTemplates();
  }, [open, refreshTemplates]);

  useEffect(() => {
    if (!open || !selectedTemplateId || !patientId || !quoteId || !quoteSource) return;
    try {
      const html = composeTemplateHtmlForContext(selectedTemplateId, {
        quoteSource,
        quoteId,
        patientId,
        currentUser: user,
      });
      setHtmlBody(html);
      setEditorKey((k) => k + 1);
      setError('');
    } catch (e) {
      setError(e?.message || 'Falha ao montar modelo.');
    }
  }, [open, selectedTemplateId, patientId, quoteId, quoteSource, user]);

  const previewHtml = useMemo(() => {
    try {
      const ctx = buildContractContext({
        quoteSource,
        quoteId,
        patientId,
        currentUser: user,
      });
      return contractHtmlWithSignatures(applyHashtags(htmlBody, ctx));
    } catch {
      return contractHtmlWithSignatures(htmlBody);
    }
  }, [htmlBody, quoteSource, quoteId, patientId, user]);

  const unknownTags = useMemo(() => findUnknownHashtags(htmlBody), [htmlBody]);

  const filteredTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return CONTRACT_HASHTAG_DEFS;
    return CONTRACT_HASHTAG_DEFS.filter(
      (d) => d.tag.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
    );
  }, [tagQuery]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleCreateDraft = async () => {
    if (!allowed) {
      setError('Sem permissão para gerar contrato.');
      return;
    }
    if (unknownTags.length) {
      setError(`Hashtags desconhecidas: ${unknownTags.join(', ')}`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const row = createContractDraft(user, {
        quoteSource,
        quoteId,
        patientId,
        templateId: selectedTemplateId,
        editedHtml: htmlBody,
      });
      await syncGeneratedContractToSaas(row);
      setDraftContract(row);
      setStep('draft');
      setToast({ type: 'success', message: `Rascunho ${row.contractNumber || row.id} criado.` });
      onSuccess?.(row);
    } catch (e) {
      setError(e?.message || 'Erro ao gerar rascunho.');
    } finally {
      setBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (!draftContract?.id || !canFinalizeContract(user)) {
      setError('Sem permissão para finalizar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      updateDraftGeneratedContract(user, draftContract.id, { finalContent: htmlBody });
      const finalized = finalizeGeneratedContract(user, draftContract.id);
      await syncGeneratedContractToSaas(getGeneratedContract(finalized.id) || finalized);
      setDraftContract(finalized);
      setToast({ type: 'success', message: 'Contrato finalizado. Impressão e PDF disponíveis.' });
      onSuccess?.(finalized);
    } catch (e) {
      setError(e?.message || 'Erro ao finalizar.');
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current || !canPrintContract(user)) return;
    printContractElement(printRef.current);
  };

  const handlePdf = async () => {
    if (!printRef.current || !canExportPdfContract(user)) {
      setError('Sem permissão para exportar PDF.');
      return;
    }
    setBusy(true);
    try {
      const num = draftContract?.contractNumber || 'contrato';
      await downloadContractPdfFromElement(printRef.current, `contrato-${num}.pdf`);
    } catch (e) {
      setError(e?.message || 'Falha ao gerar PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <ModalContent size="xl" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>Gerar contrato</ModalTitle>
          <ModalDescription>
            Orçamento vinculado: {quoteSource === 'crm_budget' ? 'CRM' : 'Clínico'} · Revise o texto e as hashtags antes de finalizar.
          </ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-4 max-h-[min(85vh,900px)] overflow-y-auto">
          {toast && (
            <div className={`toast ${toast.type}`} role="status">
              {toast.message}
            </div>
          )}
          {!allowed && (
            <p className="text-sm text-[var(--color-error)]">Você não tem permissão para gerar contratos neste fluxo.</p>
          )}
          {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

          {step === 'edit' && (
            <>
              <div className="form-field">
                <label className="text-sm font-medium">Modelo</label>
                <select
                  className="w-full border border-[var(--color-border)] rounded-md px-3 py-2 bg-[var(--color-bg-card)]"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  disabled={!allowed}
                >
                  {templates
                    .filter((t) => t.type === 'system_default' || (t.type === 'clinic_custom' && t.isActive !== false))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.type === 'system_default' ? 'Contrato padrão (sistema)' : t.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold mb-2">Edição</h4>
                  <ContractRichEditor
                    key={editorKey}
                    ref={editorRef}
                    initialHtml={htmlBody}
                    onChange={setHtmlBody}
                    editable={allowed}
                  />
                  <div className="mt-3 space-y-2">
                    <label className="text-xs font-medium text-[var(--color-text-muted)]">Inserir hashtag</label>
                    <input
                      type="search"
                      className="w-full text-sm border border-[var(--color-border)] rounded px-2 py-1"
                      placeholder="Buscar…"
                      value={tagQuery}
                      onChange={(e) => setTagQuery(e.target.value)}
                    />
                    <div className="max-h-32 overflow-y-auto border border-[var(--color-border)] rounded p-2 flex flex-wrap gap-1">
                      {filteredTags.map((d) => (
                        <button
                          key={d.tag}
                          type="button"
                          className="text-xs px-2 py-0.5 rounded bg-[var(--color-bg-subtle)] hover:bg-[var(--color-border)]"
                          onClick={() => editorRef.current?.insertToken(d.tag)}
                        >
                          {d.tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-2">Preview (hashtags resolvidas)</h4>
                  <div
                    ref={printRef}
                    className="contract-print-root border border-[var(--color-border)] rounded-md min-h-[200px] overflow-auto text-sm"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                  {unknownTags.length > 0 && (
                    <p className="text-xs text-[var(--color-warning)] mt-2">
                      Tags não reconhecidas (corrija antes de gerar): {unknownTags.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 'draft' && draftContract && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>Número:</strong> {draftContract.contractNumber || draftContract.id} ·{' '}
                <strong>Status:</strong> {draftContract.status}
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold mb-2">Ajuste final (rascunho)</h4>
                  <ContractRichEditor
                    key={`${draftContract.id}-edit`}
                    ref={editorRef}
                    initialHtml={draftContract.finalContent || htmlBody}
                    onChange={setHtmlBody}
                    editable={draftContract.status === 'draft' && allowed}
                  />
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-2">Preview (impressão / PDF)</h4>
                  <div
                    ref={printRef}
                    className="contract-print-root border border-[var(--color-border)] rounded-md min-h-[200px] overflow-auto text-sm"
                    dangerouslySetInnerHTML={{
                      __html:
                        draftContract.status === 'generated' && draftContract.renderedHtml
                          ? contractHtmlWithSignatures(draftContract.renderedHtml)
                          : previewHtml,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="button secondary" onClick={handleClose}>
            Fechar
          </button>
          {step === 'edit' && (
            <button
              type="button"
              className="button primary"
              disabled={busy || !allowed || !selectedTemplateId}
              onClick={handleCreateDraft}
            >
              {busy ? 'Gerando…' : 'Gerar rascunho'}
            </button>
          )}
          {step === 'draft' && draftContract?.status === 'draft' && (
            <>
              <button
                type="button"
                className="button secondary"
                disabled={busy || !canPrintContract(user)}
                onClick={handlePrint}
              >
                Imprimir
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || !canExportPdfContract(user)}
                onClick={handlePdf}
              >
                PDF
              </button>
              <button
                type="button"
                className="button primary"
                disabled={busy || !canFinalizeContract(user)}
                onClick={handleFinalize}
              >
                {busy ? 'Salvando…' : 'Finalizar contrato'}
              </button>
            </>
          )}
          {step === 'draft' && draftContract?.status === 'generated' && (
            <>
              <button
                type="button"
                className="button secondary"
                disabled={!canPrintContract(user)}
                onClick={handlePrint}
              >
                Imprimir
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || !canExportPdfContract(user)}
                onClick={handlePdf}
              >
                PDF
              </button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
