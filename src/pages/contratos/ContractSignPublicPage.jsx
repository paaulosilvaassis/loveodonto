import { useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import SignatureCanvas from '../../components/contracts/SignatureCanvas.jsx';
import {
  getContractBySignToken,
  markContractViewed,
  signContractViaLink,
} from '../../services/contractModuleService.js';
import { ContractDocumentPreview } from '../../contracts/ui/ContractUi.jsx';
import { contractHtmlWithSignatures } from '../../services/contractPdfService.js';

export default function ContractSignPublicPage() {
  const { token } = useParams();
  const resolved = useMemo(() => (token ? getContractBySignToken(token) : null), [token]);
  const [signerName, setSignerName] = useState('');
  const [signerCpf, setSignerCpf] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!resolved) {
    return (
      <div className="ctr-public-sign">
        <p>Link inválido ou não encontrado.</p>
      </div>
    );
  }

  if (resolved.expired) {
    return (
      <div className="ctr-public-sign">
        <h1>Link expirado</h1>
        <p>Solicite um novo link de assinatura à clínica.</p>
      </div>
    );
  }

  const { contract } = resolved;

  if (done) {
    return (
      <div className="ctr-public-sign">
        <h1>Assinatura registrada</h1>
        <p>Obrigado. Seu contrato foi assinado com sucesso.</p>
      </div>
    );
  }

  const handleSign = () => {
    setError('');
    try {
      markContractViewed({ id: 'public' }, contract.id);
      signContractViaLink(token, {
        signerName,
        signerCpf,
        signatureImageDataUrl: signatureData,
      });
      setDone(true);
    } catch (e) {
      setError(e?.message || 'Erro ao assinar.');
    }
  };

  return (
    <div className="ctr-public-sign">
      <header className="ctr-public-sign-header">
        <h1>Assinatura de contrato</h1>
        <p>{contract.contractNumber || contract.title}</p>
      </header>
      <ContractDocumentPreview html={contractHtmlWithSignatures(contract.renderedHtml)} />
      {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}
      <div className="ctr-public-sign-form">
        <label>
          Nome completo
          <input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
        </label>
        <label>
          CPF
          <input value={signerCpf} onChange={(e) => setSignerCpf(e.target.value)} />
        </label>
        <SignatureCanvas onChange={setSignatureData} />
        <button
          type="button"
          className="button primary"
          disabled={!signerName.trim() || !signatureData}
          onClick={handleSign}
        >
          Assinar documento
        </button>
      </div>
    </div>
  );
}
