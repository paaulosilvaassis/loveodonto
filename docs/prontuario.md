# Prontuário do Paciente

## Visão geral
- Módulo acessado pela rota `/prontuario/:patientId`.
- Organizado em 7 abas com edição controlada por seção.
- Persistência local via `LocalStorage` (sem backend).

## Abas
1. **Características**
   - Tipo sanguíneo, cor da pele, cabelo, olhos e formato do rosto.
2. **Anamnese Clínica**
   - Perguntas com resposta `Sim/Não/Não respondido` e campo de detalhes quando `Sim`.
3. **Anamnese ATM**
   - Mesmo padrão da anamnese clínica com questões de ATM.
4. **Situação Bucal Atual (Odontograma)**
   - Seleção por dente (FDI) e marcação de condição.
   - Faces O/M/D/V/L para condições que exigem faces.
   - Histórico de alterações salvo em `patientOdontogramHistory`.
5. **Arquivos e Documentos**
   - Upload de PDF/JPG/PNG/DOC/DOCX com categoria e validade.
6. **Documentos Confidenciais**
   - Mesmo fluxo de arquivos, com confirmação e RBAC.
7. **Álbuns de Fotografias**
   - Álbuns por categoria (pré/pós/evolução/outros) e upload múltiplo.

## Regras de edição (UX)
- Read-only por padrão.
- Botões de Editar/Salvar/Cancelar por aba.
- `SectionHeaderActions` para consistência visual.

## RBAC
- **Admin/Gerente/Profissional**: acesso completo às abas do prontuário.
- **Recepção**: acesso somente às abas não confidenciais (sem edição).
- **Financeiro/Comercial**: sem acesso ao prontuário clínico.
- **Confidenciais**: apenas Admin e Profissional.

## Auditoria
- `accessAuditLogs` registra `VIEW/UPDATE/UPLOAD`.
- Metadados incluem antes/depois quando aplicável e device info.
- Odontograma mantém histórico em `patientOdontogramHistory`.

## Armazenamento de arquivos
- Arquivos são persistidos como metadados no banco local.
- URLs são geradas por `URL.createObjectURL` no client.
- Não há armazenamento base64 no banco.

## Estruturas principais
- `patientCharts`
- `patientCharacteristics`
- `patientAnamnesisClinical`
- `patientAnamnesisAtm`
- `patientOdontograms`
- `patientOdontogramHistory`
- `patientFiles`
- `patientConfidentialFiles`
- `patientPhotoAlbums`
- `patientAlbumPhotos`
- `accessAuditLogs`
# Prontuário do Paciente

Este documento descreve a base de prontuário clínico, rota, permissões, estrutura de dados e operações.

## Objetivo

- Centralizar informações clínicas do paciente em uma tela dedicada.
- Garantir edição por seção com read-only padrão.
- Atender requisitos de LGPD com RBAC e auditoria.

## Rota

- `GET /prontuario/:patientId` (tela)

## Abas do prontuário

1) Características
- Tipo sanguíneo, cor da pele, cor do cabelo, cor dos olhos, formato do rosto.

2) Anamnese Clínica
- Respostas Sim/Não/Não respondido + detalhes quando Sim.
- Lista padronizada de 25 perguntas.

3) Anamnese ATM
- Respostas Sim/Não/Não respondido + detalhes quando Sim.
- Lista padronizada de 6 perguntas.

4) Situação Bucal Atual (Odontograma)
- Duas arcadas, numeração FDI (18–28 / 48–38).
- Seleção de dente, condição, faces e observação.
- Histórico de alterações e ação de desfazer (sessão).

5) Arquivos e Documentos
- Upload de PDF/JPG/PNG/DOC.
- Categoria, validade, visualização e download.

6) Documentos Confidenciais
- Mesma estrutura de arquivos, com acesso restrito e confirmação.

7) Álbuns de Fotografias
- Álbuns por categoria, upload múltiplo e visualização em grade.

## Permissões (RBAC)

Permissões introduzidas:

- `prontuario:read`
- `prontuario:write`
- `prontuario:clinical`
- `prontuario:confidential`

Regras:

- Admin/Gerente: acesso total ao prontuário.
- Profissional (dentista): acesso total e confidenciais.
- Recepção: leitura geral (sem confidenciais e sem anamnese clínica).
- Financeiro/Comercial: sem acesso.

## Auditoria

Logs gerados em:

- Atualização de características.
- Atualização de anamnese clínica e ATM.
- Atualização de odontograma.
- Upload/remoção de arquivos.
- Visualização de confidenciais.

O log registra before/after, userId e timestamp.

## Estrutura de dados (local DB)

Coleções adicionadas:

- `patientCharts`
- `patientCharacteristics`
- `patientAnamneseClinical`
- `patientAnamneseAtm`
- `patientOdontograms`
- `patientFiles`
- `patientConfidentialFiles`
- `patientPhotoAlbums`
- `patientPhotos`

Estruturas principais:

- `patientCharts`: `{ id, patient_id, created_at, updated_at }`
- `patientCharacteristics`: `{ patient_id, blood_type, skin_color, hair_color, eye_color, face_shape }`
- `patientAnamneseClinical`: `{ patient_id, items: [{ id, label, answer, details }] }`
- `patientAnamneseAtm`: `{ patient_id, items: [{ id, label, answer, details }] }`
- `patientOdontograms`: `{ patient_id, teeth: { [tooth]: { condition, faces, note, updated_at, updated_by } }, history: [] }`
- `patientFiles`: `{ patient_id, category, file_name, file_type, file_url, validity, created_at, created_by }`
- `patientConfidentialFiles`: mesma estrutura de `patientFiles`
- `patientPhotoAlbums`: `{ id, patient_id, category, created_at, created_by }`
- `patientPhotos`: `{ album_id, patient_id, file_name, file_url, note, procedure, created_at, created_by }`

## Serviços

Arquivo: `src/services/patientChartService.js`

Operações:

- `getPatientChart`
- `updatePatientCharacteristics`
- `updateAnamneseClinical`
- `updateAnamneseAtm`
- `updateOdontogram`
- `addPatientFile` / `removePatientFile`
- `addConfidentialFile` / `removeConfidentialFile`
- `addPhotoAlbum`
- `addAlbumPhoto` / `removeAlbumPhoto`
- `logConfidentialView`

## Observações de storage

Os arquivos são referenciados por URL (sem base64 no banco).
Para persistência real, integrar storage externo (S3/Supabase/local) e manter apenas metadados.

## Testes manuais recomendados

- Recepção não acessa aba de confidenciais.
- Editar anamnese e recarregar para validar persistência.
- Alterar odontograma, salvar e conferir histórico.
- Upload e listagem de arquivos e fotos.
- Logs de auditoria gerados nas alterações.
