import { useMemo } from 'react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
} from '../ui/Modal.jsx';
import { ContractStatusBadge, ContractDocumentPreview } from '../../contracts/ui/ContractUi.jsx';
import { getContractDetails } from '../../services/contractModuleService.js';
import { contractHtmlWithSignatures } from '../../services/contractPdfService.js';
import { matchesContractViewIdentity } from '../../contracts/contractViewIdentity.js';
import {
  describeContractLineage,
  getSigningAccessSnapshot,
  listLifecycleAudits,
} from '../../contracts/lifecycle/uiQuery.js';
import {
  contractLifecycleUiLabel,
  describeSigningAccessUi,
  lifecycleAuditUiLabel,
} from '../../contracts/lifecycle/uiLabels.js';
import { deriveCeremonyProgress } from '../../contracts/lifecycle/ceremonyProgress.js';

export default function ContractDetailModal({ open, onOpenChange, contractId, expectedIdentity, actions }) {
  const details = useMemo(() => {
    if (!open || !contractId) return null;
    const identity = expectedIdentity?.contractId
      ? expectedIdentity
      : { contractId };
    return getContractDetails(contractId, identity);
  }, [open, contractId, expectedIdentity]);

  const { contract, signatures, events } = details || {};
  const accessSnapshot = open && contractId ? getSigningAccessSnapshot(contractId) : { request: null, link: null };
  const access = describeSigningAccessUi(accessSnapshot);
  const lineage = describeContractLineage(contract);
  const progress = deriveCeremonyProgress({ contract });
  const lifecycleAudits = open && contractId ? listLifecycleAudits(contractId) : [];

  return (
    <ModalRoot open={open} onOpenChange={onOpenChange}>
      <ModalContent size="xl">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2 flex-wrap">
            {contract?.title || contract?.contractNumber || 'Contrato'}
            {contract?.status && <ContractStatusBadge status={contract.status} />}
          </ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-4 max-h-[65vh] overflow-y-auto">
          {open && contractId && !contract && (
            <p className="ctr-empty" role="alert">
              Contrato não encontrado ou identidade inconsistente.
            </p>
          )}
          {contract ? (
            <section className="ctr-timeline" data-testid="contract-lifecycle-summary">
              <p><strong>Contrato:</strong> {contractLifecycleUiLabel(contract.status)}</p>
              <p><strong>Acesso remoto:</strong> {access.label}</p>
              {progress.requiredCount ? <p><strong>Assinaturas:</strong> {progress.label}</p> : null}
              {lineage.successor ? (
                <p>Substituído pelo contrato {lineage.successor.number}</p>
              ) : null}
              {lineage.predecessor ? (
                <p>Reemissão do contrato {lineage.predecessor.number}</p>
              ) : null}
              {contract.voidReason ? (
                <p>
                  Invalidado{contract.voidedAt ? ` em ${new Date(contract.voidedAt).toLocaleString('pt-BR')}` : ''}.
                  Motivo: {contract.voidReason}
                </p>
              ) : null}
            </section>
          ) : null}
          {contract && matchesContractViewIdentity(contract, expectedIdentity || { contractId }) && (
            <ContractDocumentPreview html={contractHtmlWithSignatures(contract.renderedHtml)} />
          )}
          {signatures?.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Assinaturas</h3>
              <ul className="ctr-timeline">
                {signatures.map((s) => (
                  <li key={s.id} className="ctr-timeline-item">
                    <strong>{s.signerName}</strong>
                    <span className="ctr-timeline-meta">
                      {new Date(s.signedAt).toLocaleString('pt-BR')} · {s.signatureType}
                    </span>
                    {s.signatureImageUrl && (
                      <img src={s.signatureImageUrl} alt="Assinatura" className="ctr-signature-thumb" />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(events?.length > 0 || lifecycleAudits.length > 0) && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Histórico</h3>
              <ul className="ctr-timeline">
                {lifecycleAudits.slice(0, 12).map((audit) => (
                  <li key={audit.id} className="ctr-timeline-item">
                    <span>{lifecycleAuditUiLabel(audit.eventType)}</span>
                    <span className="ctr-timeline-meta">
                      {audit.actedAt ? new Date(audit.actedAt).toLocaleString('pt-BR') : ''}
                    </span>
                  </li>
                ))}
                {(events || []).slice(0, 15).map((e) => (
                  <li key={e.id} className="ctr-timeline-item">
                    <span>{e.description || e.eventType}</span>
                    <span className="ctr-timeline-meta">{new Date(e.createdAt).toLocaleString('pt-BR')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </ModalBody>
        {actions && (
          <ModalFooter>
            {actions(contract)}
          </ModalFooter>
        )}
      </ModalContent>
    </ModalRoot>
  );
}
