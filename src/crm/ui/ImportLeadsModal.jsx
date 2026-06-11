import { useEffect, useRef, useState } from 'react';
import { FileUp, Upload } from 'lucide-react';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '../../components/ui/Modal.jsx';
import Button from '../../components/Button.jsx';
import { createLead } from '../../services/crmService.js';
import { parseLeadsCsv } from '../leadsCsv.js';

const MAX_PREVIEW_ERRORS = 5;

const initialState = {
  fileName: '',
  parsedLeads: [],
  parseErrors: [],
  importing: false,
  fatalError: '',
};

/**
 * Importa leads via arquivo CSV (colunas: Nome, Telefone, Origem, Interesse, Observações).
 * Cria os leads no estágio inicial padrão; nenhum vira paciente automaticamente.
 */
export function ImportLeadsModal({ open, onClose, user, onImported }) {
  const [state, setState] = useState(initialState);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) setState(initialState);
  }, [open]);

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { leads, errors } = parseLeadsCsv(String(reader.result || ''));
      setState((prev) => ({
        ...prev,
        fileName: file.name,
        parsedLeads: leads,
        parseErrors: errors,
        fatalError: '',
      }));
    };
    reader.onerror = () => {
      setState((prev) => ({ ...prev, fatalError: 'Não foi possível ler o arquivo. Tente novamente.' }));
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImport = () => {
    setState((prev) => ({ ...prev, importing: true, fatalError: '' }));
    let created = 0;
    try {
      state.parsedLeads.forEach((payload) => {
        createLead(user, payload);
        created += 1;
      });
      onImported?.(created);
      onClose();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        importing: false,
        fatalError: `${created} lead(s) importado(s) antes do erro: ${err?.message || 'falha ao importar.'}`,
      }));
    }
  };

  const { fileName, parsedLeads, parseErrors, importing, fatalError } = state;

  return (
    <ModalRoot open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <ModalHeader>
          <ModalTitle>Importar leads</ModalTitle>
          <ModalDescription>
            Envie um arquivo CSV com as colunas Nome e Telefone (Origem, Interesse e Observações são opcionais).
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          {fatalError && <div className="crm-captacao-modal-error" role="alert">{fatalError}</div>}

          <div className="crm-leads-import-dropzone">
            <FileUp size={28} aria-hidden="true" />
            <p>{fileName || 'Selecione o arquivo CSV exportado da sua planilha.'}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="crm-leads-import-input"
              aria-label="Arquivo CSV de leads"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Escolher arquivo
            </Button>
          </div>

          {fileName && (
            <div className="crm-leads-import-summary" role="status">
              <p>
                <strong>{parsedLeads.length}</strong> lead(s) válido(s) encontrados
                {parseErrors.length > 0 && <> · <strong>{parseErrors.length}</strong> linha(s) com problema</>}
              </p>
              {parseErrors.length > 0 && (
                <ul className="crm-leads-import-errors">
                  {parseErrors.slice(0, MAX_PREVIEW_ERRORS).map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                  {parseErrors.length > MAX_PREVIEW_ERRORS && (
                    <li>… e mais {parseErrors.length - MAX_PREVIEW_ERRORS} problema(s).</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={importing}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            icon={Upload}
            loading={importing}
            disabled={!parsedLeads.length}
            onClick={handleImport}
          >
            Importar {parsedLeads.length > 0 ? `${parsedLeads.length} lead(s)` : 'leads'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
}
