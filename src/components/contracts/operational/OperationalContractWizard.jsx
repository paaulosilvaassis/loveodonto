/**
 * Wizard operacional — Pacote documental do tratamento (C2/C5).
 * Não usa páginas técnicas *-v2.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../../ui/Modal.jsx';
import GenerateContractModal from '../GenerateContractModal.jsx';
import {
  WIZARD_STEPS,
  validateBudgetContractGeneration,
  buildDocumentPackageForBudget,
  getWizardProgress,
  saveWizardProgress,
  getStepReadiness,
} from '../../../services/operationalContractWizardService.js';
import { labelOperationalUxStatus, resolveOperationalUxStatus } from '../../../contracts/operationalContractUi.js';

function PackageChecklist({ documentPackage }) {
  if (!documentPackage) return null;
  return (
    <div className="ocw-package" data-testid="document-package">
      <h3>Pacote documental</h3>
      <ul>
        {documentPackage.items.map((item) => (
          <li key={item.id} className={item.ready ? 'is-ready' : item.required ? 'is-missing' : 'is-optional'}>
            <span aria-hidden>{item.ready ? '✓' : item.required ? '!' : '○'}</span>
            <div>
              <strong>{item.label}</strong>
              <small>
                {item.documentType}
                {item.version ? ` · v${item.version}` : ''}
                {item.detail ? ` · ${item.detail}` : ''}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OperationalContractWizard({
  open,
  onOpenChange,
  user,
  row,
  onSuccess,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [validation, setValidation] = useState(null);

  const patientId = row?.patientId;
  const budgetId = row?.id;
  const appointmentId = row?.appointmentId;

  const documentPackage = useMemo(
    () => (open ? buildDocumentPackageForBudget({ appointmentId, budgetId, patientId }) : null),
    [open, appointmentId, budgetId, patientId],
  );

  useEffect(() => {
    if (!open || !budgetId) return;
    const progress = getWizardProgress(budgetId);
    if (progress?.stepId) {
      const idx = WIZARD_STEPS.findIndex((s) => s.id === progress.stepId);
      if (idx >= 0) setStepIndex(idx);
    } else {
      setStepIndex(0);
    }
    const result = validateBudgetContractGeneration({
      patientId,
      budgetId,
      appointmentId,
      allowExisting: Boolean(row?.contractId),
    });
    setValidation(result);
    if (result.duplicateBlocked && !row?.contractId) {
      setError(result.errors[0]);
    } else {
      setError('');
    }
  }, [open, budgetId, patientId, appointmentId, row?.contractId]);

  const step = WIZARD_STEPS[stepIndex] || WIZARD_STEPS[0];
  const uxStatus = resolveOperationalUxStatus({
    status: row?.contractStatus,
    hasPendency: documentPackage?.hasPendency && Boolean(row?.contractId),
  });

  const readiness = getStepReadiness(step.id, {
    patientId,
    budget: validation?.budget || {
      planName: row?.planName,
      procedures: row?.planName ? [{ name: row.planName }] : [],
      totalValue: row?.totalValue,
    },
    documentPackage: {
      ...documentPackage,
      // No wizard de geração, documentos obrigatórios ficam prontos após GenerateContractModal
      items: (documentPackage?.items || []).map((item) => {
        if (item.id === 'contract_services' && (generateOpen || row?.contractId)) {
          return { ...item, ready: true };
        }
        if (item.id === 'tcle') {
          // TCLE pode estar pendente na clínica; não bloqueia avanço inicial do rascunho
          return { ...item, ready: true };
        }
        if (item.id === 'lgpd') return { ...item, ready: true };
        return item;
      }),
    },
    signers: patientId ? [{ role: 'patient' }] : [],
  });

  const persist = (nextIndex) => {
    const nextStep = WIZARD_STEPS[nextIndex] || step;
    saveWizardProgress({
      budgetId,
      appointmentId,
      patientId,
      stepId: nextStep.id,
      data: { lastStep: nextStep.id },
    });
  };

  const goNext = () => {
    setError('');
    if (!readiness.ready) {
      setError(`Complete: ${readiness.missing.join(', ')}`);
      return;
    }
    if (step.id === 'documentos' && !row?.contractId && !validation?.existingContract) {
      const check = validateBudgetContractGeneration({
        patientId,
        budgetId,
        appointmentId,
        allowExisting: false,
      });
      if (check.duplicateBlocked) {
        setError(check.errors[0] || 'Contrato já existe.');
        setValidation(check);
        return;
      }
      if (!check.ok) {
        setError(check.errors.join(' '));
        return;
      }
      setGenerateOpen(true);
      return;
    }
    const next = Math.min(stepIndex + 1, WIZARD_STEPS.length - 1);
    setStepIndex(next);
    persist(next);
  };

  const goBack = () => {
    const prev = Math.max(stepIndex - 1, 0);
    setStepIndex(prev);
    persist(prev);
  };

  return (
    <>
      <ModalRoot open={open} onOpenChange={onOpenChange}>
        <ModalContent className="ocw-modal" size="lg">
          <ModalHeader>
            <ModalTitle>Pacote documental do tratamento</ModalTitle>
            <ModalDescription>
              {row?.patientName || 'Paciente'} · {row?.planName || 'Tratamento'}
              {row?.contractId ? ` · ${labelOperationalUxStatus(uxStatus)}` : ''}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <ol className="ocw-steps" aria-label="Etapas do wizard">
              {WIZARD_STEPS.map((s, i) => (
                <li key={s.id} className={i === stepIndex ? 'is-current' : i < stepIndex ? 'is-done' : ''}>
                  <span>{i + 1}</span>
                  {s.label}
                </li>
              ))}
            </ol>

            {error ? <p className="ocw-error" role="alert">{error}</p> : null}

            {step.id === 'dados' ? (
              <section className="ocw-panel">
                <h3>Dados</h3>
                <p><strong>Paciente:</strong> {row?.patientName || '—'}</p>
                <p><strong>Telefone:</strong> {row?.patientPhone || '—'}</p>
                <p><strong>Orçamento:</strong> {row?.budgetNumber || budgetId}</p>
                <p><strong>Profissional:</strong> {row?.professionalName || '—'}</p>
              </section>
            ) : null}

            {step.id === 'tratamento' ? (
              <section className="ocw-panel">
                <h3>Tratamento</h3>
                <p><strong>Nome:</strong> {row?.planName || '—'}</p>
                <p><strong>Valor de referência:</strong> {row?.totalValue != null ? row.totalValue : '—'}</p>
                {row?.installmentLabel ? <p><strong>Condição:</strong> {row.installmentLabel}</p> : null}
              </section>
            ) : null}

            {step.id === 'financeiro' ? (
              <section className="ocw-panel">
                <h3>Financeiro</h3>
                <p>Os valores do contrato serão congelados no snapshot no momento da geração.</p>
                <p><strong>Total do orçamento:</strong> {row?.totalValue != null ? row.totalValue : '—'}</p>
                {row?.installmentLabel ? <p>{row.installmentLabel}</p> : null}
              </section>
            ) : null}

            {step.id === 'documentos' ? (
              <section className="ocw-panel">
                <PackageChecklist documentPackage={documentPackage} />
                <p className="ocw-hint">
                  Contrato, TCLE e LGPD permanecem documentos distintos (tipo, versão, hash e aceite próprios),
                  administrados neste mesmo pacote.
                </p>
              </section>
            ) : null}

            {step.id === 'signatarios' ? (
              <section className="ocw-panel">
                <h3>Signatários</h3>
                <p>Paciente (obrigatório): {row?.patientName}</p>
                <p className="ocw-hint">Outros signatários podem ser incluídos na etapa de envio de assinatura.</p>
              </section>
            ) : null}

            {step.id === 'revisao' ? (
              <section className="ocw-panel">
                <h3>Revisão</h3>
                <PackageChecklist documentPackage={documentPackage} />
                <p>Confira os dados antes de enviar para assinatura.</p>
              </section>
            ) : null}

            {step.id === 'assinatura' ? (
              <section className="ocw-panel">
                <h3>Assinatura</h3>
                <p>
                  Após gerar o contrato, use “Enviar para assinatura” no atendimento ou na fila de contratos.
                  O paciente receberá o link público com resumo do tratamento e condições.
                </p>
              </section>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <button type="button" className="button secondary" onClick={() => onOpenChange(false)}>
              Fechar
            </button>
            <button type="button" className="button secondary" onClick={goBack} disabled={stepIndex === 0}>
              Voltar
            </button>
            {stepIndex < WIZARD_STEPS.length - 1 ? (
              <button type="button" className="button primary" onClick={goNext} data-testid="ocw-next">
                {step.id === 'documentos' && !row?.contractId ? 'Gerar documentos' : 'Avançar'}
              </button>
            ) : (
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  persist(stepIndex);
                  onOpenChange(false);
                  onSuccess?.({ wizardCompleted: true, contractId: row?.contractId });
                }}
              >
                Concluir
              </button>
            )}
          </ModalFooter>
        </ModalContent>
      </ModalRoot>

      <GenerateContractModal
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        user={user}
        patientId={patientId}
        quoteSource="clinical_budget"
        quoteId={appointmentId}
        budgetId={budgetId}
        flow="clinical"
        onSuccess={(contract) => {
          setGenerateOpen(false);
          const next = Math.min(stepIndex + 1, WIZARD_STEPS.length - 1);
          setStepIndex(next);
          persist(next);
          onSuccess?.(contract);
        }}
      />
    </>
  );
}
