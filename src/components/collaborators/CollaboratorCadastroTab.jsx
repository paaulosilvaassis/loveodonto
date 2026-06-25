import { Field } from '../Field.jsx';
import CollaboratorFormCard from './CollaboratorFormCard.jsx';
import {
  CollaboratorPersonalFields,
  CollaboratorRoleCategoryFields,
  CollaboratorSpecialtyFields,
} from './CollaboratorRhProfileFields.jsx';
import {
  addCollaboratorAddress,
  addCollaboratorEducation,
  addCollaboratorInsurance,
  addCollaboratorPhone,
  removeCollaboratorAddress,
  removeCollaboratorEducation,
  removeCollaboratorInsurance,
  removeCollaboratorPhone,
} from '../../services/collaboratorService.js';
import { formatCep, formatCpf, formatPhone } from '../../utils/validators.js';
import { isCorpoClinicoCategory as isCorpoClinico } from '../../constants/collaboratorRhCatalog.js';

const CADASTRO_SECTIONS = ['all', 'pessoais', 'documentacao', 'endereco', 'contatos', 'profissional', 'geral'];

export default function CollaboratorCadastroTab({
  draft,
  setDraft,
  selectedId,
  user,
  isEditor,
  isEditing,
  handlePhotoUpload,
  refreshCollaboratorDraft,
  cepLoading,
  cepError,
  handleCepChange,
  handleCepBlur,
  handleAddressFieldChange,
  isAutoFilled,
  section = 'all',
}) {
  const disabled = !isEditing;
  const show = (key) => section === 'all' || section === key || (key === 'documentacao' && section === 'documentos');

  return (
    <div className="collaborator-cadastro-tab cr-tab-panel">
      {show('pessoais') ? (
      <CollaboratorFormCard title="Informações básicas" id="cadastro-pessoais" className="cr-card-legacy">
        <CollaboratorPersonalFields
          profile={draft.profile}
          disabled={disabled}
          onPatch={(partial) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, ...partial } }))}
          photoSlot={
            <Field label="Foto">
              {draft.profile.fotoUrl ? (
                <img className="collaborator-record-photo" src={draft.profile.fotoUrl} alt="Foto do colaborador" />
              ) : null}
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={handlePhotoUpload}
                disabled={disabled}
              />
            </Field>
          }
        />
      </CollaboratorFormCard>
      ) : null}

      {show('pessoais') ? (
      <CollaboratorFormCard title="Informações complementares" id="cadastro-complementares" className="cr-card-legacy">
        <div className="collaborator-form-grid">
          <Field label="Estado civil"><input value={draft.relationships.estadoCivil || ''} onChange={(e) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, estadoCivil: e.target.value } }))} disabled={disabled} /></Field>
          <Field label="Naturalidade (cidade)"><input value={draft.nationality.naturalidadeCidade || ''} onChange={(e) => setDraft((prev) => ({ ...prev, nationality: { ...prev.nationality, naturalidadeCidade: e.target.value } }))} disabled={disabled} /></Field>
          <Field label="Naturalidade (UF)"><input value={draft.nationality.naturalidadeUf || ''} onChange={(e) => setDraft((prev) => ({ ...prev, nationality: { ...prev.nationality, naturalidadeUf: e.target.value } }))} disabled={disabled} /></Field>
          <Field label="Nacionalidade"><input value={draft.nationality.nacionalidade || ''} onChange={(e) => setDraft((prev) => ({ ...prev, nationality: { ...prev.nationality, nacionalidade: e.target.value } }))} disabled={disabled} /></Field>
        </div>
      </CollaboratorFormCard>
      ) : null}

      {show('documentacao') ? (
      <CollaboratorFormCard title="Documentação" id="cadastro-documentacao" className="cr-card-legacy">
        <div className="collaborator-form-grid">
          <Field label="CPF">
            <input
              value={formatCpf(draft.documents.cpf || '')}
              onChange={(e) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, cpf: e.target.value } }))}
              disabled={disabled}
            />
          </Field>
          <Field label="RG">
            <input value={draft.documents.rg || ''} onChange={(e) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, rg: e.target.value } }))} disabled={disabled} />
          </Field>
          <Field label="PIS/PASEP">
            <input value={draft.documents.pisPasep || ''} onChange={(e) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, pisPasep: e.target.value } }))} disabled={disabled} />
          </Field>
          <Field label="CTPS">
            <input value={draft.documents.ctps || ''} onChange={(e) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, ctps: e.target.value } }))} disabled={disabled} />
          </Field>
          <Field label="CNPJ (se PJ)">
            <input value={draft.documents.cnpj || ''} onChange={(e) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, cnpj: e.target.value } }))} disabled={disabled} />
          </Field>
          <div className="collaborator-form-grid__full">
            <Field label="Observações">
              <textarea value={draft.documents.observacoes || ''} onChange={(e) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, observacoes: e.target.value } }))} disabled={disabled} />
            </Field>
          </div>
        </div>
      </CollaboratorFormCard>
      ) : null}

      {show('documentacao') ? (
      <CollaboratorFormCard title="Observações e convênios" id="cadastro-docs-extra" className="cr-card-legacy">
        <Field label="Observações gerais">
          <textarea value={draft.characteristics.observacoesGerais || ''} onChange={(e) => setDraft((prev) => ({ ...prev, characteristics: { ...prev.characteristics, observacoesGerais: e.target.value } }))} disabled={disabled} />
        </Field>
        <Field label="Notas internas">
          <textarea value={draft.additional.notes || ''} onChange={(e) => setDraft((prev) => ({ ...prev, additional: { ...prev.additional, notes: e.target.value } }))} disabled={disabled} />
        </Field>
        {isEditing ? (
          <form
            className="collaborator-form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedId) return;
              addCollaboratorInsurance(user, selectedId, draft.newInsurance);
              setDraft((prev) => ({ ...prev, newInsurance: { convenioNome: '', detalhes: '', validade: '' } }));
              refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['insurances'] });
            }}
          >
            <Field label="Convênio"><input value={draft.newInsurance.convenioNome} onChange={(e) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, convenioNome: e.target.value } }))} /></Field>
            <Field label="Detalhes"><input value={draft.newInsurance.detalhes} onChange={(e) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, detalhes: e.target.value } }))} /></Field>
            <Field label="Validade"><input type="date" value={draft.newInsurance.validade} onChange={(e) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, validade: e.target.value } }))} /></Field>
            <div className="collaborator-form-grid__full"><button className="button secondary" type="submit">Adicionar convênio</button></div>
          </form>
        ) : null}
        <ul className="collaborator-record-list">
          {draft.insurances.map((item) => (
            <li key={item.id} className="collaborator-record-list__item">
              <span>{item.convenioNome} · {item.validade || 'Sem validade'}</span>
              {isEditing && isEditor ? (
                <button type="button" className="button ghost" onClick={() => { removeCollaboratorInsurance(user, item.id); refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['insurances'] }); }}>Remover</button>
              ) : null}
            </li>
          ))}
          {draft.insurances.length === 0 ? <li className="collaborator-record-list__empty muted">Nenhum convênio cadastrado.</li> : null}
        </ul>
      </CollaboratorFormCard>
      ) : null}

      {show('endereco') ? (
      <CollaboratorFormCard title="Endereço" description="Cadastre um ou mais endereços do colaborador." id="cadastro-enderecos" className="cr-card-legacy">
        {isEditing ? (
          <form
            className="collaborator-form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedId) return;
              addCollaboratorAddress(user, selectedId, draft.newAddress);
              setDraft((prev) => ({
                ...prev,
                newAddress: { tipo: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', principal: false },
              }));
              refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['addresses'] });
            }}
          >
            <Field label="Tipo">
              <select value={draft.newAddress.tipo} onChange={(e) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, tipo: e.target.value } }))}>
                <option value="">Selecione</option>
                <option value="residencial">Residencial</option>
                <option value="correspondencia">Correspondência</option>
                <option value="outro">Outro</option>
              </select>
            </Field>
            <Field label="CEP" error={cepError}>
              <div className={`cep-input-wrapper ${cepLoading ? 'is-loading' : ''}`}>
                <input value={formatCep(draft.newAddress.cep)} onChange={(e) => handleCepChange(e.target.value)} onBlur={handleCepBlur} />
                <span className="cep-spinner" aria-hidden="true" />
              </div>
            </Field>
            <Field label="Logradouro">
              <input value={draft.newAddress.logradouro} onChange={(e) => handleAddressFieldChange('logradouro', e.target.value)} className={isAutoFilled('logradouro') ? 'input-autofilled' : ''} />
            </Field>
            <Field label="Número">
              <input value={draft.newAddress.numero} onChange={(e) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, numero: e.target.value } }))} />
            </Field>
            <Field label="Complemento">
              <input value={draft.newAddress.complemento} onChange={(e) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, complemento: e.target.value } }))} />
            </Field>
            <Field label="Bairro">
              <input value={draft.newAddress.bairro} onChange={(e) => handleAddressFieldChange('bairro', e.target.value)} className={isAutoFilled('bairro') ? 'input-autofilled' : ''} />
            </Field>
            <Field label="Cidade">
              <input value={draft.newAddress.cidade} onChange={(e) => handleAddressFieldChange('cidade', e.target.value)} className={isAutoFilled('cidade') ? 'input-autofilled' : ''} />
            </Field>
            <Field label="UF">
              <input value={draft.newAddress.uf} onChange={(e) => handleAddressFieldChange('uf', e.target.value)} className={isAutoFilled('uf') ? 'input-autofilled' : ''} />
            </Field>
            <Field label="Principal">
              <input type="checkbox" checked={draft.newAddress.principal} onChange={(e) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, principal: e.target.checked } }))} />
            </Field>
            <div className="collaborator-form-grid__full">
              <button className="button secondary" type="submit">Adicionar endereço</button>
            </div>
          </form>
        ) : null}
        <ul className="collaborator-record-list">
          {draft.addresses.map((item) => (
            <li key={item.id} className="collaborator-record-list__item">
              <span>{item.tipo} · {item.logradouro}, {item.numero} · {item.cidade}-{item.uf} {item.principal ? '★' : ''}</span>
              {isEditing && isEditor ? (
                <button type="button" className="button ghost" onClick={() => { removeCollaboratorAddress(user, item.id); refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['addresses'] }); }}>
                  Remover
                </button>
              ) : null}
            </li>
          ))}
          {draft.addresses.length === 0 ? <li className="collaborator-record-list__empty muted">Nenhum endereço cadastrado.</li> : null}
        </ul>
      </CollaboratorFormCard>
      ) : null}

      {show('contatos') ? (
      <CollaboratorFormCard title="Contatos" id="cadastro-contatos" className="cr-card-legacy">
        {isEditing ? (
          <form
            className="collaborator-form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedId) return;
              addCollaboratorPhone(user, selectedId, draft.newPhone);
              setDraft((prev) => ({ ...prev, newPhone: { tipo: '', ddd: '', numero: '', principal: false } }));
              refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['phones'] });
            }}
          >
            <Field label="Tipo">
              <select value={draft.newPhone.tipo} onChange={(e) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, tipo: e.target.value } }))}>
                <option value="">Selecione</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="celular">Celular</option>
                <option value="comercial">Comercial</option>
                <option value="outro">Outro</option>
              </select>
            </Field>
            <Field label="DDD">
              <input value={draft.newPhone.ddd} onChange={(e) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, ddd: e.target.value } }))} />
            </Field>
            <Field label="Número">
              <input value={formatPhone(draft.newPhone.numero)} onChange={(e) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, numero: e.target.value } }))} />
            </Field>
            <Field label="Principal">
              <input type="checkbox" checked={draft.newPhone.principal} onChange={(e) => setDraft((prev) => ({ ...prev, newPhone: { ...prev.newPhone, principal: e.target.checked } }))} />
            </Field>
            <div className="collaborator-form-grid__full">
              <button className="button secondary" type="submit">Adicionar telefone</button>
            </div>
          </form>
        ) : null}
        <ul className="collaborator-record-list">
          {draft.phones.map((item) => (
            <li key={item.id} className="collaborator-record-list__item">
              <span>{item.tipo} · ({item.ddd}) {item.numero} {item.principal ? '★' : ''}</span>
              {isEditing && isEditor ? (
                <button type="button" className="button ghost" onClick={() => { removeCollaboratorPhone(user, item.id); refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['phones'] }); }}>
                  Remover
                </button>
              ) : null}
            </li>
          ))}
          {draft.phones.length === 0 ? <li className="collaborator-record-list__empty muted">Nenhum telefone cadastrado.</li> : null}
        </ul>
        <div className="collaborator-form-grid collaborator-form-grid--spaced">
          <Field label="Contato de emergência">
            <input value={draft.relationships.contatoEmergenciaNome || ''} onChange={(e) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, contatoEmergenciaNome: e.target.value } }))} disabled={disabled} />
          </Field>
          <Field label="Telefone de emergência">
            <input value={formatPhone(draft.relationships.contatoEmergenciaTelefone || '')} onChange={(e) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, contatoEmergenciaTelefone: e.target.value } }))} disabled={disabled} />
          </Field>
        </div>
      </CollaboratorFormCard>
      ) : null}

      {show('profissional') ? (
      <CollaboratorFormCard title="Dados clínicos" description="Selecione a categoria para carregar os cargos compatíveis." id="cadastro-profissional" className="cr-card-legacy">
        <CollaboratorRoleCategoryFields
          profile={draft.profile}
          disabled={disabled}
          onPatch={(partial) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, ...partial } }))}
        />
      </CollaboratorFormCard>
      ) : null}

      {show('profissional') && isCorpoClinico(draft.profile.rhCategoria || '') ? (
        <CollaboratorFormCard title="Especialidade e conselho" id="cadastro-especialidade" className="cr-card-legacy">
          <CollaboratorSpecialtyFields
            profile={draft.profile}
            disabled={disabled}
            onPatch={(partial) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, ...partial } }))}
          />
        </CollaboratorFormCard>
      ) : null}

      {show('profissional') ? (
      <CollaboratorFormCard title="Vínculo" id="cadastro-vinculo" className="cr-card-legacy">
        <div className="collaborator-form-grid">
          <Field label="Tipo de contratação">
            <select value={draft.documents.tipoContratacao || ''} onChange={(e) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, tipoContratacao: e.target.value } }))} disabled={disabled}>
              <option value="">Selecione</option>
              <option value="CLT">CLT</option>
              <option value="PJ">PJ</option>
              <option value="Prestador">Prestador</option>
              <option value="Estágio">Estágio</option>
            </select>
          </Field>
          <Field label="Data de admissão">
            <input type="date" value={draft.documents.dataAdmissao || ''} onChange={(e) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, dataAdmissao: e.target.value } }))} disabled={disabled} />
          </Field>
          <Field label="Data de demissão">
            <input type="date" value={draft.documents.dataDemissao || ''} onChange={(e) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, dataDemissao: e.target.value } }))} disabled={disabled} />
          </Field>
          <Field label="Situação">
            <input value={draft.profile.statusRh || draft.profile.status || ''} disabled />
          </Field>
        </div>
      </CollaboratorFormCard>
      ) : null}

      {show('profissional') ? (
      <CollaboratorFormCard title="Formação" id="cadastro-formacao" className="cr-card-legacy">
        {isEditing ? (
          <form
            className="collaborator-form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedId) return;
              addCollaboratorEducation(user, selectedId, draft.newEducation);
              setDraft((prev) => ({ ...prev, newEducation: { formacao: '', instituicao: '', anoConclusao: '', cursos: '' } }));
              refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['education'] });
            }}
          >
            <Field label="Formação"><input value={draft.newEducation.formacao} onChange={(e) => setDraft((prev) => ({ ...prev, newEducation: { ...prev.newEducation, formacao: e.target.value } }))} /></Field>
            <Field label="Instituição"><input value={draft.newEducation.instituicao} onChange={(e) => setDraft((prev) => ({ ...prev, newEducation: { ...prev.newEducation, instituicao: e.target.value } }))} /></Field>
            <Field label="Ano"><input value={draft.newEducation.anoConclusao} onChange={(e) => setDraft((prev) => ({ ...prev, newEducation: { ...prev.newEducation, anoConclusao: e.target.value } }))} /></Field>
            <Field label="Cursos/Certificações"><input value={draft.newEducation.cursos} onChange={(e) => setDraft((prev) => ({ ...prev, newEducation: { ...prev.newEducation, cursos: e.target.value } }))} /></Field>
            <div className="collaborator-form-grid__full"><button className="button secondary" type="submit">Adicionar formação</button></div>
          </form>
        ) : null}
        <ul className="collaborator-record-list">
          {draft.education.map((item) => (
            <li key={item.id} className="collaborator-record-list__item">
              <span>{item.formacao} · {item.instituicao}</span>
              {isEditing && isEditor ? (
                <button type="button" className="button ghost" onClick={() => { removeCollaboratorEducation(user, item.id); refreshCollaboratorDraft(undefined, { preserveCurrentEdits: true, forceMergeKeys: ['education'] }); }}>Remover</button>
              ) : null}
            </li>
          ))}
          {draft.education.length === 0 ? <li className="collaborator-record-list__empty muted">Nenhuma formação cadastrada.</li> : null}
        </ul>
      </CollaboratorFormCard>
      ) : null}
    </div>
  );
}

export { CADASTRO_SECTIONS };
