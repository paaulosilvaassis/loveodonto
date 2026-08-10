/**
 * Suporte ao wizard operacional (Phase 10.21M):
 * - espelhamento financeiro do orçamento/contrato
 * - pendências de finalização antecipadas
 */

import { loadDb } from '../db/index.js';
import {
  getAcceptedOption,
  formatPaymentOptionLabel,
  calcOptionFinalValue,
  calcPlannedValue,
} from '../components/clinical/budget/budgetUtils.js';
import { mergeContractAttachedTcleIds } from './clinicalTcleAttachmentService.js';
import { validateContractGeneration } from './contractValidationService.js';

/**
 * Pendências que bloqueiam finalizeGeneratedContract — antecipadas no wizard.
 * Não remove regras; apenas expõe o mesmo checklist strict antes do clique final.
 */
export function listWizardFinalizePrerequisites({
  patientId,
  appointmentId,
  currentUser = null,
  contractId = null,
} = {}) {
  if (!patientId || !appointmentId) {
    return {
      ok: false,
      items: [{
        id: 'context',
        label: 'Paciente e atendimento',
        group: 'contrato',
        action: 'fix_patient_data',
        ctaLabel: 'Corrigir dados',
        targetStepId: 'dados',
      }],
    };
  }

  const contract = contractId
    ? (loadDb().generatedContracts || []).find((c) => c.id === contractId) || null
    : null;
  const attachedTcleIds = mergeContractAttachedTcleIds(contract, {
    patientId,
    appointmentId,
  });

  let readiness;
  try {
    readiness = validateContractGeneration({
      quoteSource: 'clinical_budget',
      quoteId: appointmentId,
      patientId,
      currentUser,
      htmlPreview: '',
      attachedTcleIds,
      strict: true,
    });
  } catch {
    return { ok: false, items: [] };
  }

  const items = (readiness.missing || [])
    .filter((m) => !m.warning)
    .map((m) => {
      const isTcle = m.group === 'tcle' || /^tcle:/i.test(String(m.tag || ''));
      const isAddress = /endereço|endereco/i.test(String(m.label || ''))
        || /Endereco|endereco/i.test(String(m.tag || ''));
      if (isTcle) {
        return {
          id: m.tag || m.label,
          label: m.label,
          hint: m.hint || null,
          group: 'tcle',
          action: 'add_document',
          ctaLabel: 'Adicionar documento',
          targetStepId: 'documentos',
        };
      }
      if (isAddress || m.group === 'paciente') {
        return {
          id: m.tag || m.label,
          label: m.label,
          hint: m.hint || null,
          group: m.group || 'paciente',
          action: 'fix_patient_data',
          ctaLabel: 'Corrigir dados',
          targetStepId: 'dados',
        };
      }
      return {
        id: m.tag || m.label,
        label: m.label,
        hint: m.hint || null,
        group: m.group || 'contrato',
        action: 'fix_patient_data',
        ctaLabel: 'Corrigir dados',
        targetStepId: 'dados',
      };
    });

  return {
    ok: items.length === 0,
    items,
    canFinalize: readiness.ok,
  };
}

function firstFiniteNumber(...candidates) {
  for (const value of candidates) {
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/**
 * Resolve financeiro do wizard a partir do snapshot do contrato (quando existe)
 * e, se faltar, dos dados já gravados no orçamento/condição aceita — sem recalcular.
 */
export function resolveWizardFinancialDisplay({
  budget = null,
  contract = null,
  row = {},
} = {}) {
  const financial = contract?.financialSnapshotJson || {};
  const accepted = getAcceptedOption(budget);
  const planned = budget ? calcPlannedValue(budget.procedures || []) : NaN;
  const acceptedTotal = accepted
    ? calcOptionFinalValue(accepted, Number.isFinite(planned) ? planned : 0)
    : NaN;

  const total = firstFiniteNumber(
    contract?.totalValueSnapshot,
    financial.valorTotal,
    row.totalValue,
    budget?.totalValue,
    accepted?.total,
    acceptedTotal,
  );

  const snapEntradaRaw = financial.entrada;
  const snapEntradaDefined = snapEntradaRaw != null && snapEntradaRaw !== '';
  const budgetEntrada = firstFiniteNumber(accepted?.entry, accepted?.downPayment);
  const entrada = snapEntradaDefined && Number(snapEntradaRaw) > 0
    ? Number(snapEntradaRaw)
    : firstFiniteNumber(budgetEntrada, snapEntradaRaw);

  const parcelas = Array.isArray(financial.parcelas) ? financial.parcelas : [];
  const installmentCount = firstFiniteNumber(
    financial.financiamentos?.[0]?.installments_count,
    parcelas[0]?.total_installments,
    parcelas.filter((p) => !/entrada/i.test(String(p.description || ''))).length || null,
    accepted?.installments,
  );

  const installmentValue = firstFiniteNumber(
    parcelas.find((p) => p.net_amount != null || p.original_amount != null)?.net_amount,
    parcelas.find((p) => p.net_amount != null || p.original_amount != null)?.original_amount,
    accepted?.installmentValue,
  );

  const balance = Number.isFinite(total) && Number.isFinite(entrada)
    ? Math.max(total - entrada, 0)
    : NaN;

  const paymentMethod = financial.formaPagamento
    || (accepted ? formatPaymentOptionLabel(accepted) : null)
    || row.installmentLabel
    || 'Conforme orçamento';

  return {
    total,
    entrada,
    balance,
    installmentCount: Number.isFinite(installmentCount) ? installmentCount : null,
    installmentValue: Number.isFinite(installmentValue) ? installmentValue : null,
    paymentMethod,
    installmentLabel: row.installmentLabel || (accepted ? formatPaymentOptionLabel(accepted) : null),
  };
}
