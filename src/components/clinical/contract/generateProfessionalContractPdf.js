import { createId } from '../../../services/helpers.js';
import { logClinicalEvent } from '../../../services/clinicalService.js';
import { composeProfessionalClinicalContractHtml } from './composeProfessionalClinicalContract.js';

export async function generateProfessionalContractPdf({
  user,
  appointmentId,
  patientId,
  contractNumber,
  contractStatus,
}) {
  const htmlContent = composeProfessionalClinicalContractHtml({
    quoteId: appointmentId,
    patientId,
    contractNumber,
    contractStatus,
  });

  const fileName = `contrato-profissional-${appointmentId}-${new Date().toISOString().split('T')[0]}.html`;
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  logClinicalEvent(
    appointmentId,
    'contract_pdf_generated',
    { fileName, professional: true },
    user?.id,
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
    /* popup blocked */
  }

  return { htmlContent, fileName, id: createId('contract_doc') };
}
