/**
 * Lista “Documentos do seu tratamento” na assinatura pública — Phase 10.21U.
 * Aceites individuais sem pré-marcar; CTA só quando required todos aceitos.
 */

import { useMemo, useState } from 'react';

/**
 * @param {object} props
 * @param {Array<{
 *   id: string,
 *   documentKey: string,
 *   title: string,
 *   required?: boolean,
 *   snapshotHtml?: string,
 * }>} props.documents
 * @param {Record<string, { viewed?: boolean, accepted?: boolean }>} [props.initialState]
 * @param {(docId: string, next: { viewed?: boolean, accepted?: boolean }) => void} [props.onChange]
 * @param {() => void} [props.onReadyToSign]
 * @param {boolean} [props.disabled]
 */
export function PublicPackageManifestDocuments({
  documents = [],
  initialState = {},
  onChange,
  onReadyToSign,
  disabled = false,
}) {
  const [state, setState] = useState(() => ({ ...initialState }));
  const [openDocId, setOpenDocId] = useState(null);

  const requiredIds = useMemo(
    () => documents.filter((d) => d.required !== false).map((d) => d.id),
    [documents],
  );

  const allRequiredAccepted = requiredIds.every((id) => state[id]?.accepted);

  function patch(docId, partial) {
    setState((prev) => {
      const next = {
        ...prev,
        [docId]: { ...prev[docId], ...partial },
      };
      onChange?.(docId, next[docId]);
      return next;
    });
  }

  if (!documents.length) return null;

  return (
    <section
      className="public-package-manifest-docs"
      data-testid="public-package-manifest-docs"
    >
      <h2>Documentos do seu tratamento</h2>
      <ul className="public-package-manifest-docs__list">
        {documents.map((doc) => {
          const st = state[doc.id] || {};
          const isOpen = openDocId === doc.id;
          return (
            <li key={doc.id} data-testid={`pkg-doc-${doc.documentKey}`}>
              <div className="public-package-manifest-docs__row">
                <strong>{doc.title}</strong>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setOpenDocId(isOpen ? null : doc.id);
                    if (!st.viewed) patch(doc.id, { viewed: true });
                  }}
                >
                  {isOpen ? 'Fechar' : 'Visualizar'}
                </button>
              </div>
              {isOpen && (
                <div
                  className="public-package-manifest-docs__snapshot"
                  data-testid={`pkg-doc-snapshot-${doc.documentKey}`}
                >
                  {/* Snapshot congelado — nunca template atual */}
                  <div
                    dangerouslySetInnerHTML={{
                      __html: String(doc.snapshotHtml || '<p>(conteúdo indisponível)</p>'),
                    }}
                  />
                </div>
              )}
              <label className="public-package-manifest-docs__accept">
                <input
                  type="checkbox"
                  checked={Boolean(st.accepted)}
                  disabled={disabled || !st.viewed}
                  onChange={(e) => {
                    if (e.target.checked && !st.viewed) return;
                    patch(doc.id, { accepted: e.target.checked });
                  }}
                  data-testid={`pkg-doc-accept-${doc.documentKey}`}
                />
                {' '}
                Li e aceito este documento
                {doc.required === false ? ' (opcional)' : ''}
              </label>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="public-package-manifest-docs__sign-cta"
        data-testid="pkg-sign-documents-cta"
        disabled={disabled || !allRequiredAccepted}
        onClick={() => onReadyToSign?.()}
      >
        Assinar documentos
      </button>
      {!allRequiredAccepted && (
        <p className="public-package-manifest-docs__hint">
          Visualize e aceite todos os documentos obrigatórios para continuar.
        </p>
      )}
    </section>
  );
}

export function buildPublicPackageDocumentsFromManifest(manifest, snapshots = new Map()) {
  if (!manifest?.documents?.length) return [];
  return [...manifest.documents]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((d) => ({
      id: d.id,
      documentKey: d.documentKey,
      title: d.title,
      required: d.required,
      snapshotHtml: snapshots.get(d.snapshotStoragePath) || '',
      contentHash: d.contentHash,
      documentType: d.documentType,
      documentVersion: d.documentVersion,
    }));
}
