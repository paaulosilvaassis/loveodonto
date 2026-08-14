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

export default function ContractDetailModal({ open, onOpenChange, contractId, expectedIdentity, actions }) {
  const details = useMemo(() => {
    if (!open || !contractId) return null;
    const identity = expectedIdentity?.contractId
      ? expectedIdentity
      : { contractId };
    return getContractDetails(contractId, identity);
  }, [open, contractId, expectedIdentity]);

  const { contract, signatures, events } = details || {};

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
          {events?.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Histórico</h3>
              <ul className="ctr-timeline">
                {events.slice(0, 15).map((e) => (
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
