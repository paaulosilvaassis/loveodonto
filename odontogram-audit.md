# Odontogram Audit

1) **Imagem base 3D**
   - `public/odontogram-3d.png` (referenciada em `src/components/odontogram/Odontogram3DInteractive.jsx`).

2) **Stack frontend/backend + padrões UI**
   - Frontend: React + Vite (`package.json`, `vite.config.js`).
   - UI: CSS global e componentes próprios (`src/index.css`, `src/components`).
   - Backend: não há backend real; persistência local via LocalStorage (`src/db/index.js`).

3) **Módulo atual de prontuário/odontograma**
   - Existe módulo de odontograma em `src/components/odontogram/`.
   - Integração no prontuário do paciente em `src/pages/PatientChartPage.jsx`.
   - Persistência por paciente em `src/services/patientChartService.js`.

4) **Persistência e contrato de API**
   - Persistência local em LocalStorage via camada `db` (`src/db/index.js`) e services (`src/services/*`).
   - Não há API REST/GraphQL real; services atuam como camada de domínio local.
   - Adapter para integração externa foi criado em `src/services/integrationProvider.js`.

5) **Regras clínicas periodontais**
   - Não havia regras explícitas no odontograma.
   - Defaults foram adicionados em `src/components/odontogram/periodontalDefaults.js` (sondagem em mm, sangramento/placa boolean, mobilidade 0–3, furca 0–3).

6) **Decíduos vs permanentes**
   - Não há suporte explícito a decíduos.
   - Feature-flag `deciduous=false` adicionada em `draftOdontogram.meta` no `PatientChartPage.jsx`.

7) **Exportação PDF**
   - Não havia exportação PDF (apenas CSV em `src/pages/ReportsPage.jsx`).
   - Bibliotecas adicionadas: `pdfmake` e `html2canvas` (via `package.json`).
   - Exportação implementada em `src/pages/PatientChartPage.jsx`.

8) **Painel lateral**
   - Drawer existente em `src/components/odontogram/ui/ToothEditDrawer.jsx`.
   - Mantém layout à direita e responsivo via CSS em `src/index.css`.

9) **Histórico e auditoria**
   - Histórico por dente e global já existem em `useOdontogramState.js` e `PatientChartPage.jsx`.
   - Filtro por data adicionado ao histórico global.

10) **Integração externa**
   - Não existia integração com sistemas externos.
   - Interface de integração com stubs adicionada em `src/services/integrationProvider.js`.
