import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSignature,
  FileText,
  Send,
  XCircle,
  ChevronDown,
  User,
  Building2,
  Stethoscope,
  DollarSign,
  Scale,
  Shield,
  PenLine,
  History,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import GenerateContractModal from '../contracts/GenerateContractModal.jsx';
import { ClinicalStageShell, ClinicalBtn } from './ClinicalStageShell.jsx';
import { ContractBlockModal } from './contract/ContractBlockModal.jsx';
import { formatContractEventLabel } from './contract/contractEventLabels.js';
import { linkFinancingToClinicalContract } from '../../services/clinicalBudgetFinancingIntegration.js';
import { loadDb } from '../../db/index.js';
import { getPatient, PENDING_FIELDS_MAP } from '../../services/patientService.js';
import {
  getContractStatusForQuote,
  getContractDetails,
  sendContractForSignature,
  cancelGeneratedContract,
} from '../../services/contractModuleService.js';
import {
  CONTRACT_STATUS,
  CONTRACT_STATUS_LABELS,
} from '../../contracts/contractConstants.js';
import { formatCurrencyBRL } from '../../utils/currency.js';
import { formatCpf, formatCnpj } from '../../utils/validators.js';
import {
  getAcceptedOption,
  resolveBudgetFinancials,
} from './budget/budgetUtils.js';
import { getPaymentOptionTitle } from './budget/budgetEventLabels.js';
import { contractHtmlWithSignatures } from '../../services/contractPdfService.js';
import { composeProfessionalClinicalContractHtml } from './contract/composeProfessionalClinicalContract.js';
import { generateProfessionalContractPdf } from './contract/generateProfessionalContractPdf.js';
import { buildFinancialSection } from './contract/clinicalContractSchedule.js';
import { LINKED_DOCUMENTS, LEGAL_CONTRACT_TEXTS } from './contract/professionalContractClauses.js';
import { detectTreatmentType, getTreatmentTypeLabel } from './contract/detectTreatmentType.js';

const CLAUSE_GROUPS = [
  { title: '1. Das Partes', items: ['Qualificação da clínica e do paciente'] },
  { title: '2. Do Objeto', items: [LEGAL_CONTRACT_TEXTS.object] },
  { title: '3. Dos Procedimentos', items: ['Tabela de procedimentos aprovados'] },
  { title: '4. Da Duração', items: [LEGAL_CONTRACT_TEXTS.duration] },
  { title: '5. Do Pagamento', items: ['Condição financeira integral + cronograma de parcelas'] },
  { title: '6. Das Garantias', items: [LEGAL_CONTRACT_TEXTS.warrantiesGeneral] },
  { title: '7. Obrigações do Paciente', items: LEGAL_CONTRACT_TEXTS.patientObligations },
  { title: '8. Obrigações da Clínica', items: LEGAL_CONTRACT_TEXTS.clinicObligations },
  { title: '9. Da Inadimplência', items: LEGAL_CONTRACT_TEXTS.default },
  { title: '10. Da Rescisão', items: LEGAL_CONTRACT_TEXTS.rescission },
  { title: '11. Da LGPD', items: LEGAL_CONTRACT_TEXTS.lgpd },
  { title: '12. Do Uso de Imagem', items: [LEGAL_CONTRACT_TEXTS.imageUse] },
  { title: '13. Do Foro', items: [LEGAL_CONTRACT_TEXTS.forum] },
];

const LINKED_TERMS = LINKED_DOCUMENTS.map((label, index) => ({
  id: `doc-${index}`,
  label,
}));

function ContractAccordionSection({ title, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`clinical-contract-section${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="clinical-contract-section-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="clinical-contract-section-title">
          {Icon ? <Icon size={16} /> : null}
          {title}
        </span>
        <ChevronDown size={16} className="clinical-contract-section-chevron" />
      </button>
      {open ? <div className="clinical-contract-section-body">{children}</div> : null}
    </section>
  );
}

function InfoGrid({ rows }) {
  return (
    <dl className="clinical-contract-info-grid">
      {rows.filter((row) => row.value).map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function resolveContractReadiness({ budgetApproved, budget, professionalId, pendingCriticalFields }) {
  const reasons = [];
  if (!budgetApproved) reasons.push('Orçamento não aprovado.');
  if (!getAcceptedOption(budget)) reasons.push('Forma de pagamento não escolhida.');
  if (pendingCriticalFields.length) reasons.push('Cadastro do paciente incompleto.');
  if (!professionalId) reasons.push('Profissional responsável não definido.');
  return { ready: reasons.length === 0, reasons };
}

function resolveUiStatus({ budgetApproved, readiness, linkedContract }) {
  if (!budgetApproved) {
    return { key: 'blocked', label: 'Bloqueado', tone: 'blocked' };
  }
  if (!readiness.ready) {
    return { key: 'blocked', label: 'Bloqueado', tone: 'blocked' };
  }
  if (!linkedContract) {
    return { key: 'ready', label: 'Liberado para geração', tone: 'ready' };
  }
  if (linkedContract.status === CONTRACT_STATUS.DRAFT) {
    return { key: 'draft', label: 'Em edição', tone: 'draft' };
  }
  if ([CONTRACT_STATUS.SENT, CONTRACT_STATUS.VIEWED].includes(linkedContract.status)) {
    return { key: 'waiting', label: 'Aguardando assinatura', tone: 'waiting' };
  }
  if (linkedContract.status === CONTRACT_STATUS.SIGNED) {
    return { key: 'signed', label: 'Assinado', tone: 'signed' };
  }
  if (linkedContract.status === CONTRACT_STATUS.CANCELED) {
    return { key: 'canceled', label: 'Cancelado', tone: 'canceled' };
  }
  if (linkedContract.status === CONTRACT_STATUS.GENERATED) {
    return { key: 'generated', label: 'Gerado', tone: 'ready' };
  }
  return {
    key: linkedContract.status,
    label: CONTRACT_STATUS_LABELS[linkedContract.status] || 'Em andamento',
    tone: 'draft',
  };
}

function formatPhone(phones = []) {
  const main = phones.find((p) => p.is_primary) || phones[0];
  if (!main) return '';
  return `(${main.ddd || ''}) ${main.number || ''}`.trim();
}

function formatClinicAddress(addresses = []) {
  const addr = addresses.find((a) => a.principal) || addresses[0];
  if (!addr) return '';
  const cityUf = [addr.cidade, addr.uf].filter(Boolean).join('/');
  return [addr.logradouro, addr.numero, addr.bairro, cityUf, addr.cep ? `CEP ${addr.cep}` : '']
    .filter(Boolean)
    .join(', ');
}

export function ClinicalContractSection({
  appointmentId,
  patientId,
  user,
  budgetApproved,
  budget,
  appointment,
  professional,
}) {
  const navigate = useNavigate();
  const db = loadDb();
  const fullPatient = patientId ? getPatient(patientId) : null;
  const pendingCriticalFields = fullPatient?.profile?.pendingCriticalFields || [];
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  const linkedContract = useMemo(
    () => getContractStatusForQuote(appointmentId, 'clinical_budget'),
    [appointmentId, historyKey],
  );

  const contractDetails = useMemo(
    () => (linkedContract?.id ? getContractDetails(linkedContract.id) : null),
    [linkedContract?.id, historyKey],
  );

  const financials = useMemo(() => resolveBudgetFinancials(budget || { procedures: [] }), [budget]);
  const accepted = financials.accepted;

  const paymentPreview = useMemo(() => {
    if (!accepted || !patientId) return null;
    return buildFinancialSection(
      accepted,
      financials.originalValue,
      patientId,
      [appointmentId, budget?.id].filter(Boolean),
    );
  }, [accepted, financials.originalValue, patientId, appointmentId, budget?.id]);

  const treatmentTypeLabel = useMemo(() => {
    const type = detectTreatmentType({
      planName: budget?.planName || '',
      procedures: budget?.procedures || [],
    });
    return getTreatmentTypeLabel(type);
  }, [budget?.planName, budget?.procedures]);

  const readiness = useMemo(
    () => resolveContractReadiness({
      budgetApproved,
      budget,
      professionalId: appointment?.professionalId,
      pendingCriticalFields,
    }),
    [budgetApproved, budget, appointment?.professionalId, pendingCriticalFields],
  );

  const uiStatus = resolveUiStatus({ budgetApproved, readiness, linkedContract });

  const clinic = db.clinicProfile || {};
  const clinicDoc = db.clinicDocumentation || {};
  const clinicPhone = (db.clinicPhones || []).find((p) => p.principal) || db.clinicPhones?.[0];

  const professionalName =
    professional?.nomeCompleto || professional?.name || professional?.apelido || '—';
  const professionalCro = professional?.conselhoNumero || professional?.cro || '—';
  const professionalSpecialty = Array.isArray(professional?.especialidades)
    ? professional.especialidades.join(', ')
    : (professional?.especialidade || '—');

  const guardianName =
    fullPatient?.profile?.guardian_full_name
    || fullPatient?.profile?.legal_guardian_name
    || '';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openContractFlow = () => {
    if (!readiness.ready) {
      if (pendingCriticalFields.length) setBlockModalOpen(true);
      else showToast(readiness.reasons[0] || 'Contrato bloqueado.', 'error');
      return;
    }
    setContractModalOpen(true);
  };

  const handleViewPdf = () => {
    const html = linkedContract?.renderedHtml || linkedContract?.editedHtml;
    if (html) {
      const viewWindow = window.open('', '_blank');
      if (viewWindow) {
        viewWindow.document.write(contractHtmlWithSignatures(html));
        viewWindow.document.close();
      }
      return;
    }
    if (!readiness.ready) {
      showToast('Complete os requisitos antes de visualizar.', 'error');
      return;
    }
    handlePreviewContract();
  };

  const handlePreviewContract = () => {
    try {
      const html = composeProfessionalClinicalContractHtml({
        quoteId: appointmentId,
        patientId,
        contractNumber: linkedContract?.contractNumber,
        contractStatus: linkedContract?.status || 'draft',
      });
      const viewWindow = window.open('', '_blank');
      if (viewWindow) {
        viewWindow.document.write(html);
        viewWindow.document.close();
      }
    } catch (error) {
      showToast(error.message || 'Erro ao gerar preview.', 'error');
    }
  };

  const handleDownloadPdf = async () => {
    if (!readiness.ready || !user) return;
    try {
      await generateProfessionalContractPdf({
        user,
        appointmentId,
        patientId,
        contractNumber: linkedContract?.contractNumber,
        contractStatus: linkedContract?.status,
      });
      showToast('Contrato profissional gerado.');
    } catch (error) {
      showToast(error.message || 'Erro ao gerar PDF.', 'error');
    }
  };

  const handleSendSignature = () => {
    if (!linkedContract?.id || !user) return;
    try {
      sendContractForSignature(user, linkedContract.id);
      setHistoryKey((k) => k + 1);
      showToast('Contrato enviado para assinatura.');
    } catch (error) {
      showToast(error.message || 'Erro ao enviar contrato.', 'error');
    }
  };

  const handleCancelContract = () => {
    if (!linkedContract?.id || !user) return;
    if (!window.confirm('Cancelar este contrato?')) return;
    try {
      cancelGeneratedContract(user, linkedContract.id);
      setHistoryKey((k) => k + 1);
      showToast('Contrato cancelado.');
    } catch (error) {
      showToast(error.message || 'Erro ao cancelar contrato.', 'error');
    }
  };

  const historyEvents = (contractDetails?.events || [])
    .map((event) => ({ event, label: formatContractEventLabel(event) }))
    .filter((item) => item.label);

  const canGenerate = readiness.ready;
  const canEdit = linkedContract?.status === CONTRACT_STATUS.DRAFT;
  const canView = readiness.ready;
  const canPreview = readiness.ready;
  const canSend = linkedContract?.status === CONTRACT_STATUS.GENERATED;
  const canCancel = linkedContract
    && ![CONTRACT_STATUS.SIGNED, CONTRACT_STATUS.CANCELED].includes(linkedContract.status);

  return (
    <>
      <ClinicalStageShell
        title="Contrato"
        description="Formalização jurídica do tratamento aprovado e da condição de pagamento escolhida."
        secondaryActions={(
          <>
            <ClinicalBtn variant="secondary" icon={FileSignature} onClick={openContractFlow} disabled={!canGenerate}>
              Gerar contrato
            </ClinicalBtn>
            {canPreview ? (
              <ClinicalBtn variant="secondary" icon={FileText} onClick={handlePreviewContract}>
                Pré-visualizar
              </ClinicalBtn>
            ) : null}
            {canPreview ? (
              <ClinicalBtn variant="secondary" icon={FileText} onClick={handleDownloadPdf}>
                Baixar PDF
              </ClinicalBtn>
            ) : null}
            {canEdit ? (
              <ClinicalBtn variant="secondary" icon={PenLine} onClick={openContractFlow}>
                Editar contrato
              </ClinicalBtn>
            ) : null}
            {canView ? (
              <ClinicalBtn variant="secondary" icon={FileText} onClick={handleViewPdf}>
                Visualizar PDF
              </ClinicalBtn>
            ) : null}
            {canSend ? (
              <ClinicalBtn variant="secondary" icon={Send} onClick={handleSendSignature}>
                Enviar para assinatura
              </ClinicalBtn>
            ) : null}
            {canCancel ? (
              <ClinicalBtn variant="danger" icon={XCircle} onClick={handleCancelContract}>
                Cancelar contrato
              </ClinicalBtn>
            ) : null}
          </>
        )}
      >
        {!budgetApproved ? (
          <div className="clinical-contract-blocked-card">
            <Lock size={36} strokeWidth={1.25} />
            <h3>Contrato bloqueado</h3>
            <p>Para gerar o contrato, aprove o orçamento e selecione a condição de pagamento.</p>
          </div>
        ) : !readiness.ready ? (
          <div className="clinical-contract-blocked-card">
            <Lock size={36} strokeWidth={1.25} />
            <h3>Contrato bloqueado</h3>
            <p>Para gerar o contrato, aprove o orçamento e selecione a condição de pagamento.</p>
            <ul className="clinical-contract-block-reasons">
              {readiness.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="clinical-contract-v2">
            <div className={`clinical-contract-status-banner tone-${uiStatus.tone}`}>
              <CheckCircle2 size={18} />
              <div>
                <strong>Status do contrato</strong>
                <span>{uiStatus.label}</span>
                {linkedContract?.contractNumber ? (
                  <em>Nº {linkedContract.contractNumber}</em>
                ) : null}
              </div>
            </div>

            <ContractAccordionSection title="Dados do paciente" icon={User} defaultOpen>
              <InfoGrid rows={[
                { label: 'Nome', value: fullPatient?.profile?.full_name || fullPatient?.full_name || '—' },
                {
                  label: 'CPF',
                  value: fullPatient?.profile?.cpf
                    ? formatCpf(String(fullPatient.profile.cpf).replace(/\D/g, ''))
                    : '—',
                },
                { label: 'Telefone', value: formatPhone(fullPatient?.phones) || '—' },
                { label: 'Responsável legal', value: guardianName || '—' },
              ]} />
            </ContractAccordionSection>

            <ContractAccordionSection title="Dados da clínica" icon={Building2}>
              <InfoGrid rows={[
                {
                  label: 'Nome',
                  value: clinic.nomeClinica || clinic.nomeFantasia || clinic.razaoSocial || '—',
                },
                {
                  label: 'CNPJ',
                  value: clinicDoc.cnpj
                    ? formatCnpj(String(clinicDoc.cnpj).replace(/\D/g, ''))
                    : '—',
                },
                { label: 'Endereço', value: formatClinicAddress(db.clinicAddresses) || '—' },
                { label: 'Telefone', value: clinicPhone?.numero ? formatPhone([clinicPhone]) : '—' },
              ]} />
            </ContractAccordionSection>

            <ContractAccordionSection title="Profissional responsável" icon={Stethoscope}>
              <InfoGrid rows={[
                { label: 'Nome', value: professionalName },
                { label: 'CRO', value: professionalCro },
                { label: 'Especialidade', value: professionalSpecialty },
              ]} />
            </ContractAccordionSection>

            <ContractAccordionSection title="Orçamento aprovado" icon={DollarSign} defaultOpen>
              <InfoGrid rows={[
                { label: 'Plano / tratamento', value: budget?.planName || '—' },
                { label: 'Tipo detectado', value: treatmentTypeLabel },
                {
                  label: 'Procedimentos aprovados',
                  value: `${budget?.procedures?.length || 0} procedimento(s)`,
                },
                { label: 'Valor total', value: formatCurrencyBRL(financials.originalValue) },
                { label: 'Desconto', value: formatCurrencyBRL(Math.max(0, financials.originalValue - financials.finalValue)) },
                { label: 'Valor final', value: formatCurrencyBRL(financials.finalValue) },
                {
                  label: 'Forma de pagamento escolhida',
                  value: accepted ? getPaymentOptionTitle(accepted) : '—',
                },
              ]} />
              {paymentPreview?.detailRows?.length ? (
                <div className="clinical-contract-payment-details">
                  {paymentPreview.detailRows.map((row) => (
                    <div key={row.label} className="clinical-contract-payment-row">
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
              {paymentPreview?.schedule?.length ? (
                <table className="clinical-contract-schedule-table">
                  <thead>
                    <tr>
                      <th>Parcela</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentPreview.schedule.map((row) => (
                      <tr key={`${row.label}-${row.dueDate}`}>
                        <td>{row.label}</td>
                        <td>{row.dueDateFormatted}</td>
                        <td>{row.amountFormatted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </ContractAccordionSection>

            <ContractAccordionSection title="Cláusulas do contrato" icon={Scale}>
              <div className="clinical-contract-clauses">
                {CLAUSE_GROUPS.map((group) => (
                  <div key={group.title} className="clinical-contract-clause-group">
                    <h4>{group.title}</h4>
                    <ul>
                      {group.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </ContractAccordionSection>

            <ContractAccordionSection title="Termos obrigatórios vinculados" icon={Shield}>
              <ul className="clinical-contract-terms-v2">
                {LINKED_TERMS.map((term) => (
                  <li key={term.id}>{term.label}</li>
                ))}
              </ul>
            </ContractAccordionSection>

            <ContractAccordionSection title="Assinaturas" icon={PenLine}>
              <InfoGrid rows={[
                { label: 'Paciente', value: fullPatient?.profile?.full_name || '—' },
                { label: 'Responsável legal', value: guardianName || '—' },
                { label: 'Profissional responsável', value: professionalName },
                { label: 'Testemunhas', value: 'Conforme modelo do contrato' },
              ]} />
            </ContractAccordionSection>

            {historyEvents.length ? (
              <ContractAccordionSection title="Histórico e auditoria" icon={History}>
                <ul className="clinical-contract-history">
                  {historyEvents.map(({ event, label }) => (
                    <li key={event.id}>
                      <time dateTime={event.createdAt}>
                        {new Date(event.createdAt).toLocaleString('pt-BR')}
                      </time>
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
              </ContractAccordionSection>
            ) : null}
          </div>
        )}
      </ClinicalStageShell>

      <GenerateContractModal
        open={contractModalOpen}
        onOpenChange={setContractModalOpen}
        user={user}
        patientId={patientId || ''}
        quoteSource="clinical_budget"
        quoteId={appointmentId}
        flow="clinical"
        onSuccess={(contract) => {
          if (contract?.id) {
            linkFinancingToClinicalContract(user, appointmentId, contract.id);
          }
          setHistoryKey((k) => k + 1);
        }}
      />

      <ContractBlockModal
        open={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        pendingFields={pendingCriticalFields}
        fieldsMap={PENDING_FIELDS_MAP}
        onFillPatient={() => {
          setBlockModalOpen(false);
          if (patientId) navigate(`/pacientes/cadastro/${patientId}?highlight=pending`);
        }}
      />

      {toast ? (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      ) : null}
    </>
  );
}
