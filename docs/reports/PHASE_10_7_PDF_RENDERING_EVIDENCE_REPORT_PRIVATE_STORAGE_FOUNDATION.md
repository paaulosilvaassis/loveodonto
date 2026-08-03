# PHASE_10.7 — PDF RENDERING, EVIDENCE REPORT AND PRIVATE STORAGE FOUNDATION

## 1. Baseline

| Item | Valor |
|------|--------|
| Branch | `main` |
| Commit base | `b95eff1` |
| Working tree | Alterações não commitadas das Phases 10.2–10.7 |
| Repo | `appgestaoodonto/` |
| Data | 2026-08-03 |

## 2. Auditoria

Somente leitura confirmou:

- PDF legado: `contractPdfService.js` (html2canvas + jsPDF) — browser, não determinístico; **não reutilizado**
- Dependências instaladas: `jspdf`, `html2canvas`, `pdfmake` — v2 usa renderer de teste próprio (sem nova instalação)
- Storage legado: clinic logos / clinical guides (buckets reais) — **não tocado**
- `ContractFile` / repos Phase 10.3 existentes; data URL rejeitada
- Hash documental Phase 10.5; evidências Phase 10.6
- Sem biblioteca QR Code; código de verificação abstrato in-memory
- Flags `contract_pdf_v2_enabled` / `contract_storage_v2_enabled` já existiam (default false)
- Migrations 028/029 **não aplicadas**; nenhuma tabela v2 em produção

## 3. Arquivos criados

### Domínio

- `src/domain/contracts/files/contract-file-limits.ts`
- `src/domain/contracts/files/contract-file-mime.ts`
- `src/domain/contracts/files/contract-file-names.ts`
- `src/domain/contracts/files/contract-storage-path.ts`
- `src/domain/contracts/files/contract-binary-hash.ts`
- `src/domain/contracts/files/contract-private-storage.ts`
- `src/domain/contracts/files/contract-file-integrity.service.ts`
- `src/domain/contracts/files/contract-verification-code.service.ts`
- `src/domain/contracts/rendering/contract-document-render.model.ts`
- `src/domain/contracts/rendering/contract-html.renderer.ts`
- `src/domain/contracts/rendering/contract-pdf.renderer.ts`
- `src/domain/contracts/artifacts/signature-evidence-report.ts`
- `src/domain/contracts/artifacts/contract-integrity-manifest.ts`
- `src/domain/contracts/artifacts/contract-artifact-memory.repository.ts`
- `src/domain/contracts/artifacts/contract-document-artifact.pipeline.ts`
- `src/domain/contracts/artifacts/documents-v2.harness.ts`

### API / UI / testes / docs

- `server/lib/contractDocumentsV2Api.js`
- `src/services/contractDocumentsV2Service.js`
- `src/pages/contratos/ContractsDocumentosV2Page.jsx`
- `src/__tests__/phase107PdfEvidenceStorageFoundation.test.js`
- `docs/reports/PHASE_10_7_PDF_RENDERING_EVIDENCE_REPORT_PRIVATE_STORAGE_FOUNDATION.md`

## 4. Arquivos alterados

- `files/contract-file.types.ts` — status/purpose/INTEGRITY_MANIFEST/ContractFileArtifact
- `contract.errors.ts` — códigos CONTRACT_* Phase 10.7
- `domain/contracts/index.ts` — exports
- `permissions/catalog.js` — permissões PDF (sem roleDefaults)
- `contractsShellConfig.js` / `ProtectedApp.jsx` — rota documentos-v2
- `server/index.js` — wiring endpoints (sem pipeline/storage real)
- `supabase/migrations/028` (+ espelhos) — `INTEGRITY_MANIFEST` no CHECK (não aplicada)

## 5. Render model

`createContractDocumentRenderModel(version, options, contractMeta)` — somente snapshots da versão; exige locked + documentHash; ordenação determinística; sem consultas externas.

## 6. HTML renderer

Sanitizado (sem script/iframe/handlers); CSS controlado; banner de demo; hash SHA-256 determinístico.

## 7. PDF renderer

Abstração `ContractPdfRenderer` + `createDeterministicTestPdfRenderer` (`%PDF-TEST-V2`).

**Não é PDF jurídico de produção.** Não usa jsPDF/html2canvas do legado.

## 8. PDF não assinado

Pipeline: versão bloqueada → model → HTML → PDF teste → storage memory → verify → `GENERATED_PDF`.

## 9. PDF assinado

Nova geração sobre mesma versão/hash; envelope COMPLETED; evidências; não sobrescreve unsigned; hash próprio do PDF ≠ hash canônico do conteúdo (documentado).

## 10. Storage abstraction

`ContractPrivateStorage` com `put` / `getAuthorizedDownload` / `verifyIntegrity` / `deleteLogical`.

## 11. Path strategy

`tenants/{tenantId}/contracts/{contractId}/versions/{versionId}/[envelopes/{envelopeId}/]{fileType}/{fileId}.{ext}`

Sem PII, sem `..`, extensão por MIME allowlist.

## 12. Tipos de arquivo

Inclui `INTEGRITY_MANIFEST`; status `PENDING|GENERATED|STORED|VERIFIED|FAILED|QUARANTINED|DELETED`; purposes documentados.

## 13. MIME types

Allowlist: pdf/json/html/png/jpeg/webp. Bloqueia data URL e executáveis.

## 14. Limites

`DEFAULT_CONTRACT_FILE_SIZE_LIMITS` centralizado (PDF 8MB, evidence 2MB, signature 512KB, attachment 10MB, total 50MB).

## 15. Relatório de evidências

JSON + HTML imprimível; IP mascarado; sem OTP/token/assinatura inline; `reportHash` obrigatório; `technicalDemo: true`.

## 16. Manifesto

Arquivos referenciados com sha256/size/mime; `manifestHash`; sem URLs.

## 17. Código de verificação

Memory service; hash-only; QR payload abstrato; sem rota pública real; flag `contract_public_verification_enabled` OFF.

## 18. Integridade

`ContractFileIntegrityService` + verify no storage; estados UNVERIFIED/VALID/INVALID/MISSING.

## 19. Pipeline

`createContractDocumentArtifactPipeline` — unsigned + signed artifacts.

## 20. Efeitos pendentes

`SignedContractArtifactEffects` com `effectsExecuted: false`; contrato permanece APPROVED; sem financeiro/prontuário/envio/eventos.

## 21. Repositories

Memory: Artifact, IntegrityManifest, EvidenceReport (+ storage memory).

## 22. Endpoints

```
POST /internal/app/contracts-v2/:id/versions/:versionId/render
POST /internal/app/contracts-v2/:id/versions/:versionId/generate-unsigned-pdf
POST /internal/app/signature-envelopes-v2/:id/generate-signed-artifacts
GET  /internal/app/contracts-v2/:id/files
GET  /internal/app/contract-files-v2/:fileId
POST /internal/app/contract-files-v2/:fileId/verify
POST /internal/app/contract-files-v2/:fileId/download
```

Flags OFF ⇒ 403; sem wiring ⇒ 501.

## 23. UI técnica

`/gestao/contratos/documentos-v2` — 5 flags OFF; harness fixtures/memory.

## 24. Permissões

`contracts:generate_pdf|generate_signed_artifacts|download|download_evidence|verify_integrity|view_files|manage_attachments` — catálogo sem roleDefaults.

## 25. Flags

Todas false: domain, module, versioning, pdf_v2, storage_v2, internal_signature_v2, public_verification.

## 26. Testes

`phase107PdfEvidenceStorageFoundation.test.js` — 14 testes (render, HTML, PDF, storage, pipeline, evidence/manifest, verification, cross-tenant, API/UI).

## 27. Validação manual (checklist)

Legado intacto; sem bucket; sem upload; sem migration apply; sem URL pública; sem transição SIGNED; sem financeiro/prontuário/envio.

## 28. Comandos executados

```bash
git status / rev-parse
npm test -- phase10{2..7}
npm run build
npm run type-check  # contracts limpo; dívida global pré-existente
```

## 29. Resultados

| Suite | Resultado |
|-------|-----------|
| 10.2–10.6 | 139 passed |
| 10.7 | 14 passed |
| **Total** | **153 passed** |
| Build | OK |
| Typecheck contracts | Sem erros novos |

## 30. Migrations

028 atualizado com `INTEGRITY_MANIFEST` (não aplicada). 006 intacta. Nenhuma migration nova.

## 31. Confirmação de não aplicação

Nenhum apply remoto/local executado.

## 32. Buckets

Nenhum bucket criado.

## 33. Confirmação de não criação

Sem upload Supabase Storage; storage apenas memory provider `private-contracts-v2-memory`.

## 34. Regressões

Nenhuma nas suites 10.2–10.6.

## 35. Riscos

- Renderer de teste ≠ PDF de produção (explícito)
- Wiring Postgres/Storage real pendente
- Manifesto inclui self-reference após store (aceitável nesta fundação)

## 36. Pendências

- Renderer PDF de produção determinístico (aprovação de lib)
- Bucket privado real + policies
- Apply migrations 028/029
- Transição SIGNED / efeitos reais
- Verificação pública

## 37. Gate

**APROVADO** — fundação PDF/evidências/storage v2 com flags OFF, legado intacto, testes e build OK.

## 38. Próxima fase recomendada

**Phase 10.8 — Contract SIGNED transition + audit ledger + gated side-effects**  
ou wiring de storage privado real após aprovação de bucket/migrations.
