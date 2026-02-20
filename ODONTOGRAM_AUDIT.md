# ODONTOGRAM_AUDIT

## Stack identificada
- Frontend: React 19 + Vite 7 (`package.json`, `vite.config.js`).
- UI: CSS global (`src/index.css`) + componentes próprios (`src/components`).
- Persistência: LocalStorage via camada `db` (`src/db/index.js`), sem backend real.

## Localização dos módulos
- Prontuário: `src/pages/PatientChartPage.jsx` (rota `/prontuario/:patientId`).
- Odontograma core: `src/components/odontogram/OdontogramCore.jsx`.
- Geometria/FDI: `src/components/odontogram/odontogramGeometry.js`.
- Regras/constantes: `src/components/odontogram/odontogramConstants.js`.
- Serviço de persistência: `src/services/odontogramService.js`.
- SVG base (intocado): `src/assets/odontogram-base.svg`.

## Estratégia de persistência (Fase 1)
- Tabelas locais: `patientOdontograms` e `patientOdontogramHistory` em `src/db/schema.js`.
- Histórico append-only por `patientId` com registro de profissional, timestamp e descrição humana.
- Migração: `src/db/migrations.js` (DB_VERSION 7).

## Libs de UI/PDF encontradas
- `pdfmake` e `html2canvas` já presentes em `package.json` (PDF não implementado na Fase 1).

## Arquivos alterados
- `src/App.jsx`
- `src/index.css`
- `src/db/schema.js`
- `src/db/migrations.js`
- `src/services/odontogramService.js`
- `src/components/odontogram/OdontogramCore.jsx`
- `src/components/odontogram/odontogramConstants.js`
- `src/components/odontogram/odontogramGeometry.js`
- `src/pages/PatientChartPage.jsx`
- `src/assets/odontogram-base.svg`
