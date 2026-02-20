import { useState, useMemo, useEffect } from 'react';
import { FileText, Search, Save, Download, Send, Edit2, X, FileCheck, ClipboardList, Stethoscope, Pill } from 'lucide-react';
import { SectionCard } from '../SectionCard.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { loadDb } from '../../db/index.js';
import {
  createDocumentRecord,
  listDocumentRecords,
} from '../../services/documentService.js';
import {
  DOCUMENT_CATEGORIES,
  getTemplatesByCategory,
  getTemplateByKey,
  replaceTemplateVariables,
} from '../../utils/documentTemplates.js';
import { queueMessage } from '../../services/communicationService.js';

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
    return `${mainPhone.ddd || ''} ${mainPhone.numero || ''}`.trim();
  }, [mainPhone]);

  // Preparar variáveis padrão do sistema (seguindo padrão do orçamento)
  const defaultVariables = useMemo(() => {
    const now = new Date();
    const appointmentDate = appointment?.date ? new Date(appointment.date + 'T00:00:00') : now;
    
    const professionalName = professional?.nomeCompleto || professional?.name || 'Profissional';
    const professionalCro = professional?.cro || professional?.croNumber || professional?.registroCRO || professional?.conselhoNumero || professional?.councilNumber || '';
    
    const pacienteNome = patient?.full_name || patient?.nickname || patient?.social_name || 'Paciente';
    const pacienteCpf = patient?.cpf || '';
    const pacienteNascimento = patient?.birth_date ? new Date(patient.birth_date).toLocaleDateString('pt-BR') : '';
    const clinicaNome = clinic?.nomeClinica || clinic?.nomeFantasia || 'Clínica';
    const clinicaCnpj = clinicDocs?.cnpj || '';

    return {
      // Padrão antigo (outros templates)
      PACIENTE_NOME: pacienteNome,
      PACIENTE_CPF: pacienteCpf,
      PACIENTE_NASCIMENTO: pacienteNascimento,
      PROFISSIONAL_NOME: professionalName,
      PROFISSIONAL_CRO: professionalCro,
      DATA_ATENDIMENTO: appointmentDate.toLocaleDateString('pt-BR'),
      HORA_ATENDIMENTO: appointment?.startTime || '',
      DATA_EMISSAO: now.toLocaleDateString('pt-BR'),
      CIDADE: mainAddress?.cidade || '',
      CLINICA_NOME: clinicaNome,
      CLINICA_CNPJ: clinicaCnpj,
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
  }, [patient, appointment, professional, clinic, clinicDocs, mainAddress, enderecoClinica, telefoneClinica]);

  // Quando selecionar um template, preparar variáveis e conteúdo
  useEffect(() => {
    if (selectedTemplate) {
      const template = getTemplateByKey(selectedTemplate);
      if (template) {
        const vars = { ...defaultVariables };
        template.fields.forEach((field) => {
          if (!vars[field.key]) {
            vars[field.key] = '';
          }
        });
        setTemplateVariables(vars);
        const initialContent = replaceTemplateVariables(template.body, vars);
        setEditingContent(initialContent);
      }
    }
  }, [selectedTemplate, defaultVariables]);

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
    setTemplateVariables((prev) => ({ ...prev, [key]: value }));
    if (selectedTemplate) {
      const template = getTemplateByKey(selectedTemplate);
      if (template) {
        const updatedVars = { ...templateVariables, [key]: value };
        const updatedContent = replaceTemplateVariables(template.body, updatedVars);
        setEditingContent(updatedContent);
      }
    }
  };

  const handleSaveDocument = async () => {
    if (!selectedTemplate) return;

    setSaving(true);
    try {
      const template = getTemplateByKey(selectedTemplate);
      const finalContent = replaceTemplateVariables(template.body, templateVariables);

      await createDocumentRecord(user, {
        patientId: patient.id,
        appointmentId,
        category: activeTab,
        templateKey: selectedTemplate,
        title: template.title,
        content: finalContent,
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
    const clinicLogo = clinic?.logoUrl || '';
    const clinicName = clinic?.nomeClinica || clinic?.nomeFantasia || 'Clínica';
    const clinicCnpj = clinicDocs?.cnpj || '';
    const clinicEmail = clinic?.emailPrincipal || '';
    const escapeHtml = (v) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const bodyHtml = escapeHtml(editingContent).replace(/\n/g, '<br />');
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Documento</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px 40px; line-height: 1.6; color: #0f172a; }
            .page { max-width: 800px; margin: 0 auto; }
            .doc-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              flex-wrap: wrap;
              gap: 16px;
              padding-bottom: 16px;
              border-bottom: 1px solid #e2e8f0;
              margin-bottom: 24px;
            }
            .brand { display: flex; align-items: center; gap: 16px; }
            .logo {
              width: 64px; height: 64px; object-fit: contain; border-radius: 12px;
              border: 1px solid #e5e7eb; background: #fff;
            }
            .logo-fallback {
              width: 64px; height: 64px; border-radius: 12px; border: 1px dashed #cbd5e1;
              display: flex; align-items: center; justify-content: center; font-size: 11px;
              color: #64748b; background: #f8fafc; text-align: center; padding: 6px;
            }
            .clinic-name { font-size: 18px; font-weight: 600; margin: 0; }
            .clinic-doc { font-size: 12px; color: #64748b; margin-top: 4px; }
            .doc-body {
              white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 13px;
              margin-bottom: 24px;
            }
            .footer {
              margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0;
              font-size: 11px; color: #64748b; text-align: center;
            }
            .footer-address { margin-top: 6px; font-size: 11px; color: #94a3b8; }
            @media print { body { margin: 0; padding: 16px; } .page { box-shadow: none; } }
          </style>
        </head>
        <body>
          <div class="page">
            <header class="doc-header">
              <div class="brand">
                ${clinicLogo
                  ? `<img class="logo" src="${escapeHtml(clinicLogo)}" alt="Logo da clínica" />`
                  : '<div class="logo-fallback">Logo da clínica</div>'}
                <div>
                  <p class="clinic-name">${escapeHtml(clinicName)}</p>
                  ${clinicCnpj ? `<p class="clinic-doc">CNPJ: ${escapeHtml(clinicCnpj)}</p>` : ''}
                  <p class="clinic-doc">Endereço: ${enderecoClinica ? escapeHtml(enderecoClinica) : 'Não informado'}</p>
                  <p class="clinic-doc">Telefone: ${telefoneClinica ? escapeHtml(telefoneClinica) : 'Não informado'}</p>
                  <p class="clinic-doc">E-mail: ${clinicEmail ? escapeHtml(clinicEmail) : 'Não informado'}</p>
                </div>
              </div>
            </header>
            <div class="doc-body">${bodyHtml}</div>
            <div class="footer">
              <p>${escapeHtml(clinicName)}</p>
              <div class="footer-address">Endereço: ${enderecoClinica ? escapeHtml(enderecoClinica) : 'Não informado'}</div>
              <div class="footer-address">Telefone: ${telefoneClinica ? escapeHtml(telefoneClinica) : 'Não informado'}</div>
              <div class="footer-address">E-mail: ${clinicEmail ? escapeHtml(clinicEmail) : 'Não informado'}</div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
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

                  {/* Preview/Editor */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)' }}>
                      <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)' }}>
                        Preview do Documento
                      </span>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          const template = getTemplateByKey(selectedTemplate);
                          if (template) {
                            const updatedContent = replaceTemplateVariables(template.body, templateVariables);
                            setEditingContent(updatedContent);
                          }
                        }}
                      >
                        <Edit2 size={14} />
                        Atualizar Preview
                      </button>
                    </div>
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={15}
                      placeholder="Conteúdo do documento aparecerá aqui..."
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
