import React from 'react';
import { LEGACY_PROCEDURES_UNAVAILABLE } from '../../../contracts/legacyProcedureHtmlParser.js';

function dash(value) {
  if (value == null || value === '') return '—';
  return value;
}

function ProcedureCard({ row }) {
  return (
    <article className="ctr-public-proc-card" data-testid="public-sign-procedure-row">
      <h4>{row.name}</h4>
      <p><span>Dente/Região:</span> {dash(row.toothRegion)}</p>
      <p><span>Qtd.:</span> {dash(row.quantity)}</p>
      <p><span>Valor unitário:</span> {dash(row.unitValueFormatted)}</p>
      <p><span>Total:</span> {dash(row.totalFormatted)}</p>
    </article>
  );
}

export function PublicSigningProceduresList({ rows = [], fallback = false }) {
  if (fallback && !rows.length) {
    return (
      <div data-testid="public-sign-procedures">
        <h3>Procedimentos</h3>
        <p className="ctr-public-summary-note" data-testid="public-sign-procedures-fallback">
          {LEGACY_PROCEDURES_UNAVAILABLE}
        </p>
      </div>
    );
  }

  if (!rows.length) return null;

  return (
    <div data-testid="public-sign-procedures">
      <h3>Procedimentos</h3>
      <div className="ctr-public-proc-table-wrap">
        <table className="ctr-public-proc-table">
          <thead>
            <tr>
              <th>Procedimento</th>
              <th>Dente / Região</th>
              <th>Qtd.</th>
              <th>Valor unitário</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.name}-${index}`} data-testid="public-sign-procedure-row">
                <td>{row.name}</td>
                <td>{dash(row.toothRegion)}</td>
                <td>{dash(row.quantity)}</td>
                <td>{dash(row.unitValueFormatted)}</td>
                <td>{dash(row.totalFormatted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ctr-public-proc-cards">
        {rows.map((row, index) => (
          <ProcedureCard key={`${row.name}-card-${index}`} row={row} />
        ))}
      </div>
    </div>
  );
}

export function PublicSigningProfessionalBlock({ name, cro }) {
  if (!name && !cro) return null;
  return (
    <div className="ctr-public-professional" data-testid="public-sign-professional">
      <h3>Profissional responsável</h3>
      {name ? <p className="ctr-public-professional-name">{name}</p> : null}
      {cro ? <p className="ctr-public-professional-cro">{cro}</p> : null}
    </div>
  );
}
