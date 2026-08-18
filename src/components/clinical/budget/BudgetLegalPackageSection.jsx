/**
 * Bloco `Documentação jurídica` no orçamento aprovado.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { buildContractPackageViewModel } from '../../../contracts/legalPackageViewModel.js';
import { ensureLegalPackageForBudget } from '../../../contracts/legalPackageEnsure.js';
import { openLegalPackage } from '../../../contracts/legalPackageNavigation.js';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';

export function BudgetLegalPackageSection({
  appointmentId,
  budgetId,
  patientId,
  user = null,
  onOpenPackage = null,
}) {
  const navigate = useNavigate();
  if (!appointmentId || !budgetId) return null;

  const vm = buildContractPackageViewModel({
    appointmentId,
    budgetId,
    patientId,
    user,
  });

  const goToPackage = () => {
    if (typeof onOpenPackage === 'function') {
      onOpenPackage();
      return;
    }
    openLegalPackage(navigate, {
      appointmentId,
      budgetId,
      patientId,
      contractId: vm.contractId,
    });
  };

  const handleGenerate = () => {
    const result = ensureLegalPackageForBudget({
      user,
      patientId,
      appointmentId,
      budgetId,
    });
    goToPackage();
    return result;
  };

  const sendable = vm.actions.some((a) => a.key === 'send' || a.key === 'resend');

  return (
    <section
      className="budget-legal-package-section"
      data-testid="budget-legal-package-section"
    >
      <header>
        <h3>Documentação jurídica</h3>
        <span data-testid="budget-legal-status">{vm.packageStatusLabel}</span>
      </header>
      <p data-testid="budget-legal-progress">
        {vm.completedCount} / {vm.totalRequired} documentos obrigatórios
      </p>
      {vm.pending.length ? (
        <p className="budget-legal-package-section__pending">
          Pendências: {vm.pending.map((d) => d.title).join(', ')}
        </p>
      ) : null}
      <p>Assinatura eletrônica {vm.signatureLevelLabel}</p>
      <div className="budget-legal-package-section__ctas">
        {!vm.exists ? (
          <ClinicalBtn
            variant="primary"
            size="sm"
            data-testid="budget-legal-generate"
            onClick={handleGenerate}
          >
            Gerar contrato e consentimentos
          </ClinicalBtn>
        ) : (
          <ClinicalBtn
            variant="primary"
            size="sm"
            data-testid="budget-legal-open"
            onClick={goToPackage}
          >
            Abrir pacote jurídico
          </ClinicalBtn>
        )}
        {sendable ? (
          <ClinicalBtn
            variant="secondary"
            size="sm"
            data-testid="budget-legal-send"
            onClick={goToPackage}
          >
            Enviar para assinatura
          </ClinicalBtn>
        ) : null}
      </div>
    </section>
  );
}
