import { useState, useMemo, useEffect, useRef } from 'react';
import { FileText, Search, Save, Download, Send, Edit2, X, FileCheck, ClipboardList, Stethoscope, Pill } from 'lucide-react';
import { SectionCard } from '../SectionCard.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { loadDb } from '../../db/index.js';
import {
  createDocumentRecord,
  listDocumentRecords,
} from '../../services/documentService.js';
import { mapDocumentTemplateToTcleId } from '../../services/clinicalTcleAttachmentService.js';
import {
  DOCUMENT_CATEGORIES,
  getTemplatesByCategory,
  getTemplateByKey,
  replaceTemplateVariables,
} from '../../utils/documentTemplates.js';
import { queueMessage } from '../../services/communicationService.js';
import {
  buildAtestadoPreviewText,
  openAtestadoPrintWindow,
} from './documents/atestadoPrintTemplate.js';
import { formatCpf } from '../../utils/validators.js';
import { formatBrazilianPhoneDisplay } from '../../utils/phoneUtils.js';

export default function DocumentsSection({ appointmentId, patient, appointment, professional }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('atestados');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateVariables, setTemplateVariables] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const db = loadDb();
  
  // Acessar dados da clínica como no padrão existente
  const clinic = db.clinicProfile || {};
  const clinicDocs = db.clinicDocumentation || {};
  const clinicAddresses = db.clinicAddresses || [];
  const clinicPhones = db.clinicPhones || [];
  const mainAddress = clinicAddresses.find((a) => a.principal) || clinicAddresses[0] || {};
  const mainPhone = clinicPhones.find((p) => p.principal) || clinicPhones[0];

  // Carregar documentos existentes
  const documents = useMemo(() => {
    return listDocumentRecords({
      appointmentId,
      patientId: patient?.id,
    });
  }, [appointmentId, patient?.id]);

  // Endereço e telefone formatados (mesmo padrão do orçamento/PDF)
  const enderecoClinica = useMemo(() => {
    if (!mainAddress || !mainAddress.logradouro) return '';
    return [
      mainAddress.logradouro,
      mainAddress.numero,
      mainAddress.complemento,
      mainAddress.bairro,
      mainAddress.cidade ? `${mainAddress.cidade}${mainAddress.uf ? `/${mainAddress.uf}` : ''}` : '',
      mainAddress.cep ? `CEP ${mainAddress.cep}` : '',
    ].filter(Boolean).join(', ');
  }, [mainAddress]);

  const telefoneClinica = useMemo(() => {
    if (!mainPhone) return '';
    return formatBrazilianPhoneDisplay(mainPhone.ddd, mainPhone.numero);
  }, [mainPhone]);

  const whatsappClinica = useMemo(() => {
    const whatsPhone = clinicPhones.find(
      (p) => p.whatsapp || p.is_whatsapp || String(p.tipo || '').toLowerCase() === 'whatsapp',
    );
    if (!whatsPhone) return telefoneClinica;
    return formatBrazilianPhoneDisplay(whatsPhone.ddd, whatsPhone.numero);
  }, [clinicPhones, telefoneClinica]);

  const cidadeAssinatura = useMemo(() => {
    const city = mainAddress?.cidade || '';
    const uf = mainAddress?.uf || '';
    if (city && uf) return `${city}/${uf}`;
    return city || uf || '';
  }, [mainAddress]);

  // Preparar variáveis padrão do sistema (seguindo padrão do orçamento)
  const defaultVariables = useMemo(() => {
    const now = new Date();
    const appointmentDate = appointment?.date ? new Date(appointment.date + 'T00:00:00') : now;
    
    const professionalName = professional?.nomeCompleto || professional?.name || 'Profissional';
    const professionalCro = professional?.cro || professional?.croNumber || professional?.registroCRO || professional?.conselhoNumero || professional?.councilNumber || '';
    
    const pacienteNome = patient?.full_name || patient?.nickname || patient?.social_name || 'Paciente';
    const pacienteCpf = patient?.cpf
      ? (String(patient.cpf).replace(/\D/g, '').length === 11
        ? formatCpf(String(patient.cpf).replace(/\D/g, ''))
        : patient.cpf)
      : '';
    const pacienteNascimento = patient?.birth_date ? new Date(patient.birth_date).toLocaleDateString('pt-BR') : '';
    const clinicaNome = clinic?.nomeClinica || clinic?.nomeFantasia || 'Clínica';
    const clinicaCnpj = clinicDocs?.cnpj || '';
    const respTecnico = clinicDocs?.responsavelTecnico || clinicDocs?.responsavel_tecnico || clinic?.responsavelTecnico || '';
    const respTecnicoCro = clinicDocs?.croResponsavelTecnico || clinicDocs?.cro_responsavel || '';
    const profSpecialty = professional?.especialidade
      || professional?.profile?.especialidade
      || (Array.isArray(professional?.especialidades) ? professional.especialidades.join(', ') : '')
      || (Array.isArray(professional?.profile?.especialidades) ? professional.profile.especialidades.join(', ') : '')
      || '';

    return {
      // Padrão antigo (outros templates)
      PACIENTE_NOME: pacienteNome,
      PACIENTE_CPF: pacienteCpf,
      PACIENTE_NASCIMENTO: pacienteNascimento,
      PROFISSIONAL_NOME: professionalName,
      PROFISSIONAL_CRO: professionalCro,
      PROFISSIONAL_ESPECIALIDADE: profSpecialty,
      DATA_ATENDIMENTO: appointmentDate.toLocaleDateString('pt-BR'),
      HORA_ATENDIMENTO: appointment?.startTime || '',
      DATA_EMISSAO: now.toLocaleDateString('pt-BR'),
      CIDADE: cidadeAssinatura,
      CLINICA_NOME: clinicaNome,
      CLINICA_CNPJ: clinicaCnpj,
      RESPONSAVEL_TECNICO: respTecnico,
      CRO_RESPONSAVEL_TECNICO: respTecnicoCro,
      WHATSAPP_CLINICA: whatsappClinica,
      DIAS_AFASTAMENTO: '1',
      // Placeholders do consentimento Implante (premium)
      NOME_DA_CLINICA: clinicaNome,
      CNPJ_DA_CLINICA: clinicaCnpj,
      ENDERECO_DA_CLINICA: enderecoClinica,
      TELEFONE_DA_CLINICA: telefoneClinica,
      NOME_PACIENTE: pacienteNome,
      CPF_PACIENTE: pacienteCpf,
      DATA_NASCIMENTO: pacienteNascimento,
      NOME_PROFISSIONAL: professionalName,
      CRO_PROFISSIONAL: professionalCro,
      DATA_ATUAL: now.toLocaleDateString('pt-BR'),
      HORA_ATUAL: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
  }, [patient, appointment, professional, clinic, clinicDocs, mainAddress, enderecoClinica, telefoneClinica, whatsappClinica, cidadeAssinatura]);

  const buildDocumentPreview = (template, vars) => {
    if (template?.printTemplate === 'atestado') {
      return buildAtestadoPreviewText(vars);
    }
    return replaceTemplateVariables(template.body, vars);
  };

  // Ref sempre atualizada com defaultVariables atual, sem ser dependência do effect
  const defaultVariablesRef = useRef(defaultVariables);
  defaultVariablesRef.current = defaultVariables;

  // Regenera conteúdo apenas quando o template selecionado muda (não a cada re-render do pai)
  useEffect(() => {
    if (selectedTemplate) {
      const template = getTemplateByKey(selectedTemplate);
      if (template) {
        const vars = { ...defaultVariablesRef.current };
        template.fields.forEach((field) => {
          if (!vars[field.key]) {
            vars[field.key] = field.defaultValue ?? '';
          }
        });
        setTemplateVariables(vars);
        setEditingContent(buildDocumentPreview(template, vars));
      }
    }
  }, [selectedTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtrar templates por categoria e busca
  const filteredTemplates = useMemo(() => {
    let templates = getTemplatesByCategory(activeTab);
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      templates = templates.filter((t) => t.title.toLowerCase().includes(query));
    }
    return templates;
  }, [activeTab, searchQuery]);

  // Filtrar documentos por categoria
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => doc.category === activeTab);
  }, [documents, activeTab]);

  const handleSelectTemplate = (templateKey) => {
    setSelectedTemplate(templateKey);
  };

  const handleVariableChange = (key, value) => {
    setTemplateVariables((prev) => {
      const updatedVars = { ...prev, [key]: value };
      if (selectedTemplate) {
        const template = getTemplateByKey(selectedTemplate);
        if (template) {
          setEditingContent(buildDocumentPreview(template, updatedVars));
        }
      }
      return updatedVars;
    });
  };

  const handleSaveDocument = async () => {
    if (!selectedTemplate) return;

    setSaving(true);
    try {
      const template = getTemplateByKey(selectedTemplate);
      const finalContent = template?.printTemplate === 'atestado'
        ? buildAtestadoPreviewText(templateVariables)
        : replaceTemplateVariables(template.body, templateVariables);

      await createDocumentRecord(user, {
        patientId: patient.id,
        appointmentId,
        category: activeTab,
        templateKey: selectedTemplate,
        title: template.title,
        content: finalContent,
        metadata: mapDocumentTemplateToTcleId(selectedTemplate)
          ? { tcleId: mapDocumentTemplateToTcleId(selectedTemplate) }
          : {},
      });

      setToast({ message: 'Documento salvo com sucesso', type: 'success' });
      setSelectedTemplate(null);
      setEditingContent('');
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('Erro ao salvar documento:', error);
      setToast({ message: error.message || 'Erro ao salvar documento', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePDF = () => {
    if (!editingContent) return;
    
    // Usar window.print() com formatação para PDF
    handlePrint();
    setToast({ message: 'Use "Salvar como PDF" na janela de impressão', type: 'success' });
    setTimeout(() => setToast(null), 5000);
  };

  const handlePrint = () => {
    if (!editingContent) return;

    const template = selectedTemplate ? getTemplateByKey(selectedTemplate) : null;
    if (template?.printTemplate === 'atestado') {
      openAtestadoPrintWindow({
        db,
        patient,
        professional,
        appointment,
        variables: templateVariables,
      });
      return;
    }

    const clinicLogo = clinic?.logoUrl || '';
    const clinicName = clinic?.nomeClinica || clinic?.nomeFantasia || 'Clínica';
    const clinicCnpj = clinicDocs?.cnpj || '';
    const clinicEmail = clinic?.emailPrincipal || '';
    const respTecnico = clinicDocs?.responsavelTecnico || clinicDocs?.responsavel_tecnico || '';
    const respTecnicoCro = clinicDocs?.croResponsavelTecnico || clinicDocs?.cro_responsavel || '';
    const escapeHtml = (v) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const hasValue = (v) => String(v ?? '').trim().length > 0;
    const bodyHtml = escapeHtml(editingContent).replace(/\n/g, '<br />');

    const headerLines = [
      hasValue(clinicCnpj) ? `CNPJ: ${escapeHtml(clinicCnpj)}` : '',
      hasValue(enderecoClinica) ? `Endereço: ${escapeHtml(enderecoClinica)}` : '',
      hasValue(whatsappClinica) ? `WhatsApp: ${escapeHtml(whatsappClinica)}` : (hasValue(telefoneClinica) ? `Telefone: ${escapeHtml(telefoneClinica)}` : ''),
      hasValue(clinicEmail) ? `E-mail: ${escapeHtml(clinicEmail)}` : '',
      hasValue(respTecnico)
        ? `Responsável técnico: ${escapeHtml(respTecnico)}${hasValue(respTecnicoCro) ? ` — ${escapeHtml(respTecnicoCro)}` : ''}`
        : '',
    ].filter(Boolean);

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(template?.title || 'Documento Clínico')}</title>
          <style>
            @page { size: A4; margin: 18mm 16mm; }
            body { font-family: "Times New Roman", Times, serif; padding: 0; margin: 0; line-height: 1.45; color: #1a1a1a; font-size: 12pt; }
            .page { max-width: 178mm; margin: 0 auto; padding: 16px; }
            .doc-header { display: flex; align-items: flex-start; gap: 12pt; padding-bottom: 10pt; margin-bottom: 14pt; border-bottom: 0.75pt solid #333; }
            .logo { width: 52pt; height: 52pt; object-fit: contain; flex-shrink: 0; }
            .clinic-name { font-size: 13pt; font-weight: 700; margin: 0 0 3pt; text-transform: uppercase; }
            .clinic-line { margin: 0; font-size: 9.5pt; line-height: 1.35; }
            .doc-body { white-space: pre-wrap; margin-bottom: 20pt; text-align: justify; }
            .footer { margin-top: 24pt; padding-top: 8pt; border-top: 0.5pt solid #ccc; font-size: 8pt; color: #666; text-align: center; }
            @media print { body { margin: 0; } .page { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="page">
            <header class="doc-header">
              ${clinicLogo ? `<img class="logo" src="${escapeHtml(clinicLogo)}" alt="" />` : ''}
              <div>
                <p class="clinic-name">${escapeHtml(clinicName)}</p>
                ${headerLines.map((line) => `<p class="clinic-line">${line}</p>`).join('')}
              </div>
            </header>
            <div class="doc-body">${bodyHtml}</div>
            <div class="footer">Documento emitido eletronicamente pelo sistema Love Odonto.</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => printWindow.print();
  };

  const handleSendWhatsApp = async () => {
    if (!editingContent || !patient) return;

    try {
      // Criar template temporário para WhatsApp (seguindo padrão do sistema)
      const templateId = `temp-doc-${Date.now()}`;
      const db = loadDb();
      if (!Array.isArray(db.messageTemplates)) {
        db.messageTemplates = [];
      }
      db.messageTemplates.push({
        id: templateId,
        name: `Documento ${currentTemplate?.title || selectedTemplate}`,
        channel: 'whatsapp',
        content: editingContent,
      });

      queueMessage(user, {
        patientId: patient.id,
        appointmentId,
        templateId,
        channel: 'whatsapp',
      });

      setToast({ message: 'Mensagem enfileirada para envio via WhatsApp', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
      setToast({ message: error.message || 'Erro ao enviar WhatsApp', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const getTabIcon = (category) => {
    switch (category) {
      case DOCUMENT_CATEGORIES.ATESTADOS:
        return FileText;
      case DOCUMENT_CATEGORIES.CONSENTIMENTOS:
        return FileCheck;
      case DOCUMENT_CATEGORIES.ORIENTACOES:
        return ClipboardList;
      case DOCUMENT_CATEGORIES.SOLICITACOES:
        return Stethoscope;
      case DOCUMENT_CATEGORIES.PRESCRICOES:
        return Pill;
      default:
        return FileText;
    }
  };

  const getTabLabel = (category) => {
    switch (category) {
      case DOCUMENT_CATEGORIES.ATESTADOS:
        return 'Atestados';
      case DOCUMENT_CATEGORIES.CONSENTIMENTOS:
        return 'Consentimentos';
      case DOCUMENT_CATEGORIES.ORIENTACOES:
        return 'Orientações e Cuidados';
      case DOCUMENT_CATEGORIES.SOLICITACOES:
        return 'Solicitações';
      case DOCUMENT_CATEGORIES.PRESCRICOES:
        return 'Prescrições';
      default:
        return category;
    }
  };

  const currentTemplate = selectedTemplate ? getTemplateByKey(selectedTemplate) : null;

  return (
    <SectionCard>
      {toast && (
        <div className={`alert ${toast.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 'var(--spacing-md)' }}>
          {toast.message}
        </div>
      )}

      {/* Tabs Internas - Seguindo padrão clinical-budget-tabs */}
      <div className="clinical-budget-tabs">
        {Object.values(DOCUMENT_CATEGORIES).map((category) => {
          const Icon = getTabIcon(category);
          return (
            <button
              key={category}
              type="button"
              className={`clinical-budget-tab ${activeTab === category ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(category);
                setSelectedTemplate(null);
                setSearchQuery('');
              }}
            >
              <Icon size={16} />
              {getTabLabel(category)}
            </button>
          );
        })}
      </div>

      {/* Conteúdo das Tabs */}
      <div className="clinical-budget-content">

        <div className="clinical-budget-tab-content">
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--spacing-xl)', minHeight: '500px' }}>
            {/* Coluna Esquerda: Lista de Templates */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)' }}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Buscar template..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--font-size-sm)' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)', maxHeight: '400px', overflowY: 'auto', marginBottom: 'var(--spacing-lg)' }}>
                {filteredTemplates.length === 0 ? (
                  <div style={{ padding: 'var(--spacing-lg)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                    Nenhum template encontrado
                  </div>
                ) : (
                  filteredTemplates.map((template) => (
                    <button
                      key={template.key}
                      type="button"
                      className={`button ${selectedTemplate === template.key ? 'primary' : 'secondary'}`}
                      onClick={() => handleSelectTemplate(template.key)}
                      style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                    >
                      <FileText size={14} />
                      {template.title}
                    </button>
                  ))
                )}
              </div>

              {/* Documentos Recentes */}
              {filteredDocuments.length > 0 && (
                <div style={{ paddingTop: 'var(--spacing-lg)', borderTop: '1px solid var(--color-border)' }}>
                  <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-md)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Documentos Emitidos
                  </h3>
                  {filteredDocuments.slice(0, 5).map((doc) => (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-xs)' }}>
                      <FileText size={12} />
                      <span style={{ flex: 1 }}>{doc.title}</span>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                        {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Coluna Direita: Preview e Edição */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
              {selectedTemplate && currentTemplate ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)' }}>
                    <h3 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', margin: 0 }}>
                      {currentTemplate.title}
                    </h3>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setSelectedTemplate(null);
                        setEditingContent('');
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Campos Variáveis */}
                  {currentTemplate.fields.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                      {currentTemplate.fields.map((field) => (
                        <div key={field.key} className="form-field">
                          <label>
                            {field.label}
                            {field.required && <span style={{ color: 'var(--color-error)' }}> *</span>}
                          </label>
                          {field.type === 'textarea' ? (
                            <textarea
                              value={templateVariables[field.key] || ''}
                              onChange={(e) => handleVariableChange(field.key, e.target.value)}
                              rows={3}
                            />
                          ) : (
                            <input
                              type={field.type || 'text'}
                              value={templateVariables[field.key] || ''}
                              onChange={(e) => handleVariableChange(field.key, e.target.value)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Editor do documento */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)' }}>
                      <div>
                        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                          Conteúdo do Documento
                        </span>
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                          Edite livremente antes de salvar ou imprimir.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button secondary"
                        title="Restaura o texto gerado automaticamente pelo template"
                        onClick={() => {
                          const template = getTemplateByKey(selectedTemplate);
                          if (template) {
                            setEditingContent(buildDocumentPreview(template, templateVariables));
                          }
                        }}
                      >
                        <Edit2 size={14} />
                        Restaurar padrão
                      </button>
                    </div>
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={15}
                      placeholder="Selecione um template para gerar o documento..."
                      style={{
                        width: '100%',
                        padding: 'var(--spacing-md)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--font-size-sm)',
                        fontFamily: 'Courier New, monospace',
                        resize: 'vertical',
                        minHeight: '300px',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap', paddingTop: 'var(--spacing-lg)', borderTop: '1px solid var(--color-border)' }}>
                    <button
                      type="button"
                      className="button primary"
                      onClick={handleSaveDocument}
                      disabled={saving || !editingContent}
                    >
                      <Save size={16} />
                      Salvar no Prontuário
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={handleGeneratePDF}
                      disabled={!editingContent}
                    >
                      <Download size={16} />
                      Exportar PDF
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={handlePrint}
                      disabled={!editingContent}
                    >
                      <Download size={16} />
                      Imprimir
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={handleSendWhatsApp}
                      disabled={!editingContent || !patient}
                    >
                      <Send size={16} />
                      Enviar WhatsApp
                    </button>
                  </div>
                </>
              ) : (
                <div className="clinical-empty-state">
                  <FileText size={48} />
                  <p>Selecione um template para gerar o documento</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
