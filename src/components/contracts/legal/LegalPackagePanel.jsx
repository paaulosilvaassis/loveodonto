/**
 * Painel `Pacote jurídico` — superfície operacional Wave A.
 * Reutiliza ViewModel; não usa harness *-v2.
 */

import React from 'react';
import { buildContractPackageViewModel } from '../../../contracts/legalPackageViewModel.js';
import { ensureLegalPackageForBudget } from '../../../contracts/legalPackageEnsure.js';
import { buildProntuarioLegalPackagesUrl } from '../../../contracts/legalPackageNavigation.js';

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return '—';
  }
}

export default function LegalPackagePanel({
  appointmentId,
  budgetId,
  patientId,
  user = null,
  compact = false,
  onOpenCeremony = null,
  onViewDocument = null,
  onDownloadPdf = null,
  onOpenEvidence = null,
  onRefresh = null,
  onNavigateProntuario = null,
  toast = null,
}) {
  if (!appointmentId || !budgetId) {
    return (
      <section className="legal-package-panel" data-testid="legal-package-panel">
        <p className="legal-package-panel__hint">Nenhum orçamento vinculado para o pacote jurídico.</p>
      </section>
    );
  }

  const vm = buildContractPackageViewModel({
    appointmentId,
    budgetId,
    patientId,
    user,
  });
  const perms = vm.permissions;
  const primary = vm.actions[0] || null;

  const handleGenerate = () => {
    const result = ensureLegalPackageForBudget({
      user,
      patientId,
      appointmentId,
      budgetId,
    });
    if (!result.ok) {
      toast?.(result.error || 'Não foi possível gerar o pacote.', 'error');
      return;
    }
    toast?.(result.reused ? 'Pacote jurídico reutilizado.' : 'Pacote jurídico gerado.', 'success');
    onRefresh?.();
  };

  const runAction = (action, document = null) => {
    if (!action?.key) return;
    if (action.key === 'generate') {
      handleGenerate();
      return;
    }
    if (action.key === 'send' || action.key === 'resend' || action.key === 'sign_now' || action.key === 'review') {
      onOpenCeremony?.(action.key, vm, document);
      return;
    }
    if (action.key === 'download_pdf') {
      onDownloadPdf?.(document || vm);
      return;
    }
    if (action.key === 'evidence') {
      onOpenEvidence?.(vm);
      return;
    }
    onViewDocument?.(document || vm);
  };

  return (
    <section
      className={`legal-package-panel ocw-clinical-package${compact ? ' is-compact' : ''}`}
      data-testid="legal-package-panel"
    >
      <header>
        <div>
          <h3>Pacote jurídico</h3>
          <p data-testid="legal-package-treatment">{vm.treatmentName}</p>
        </div>
        <span className="legal-package-panel__status" data-testid="legal-package-status">
          {vm.packageStatusLabel}
        </span>
      </header>

      <dl className="legal-package-panel__meta" data-testid="legal-package-meta">
        <div>
          <dt>Paciente</dt>
          <dd>{vm.patientName}</dd>
        </div>
        <div>
          <dt>Orçamento</dt>
          <dd>{vm.budgetNumber || vm.budgetId || '—'}</dd>
        </div>
        <div>
          <dt>Tratamento</dt>
          <dd>{vm.treatmentName}</dd>
        </div>
        {vm.responsibleParty ? (
          <div>
            <dt>Responsável legal</dt>
            <dd>{vm.responsibleParty}</dd>
          </div>
        ) : null}
        <div>
          <dt>Documentos</dt>
          <dd data-testid="legal-package-progress">
            {vm.completedCount} / {vm.totalRequired} obrigatórios
          </dd>
        </div>
        <div>
          <dt>Assinatura</dt>
          <dd>eletrônica {vm.signatureLevelLabel}</dd>
        </div>
        <div>
          <dt>Atualizado</dt>
          <dd>{formatWhen(vm.updatedAt)}</dd>
        </div>
      </dl>

      {vm.pending.length ? (
        <ul className="legal-package-panel__pendencies" data-testid="legal-package-pendencies">
          {vm.pending.map((doc) => (
            <li key={doc.id}>{doc.title}{doc.detail ? ` — ${doc.detail}` : ''}</li>
          ))}
        </ul>
      ) : null}

      <ul className="legal-package-panel__docs">
        {vm.documents.map((doc) => (
          <li
            key={doc.id}
            className={doc.ready ? 'is-ready' : doc.required ? 'is-missing' : 'is-optional'}
            data-testid={`package-doc-${doc.operationalType}`}
            data-document-type={doc.documentType}
            data-status={doc.status}
            data-locked={doc.locked ? 'true' : 'false'}
          >
            <div>
              <strong>{doc.title}</strong>
              <small>
                {doc.documentType}
                {doc.required ? ' · Obrigatório' : ' · Opcional'}
                {' · '}
                {doc.statusLabel}
                {doc.locked ? ' · Locked' : ''}
                {doc.signed ? ' · Assinado' : ''}
                {doc.version ? ` · v${doc.version}` : ''}
                {doc.date ? ` · ${formatWhen(doc.date)}` : ''}
              </small>
            </div>
            {doc.action && !(doc.locked && doc.action.key === 'generate') ? (
              <button
                type="button"
                className="button secondary small"
                data-testid={`legal-doc-action-${doc.id}`}
                onClick={() => runAction(doc.action, doc)}
              >
                {doc.action.label}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="legal-package-panel__ctas">
        {primary ? (
          <button
            type="button"
            className="button primary small"
            data-testid={`legal-package-cta-${primary.key}`}
            onClick={() => runAction(primary)}
            disabled={primary.key === 'generate' && !perms.canGenerate}
          >
            {primary.label}
          </button>
        ) : null}
        {vm.actions.filter((a) => a.key !== primary?.key).map((action) => (
          <button
            key={action.key}
            type="button"
            className="button secondary small"
            data-testid={`legal-package-cta-${action.key}`}
            onClick={() => runAction(action)}
          >
            {action.label}
          </button>
        ))}
        {patientId && onNavigateProntuario ? (
          <button
            type="button"
            className="button secondary small"
            data-testid="legal-package-open-prontuario"
            onClick={() => onNavigateProntuario(buildProntuarioLegalPackagesUrl(patientId))}
          >
            Abrir no prontuário
          </button>
        ) : null}
      </div>
    </section>
  );
}
