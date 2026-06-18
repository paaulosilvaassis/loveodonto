import { useMemo } from 'react';
import { loadDb } from '../../db/index.js';
import { ContractTable } from '../../contracts/ui/ContractUi.jsx';
import { getGeneratedContract } from '../../services/contractService.js';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';

export default function ContractsAssinaturasPage() {
  const signatures = useMemo(() => {
    const db = loadDb();
    return [...(db.contractSignatures || [])].sort(
      (a, b) => new Date(b.signedAt) - new Date(a.signedAt),
    );
  }, []);

  const rows = signatures.map((s, index) => {
    const contract = getGeneratedContract(s.contractId);
    return {
      id: s.id,
      signer: s.signerName,
      cpf: s.signerCpf || '—',
      contract: formatFriendlyContractNumber(contract?.contractNumber, index + 1),
      type: s.signatureType,
      signed: new Date(s.signedAt).toLocaleString('pt-BR'),
      ip: s.ipAddress || '—',
    };
  });

  return (
    <div className="ctr-page">
      <ContractTable
        columns={[
          { key: 'signer', label: 'Signatário' },
          { key: 'cpf', label: 'CPF' },
          { key: 'contract', label: 'Contrato' },
          { key: 'type', label: 'Tipo' },
          { key: 'signed', label: 'Data/hora' },
          { key: 'ip', label: 'IP' },
        ]}
        rows={rows}
        emptyMessage="Nenhuma assinatura registrada."
      />
    </div>
  );
}
