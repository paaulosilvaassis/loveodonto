/** Documento jurídico A4 — aparência de contrato elaborado por escritório. */
export const PROFESSIONAL_CONTRACT_CSS = `
  @page {
    size: A4;
    margin: 20mm 18mm 24mm 18mm;
  }
  @page {
    @bottom-center {
      content: "Página " counter(page) " de " counter(pages);
      font-family: "Times New Roman", Times, serif;
      font-size: 9pt;
      color: #000;
    }
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .contract-document {
    max-width: 174mm;
    margin: 0 auto;
    padding: 0;
  }
  .print-running-header,
  .print-running-footer {
    display: none;
  }
  .doc-header {
    text-align: center;
    margin-bottom: 10pt;
    padding-bottom: 8pt;
    border-bottom: 1pt solid #000;
  }
  .doc-header img {
    max-width: 64px;
    max-height: 64px;
    object-fit: contain;
    margin: 0 auto 8pt;
    display: block;
  }
  .doc-header .clinic-name {
    margin: 0 0 4pt;
    font-size: 13pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .doc-header .header-line {
    margin: 0 0 2pt;
    font-size: 10.5pt;
    line-height: 1.35;
  }
  .doc-title-block {
    text-align: center;
    margin: 10pt 0 12pt;
  }
  .doc-title {
    margin: 0 0 6pt;
    font-size: 12.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .doc-meta-line {
    margin: 0 0 2pt;
    font-size: 11pt;
  }
  .clause-heading {
    margin: 14pt 0 6pt;
    font-size: 11pt;
    font-weight: 700;
    text-transform: uppercase;
    text-align: left;
  }
  .clause-p {
    margin: 0 0 8pt;
    text-align: justify;
    text-indent: 0;
    font-size: 12pt;
  }
  .clause-p.proc-item {
    margin: 0 0 4pt 12pt;
    text-indent: 0;
  }
  .clause-list {
    margin: 4pt 0 10pt 0;
    padding-left: 18pt;
    text-align: justify;
  }
  .clause-list li {
    margin-bottom: 4pt;
    font-size: 12pt;
  }
  .clause-list.alpha { list-style-type: lower-alpha; }
  .financial-lines {
    margin: 6pt 0 10pt 14pt;
    text-align: justify;
  }
  .financial-line {
    margin: 0 0 3pt;
    font-size: 12pt;
  }
  .legal-table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 12pt;
    font-size: 10.5pt;
    page-break-inside: auto;
  }
  .legal-table th,
  .legal-table td {
    border: 0.75pt solid #000;
    padding: 4pt 5pt;
    text-align: left;
    vertical-align: top;
  }
  .legal-table th {
    font-weight: 700;
    text-transform: uppercase;
    font-size: 9.5pt;
    background: #fff;
  }
  .legal-table td.center { text-align: center; }
  .legal-table td.right { text-align: right; }
  .legal-table tr { page-break-inside: avoid; }
  .image-auth {
    margin: 8pt 0 10pt 18pt;
    font-size: 12pt;
    letter-spacing: 0.02em;
  }
  .image-auth span { margin-right: 24pt; }
  .signature-section {
    margin-top: 36pt;
    margin-bottom: 8pt;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .signature-closing {
    margin-bottom: 10pt;
  }
  .signature-place {
    margin: 0 0 28pt;
    text-align: right;
    font-size: 12pt;
  }
  .signature-grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20pt;
    align-items: start;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .signature-grid-2 {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 40pt;
    margin-top: 36pt;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .signature-block {
    text-align: center;
    font-size: 10.5pt;
    line-height: 1.35;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .signature-line {
    border-top: 0.75pt solid #000;
    height: 0;
    margin: 0 0 8pt;
    width: 100%;
  }
  .signature-title {
    margin: 0 0 4pt;
    font-weight: 700;
    font-size: 9.5pt;
    text-transform: uppercase;
    line-height: 1.3;
  }
  .signature-block p {
    margin: 0 0 2pt;
    font-size: 10.5pt;
    line-height: 1.35;
  }
  @media print {
    html, body { background: #fff; }
    .contract-document {
      max-width: none;
      padding-top: 0;
      padding-bottom: 0;
    }
    .print-running-header {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 8.5pt;
      line-height: 1.3;
      border-bottom: 0.5pt solid #000;
      padding: 0 0 3pt;
      background: #fff;
    }
    .contract-document {
      padding-top: 14mm;
    }
    .signature-section,
    .signature-grid-3,
    .signature-grid-2,
    .signature-block {
      page-break-inside: avoid;
      break-inside: avoid-page;
    }
    .legal-table thead {
      display: table-header-group;
    }
  }
`;
