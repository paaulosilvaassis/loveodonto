import { createId } from '../../../services/helpers.js';
import { saveBudget, logClinicalEvent, getBudget } from '../../../services/clinicalService.js';
import { resolveBudgetFinancials } from './budgetUtils.js';
import { buildBudgetPrintContext, buildBudgetPrintHtml } from './budgetPrintTemplate.js';

export async function generateBudgetPdf({
  user,
  appointmentId,
  budget,
  patient,
  appointment,
  professional,
  db,
  financials: financialsInput,
}) {
  const freshBudget = appointmentId ? (getBudget(appointmentId) || budget) : budget;
  const financials = financialsInput || resolveBudgetFinancials(freshBudget);
  const context = buildBudgetPrintContext({
    db,
    patient,
    professional,
    appointment,
    budget: freshBudget,
    financials,
  });
  const htmlContent = buildBudgetPrintHtml(context);

  const patientName = context.patient.name || 'Paciente';
  const fileName = `orcamento-${patientName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.html`;
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  const documentEntry = {
    id: createId('budget_doc'),
    type: 'pdf',
    format: 'html',
    fileName,
    htmlContent,
    createdAt: new Date().toISOString(),
    createdBy: user?.id || null,
    createdByName: user?.name || 'Usuário do sistema',
  };

  const nextBudget = { ...freshBudget, documents: [...(freshBudget.documents || []), documentEntry] };
  saveBudget(user, appointmentId, nextBudget);
  logClinicalEvent(
    appointmentId,
    'budget_pdf_generated',
    {
      totalValue: context.financial.total,
      fileName,
    },
    user.id
  );

  try {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      window.setTimeout(() => {
        try {
          printWindow.print();
        } catch {
          /* print blocked */
        }
      }, 500);
    }
  } catch {
    /* popup blocked — download already done */
  }

  return nextBudget;
}
