/**
 * Wizard operacional — Pacote documental do tratamento (Phase 10.16/10.17).
 * Linguagem clínica/operacional — sem enums, IDs ou termos internos.
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
  buildWizardViewModel,
  getWizardProgress,
  saveWizardProgress,
  getStepReadiness,
} from '../../../services/operationalContractWizardService.js';
import { labelOperationalUxStatus, resolveOperationalUxStatus } from '../../../contracts/operationalContractUi.js';
import {
  formatUxMessage,
  labelDocumentType,
  labelSignerRole,
} from '../../../contracts/operationalUxMessages.js';

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
                {labelDocumentType(item.documentType)}
                {item.required ? ' · Obrigatório' : ' · Opcional'}
                {item.detail ? ` · ${item.detail}` : ''}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className="ocw-info-row">
      <span>{label}</span>
      <strong>{value}</strong>
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
  const [packageTick, setPackageTick] = useState(0);

  const patientId = row?.patientId;
  const budgetId = row?.id;
  const appointmentId = row?.appointmentId;

  const view = useMemo(
    () => (open && row ? buildWizardViewModel(row) : null),
    [open, row, packageTick],
  );

  const documentPackage = useMemo(
    () => (open ? buildDocumentPackageForBudget({ appointmentId, budgetId, patientId }) : null),
    [open, appointmentId, budgetId, patientId, packageTick],
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
    status: view?.contractStatus || row?.contractStatus,
    hasPendency: documentPackage?.hasPendency && Boolean(view?.contractId || row?.contractId),
  });

  const readiness = getStepReadiness(step.id, {
    patientId,
    budget: validation?.budget || {
      planName: view?.treatmentName || row?.planName,
      procedures: view?.procedures?.length
        ? view.procedures
        : (row?.planName ? [{ name: row.planName }] : []),
      totalValue: row?.totalValue,
    },
    documentPackage: {
      ...documentPackage,
      items: (documentPackage?.items || []).map((item) => {
        if (item.id === 'contract_services' && (generateOpen || view?.contractId || row?.contractId)) {
          return { ...item, ready: true };
        }
        if (item.id === 'tcle' || item.id === 'lgpd') return { ...item, ready: true };
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
      setError(`${formatUxMessage('WIZARD_STEP_BLOCKED')} Falta: ${readiness.missing.join(', ')}.`);
      return;
    }
    if (step.id === 'documentos' && !(view?.contractId || row?.contractId) && !validation?.existingContract) {
      const check = validateBudgetContractGeneration({
        patientId,
        budgetId,
        appointmentId,
        allowExisting: false,
      });
      if (check.duplicateBlocked) {
        setError(check.errors[0] || formatUxMessage('CONTRACT_ALREADY_EXISTS'));
        setValidation(check);
        return;
      }
      if (!check.ok) {
        setError(check.errors[0] || formatUxMessage('BUDGET_INCOMPLETE'));
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

  const hasContract = Boolean(view?.contractId || row?.contractId);

  return (
    <>
      <ModalRoot open={open} onOpenChange={onOpenChange}>
        <ModalContent className="ocw-modal" size="lg">
          <ModalHeader>
            <ModalTitle>Pacote documental do tratamento</ModalTitle>
            <ModalDescription>
              {view?.patientName || 'Paciente'} · {view?.treatmentName || 'Tratamento'}
              {hasContract ? ` · ${labelOperationalUxStatus(uxStatus)}` : ''}
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
              <section className="ocw-panel" data-testid="ocw-step-dados">
                <h3>Dados</h3>
                <InfoRow label="Paciente" value={view?.patientName} />
                <InfoRow label="Responsável legal" value={view?.guardianName || 'Não informado (paciente titular)'} />
                <InfoRow label="Clínica" value={view?.clinicName} />
                <InfoRow label="Profissional" value={view?.professionalName} />
                <InfoRow label="Orçamento" value={view?.budgetNumber} />
                <p className="ocw-hint">Confira se os dados batem com o atendimento antes de avançar.</p>
              </section>
            ) : null}

            {step.id === 'tratamento' ? (
              <section className="ocw-panel" data-testid="ocw-step-tratamento">
                <h3>Tratamento</h3>
                <InfoRow label="Nome do tratamento" value={view?.treatmentName} />
                {view?.procedures?.length ? (
                  <div className="ocw-list-block">
                    <h4>Procedimentos</h4>
                    <ul>
                      {view.procedures.map((p, idx) => (
                        <li key={`${p.name}-${idx}`}>
                          {p.name}
                          {p.tooth ? ` · dente/região ${p.tooth}` : ''}
                          {p.quantity > 1 ? ` · qtd ${p.quantity}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="ocw-hint">Procedimentos serão detalhados no documento gerado.</p>
                )}
                {view?.teethRegions?.length ? (
                  <InfoRow label="Dentes/regiões" value={view.teethRegions.join(', ')} />
                ) : null}
                {view?.notes ? <InfoRow label="Observações" value={view.notes} /> : null}
              </section>
            ) : null}

            {step.id === 'financeiro' ? (
              <section className="ocw-panel" data-testid="ocw-step-financeiro">
                <h3>Financeiro</h3>
                <InfoRow label="Valor total" value={view?.financial?.totalLabel} />
                <InfoRow label="Entrada" value={view?.financial?.downPaymentLabel} />
                <InfoRow label="Saldo" value={view?.financial?.balanceLabel} />
                {view?.financial?.installmentCount != null ? (
                  <InfoRow label="Parcelas" value={`${view.financial.installmentCount}x`} />
                ) : null}
                <InfoRow label="Valor das parcelas" value={view?.financial?.installmentValueLabel} />
                <InfoRow label="Forma de pagamento" value={view?.financial?.paymentMethod} />
                <p className="ocw-hint">
                  Estes valores vêm do orçamento aprovado e serão registrados no contrato sem alteração nesta tela.
                </p>
              </section>
            ) : null}

            {step.id === 'documentos' ? (
              <section className="ocw-panel" data-testid="ocw-step-documentos">
                <PackageChecklist documentPackage={documentPackage} />
                <p className="ocw-hint">
                  Contrato, TCLE e privacidade ficam no mesmo pacote para a equipe, mas continuam documentos separados
                  (cada um com seu aceite).
                </p>
              </section>
            ) : null}

            {step.id === 'signatarios' ? (
              <section className="ocw-panel" data-testid="ocw-step-signatarios">
                <h3>Signatários</h3>
                <div className="ocw-signer-card">
                  <strong>{view?.patientName}</strong>
                  <span>{labelSignerRole('patient')} · Obrigatório</span>
                  <span>Contato: {view?.patientPhone || 'Atualizar no cadastro'}</span>
                  <span>Ordem: 1º a assinar</span>
                </div>
                {view?.guardianName ? (
                  <div className="ocw-signer-card">
                    <strong>{view.guardianName}</strong>
                    <span>{labelSignerRole('guardian')}</span>
                  </div>
                ) : null}
                <p className="ocw-hint">
                  Se faltar telefone ou e-mail do paciente, atualize o cadastro antes de enviar o link.
                </p>
              </section>
            ) : null}

            {step.id === 'revisao' ? (
              <section className="ocw-panel" data-testid="ocw-step-revisao">
                <h3>Revisão</h3>
                <InfoRow label="Paciente" value={view?.patientName} />
                <InfoRow label="Tratamento" value={view?.treatmentName} />
                <InfoRow label="Valor total" value={view?.financial?.totalLabel} />
                <InfoRow label="Condição" value={view?.financial?.installmentLabel || view?.financial?.paymentMethod} />
                <InfoRow label="Profissional" value={view?.professionalName} />
                <PackageChecklist documentPackage={documentPackage} />
                <p className="ocw-hint">
                  Eu enviaria isso ao paciente sem precisar voltar nenhuma etapa? Se sim, avance para Assinatura.
                </p>
              </section>
            ) : null}

            {step.id === 'assinatura' ? (
              <section className="ocw-panel" data-testid="ocw-step-assinatura">
                <h3>Assinatura</h3>
                <InfoRow label="Status" value={hasContract ? labelOperationalUxStatus(uxStatus) : 'Aguardando geração do contrato'} />
                <InfoRow label="Próxima ação" value={hasContract ? 'Enviar link pela fila ou pelo atendimento' : 'Gere os documentos na etapa Documentos'} />
                <p className="ocw-hint">
                  O paciente recebe um link simples no celular: resumo do tratamento, parcelas, documento, privacidade e assinatura — tudo na mesma página.
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
                {step.id === 'documentos' && !hasContract ? 'Gerar documentos' : 'Avançar'}
              </button>
            ) : (
              <button
                type="button"
                className="button primary"
                data-testid="ocw-finish"
                onClick={() => {
                  persist(stepIndex);
                  onOpenChange(false);
                  onSuccess?.({ wizardCompleted: true, contractId: view?.contractId || row?.contractId });
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
          setPackageTick((t) => t + 1);
          const next = Math.min(stepIndex + 1, WIZARD_STEPS.length - 1);
          setStepIndex(next);
          persist(next);
          onSuccess?.(contract);
        }}
      />
    </>
  );
}
