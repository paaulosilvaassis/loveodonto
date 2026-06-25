import { Field } from '../Field.jsx';
import {
  BR_UF_SIGLAS,
  COLLABORATOR_CATEGORIES,
  TIPO_VINCULO_GROUPS,
  TIPO_VINCULO_OPTIONS,
  SETOR_OPTIONS,
  getCargosForCategory,
  isCorpoClinicoCategory,
} from '../../constants/collaboratorRhCatalog.js';

export function CollaboratorPersonalFields({ profile, disabled, onPatch, photoSlot }) {
  return (
    <div className="collaborator-form-grid">
      <Field label="Apelido *">
        <input value={profile.apelido || ''} onChange={(e) => onPatch({ apelido: e.target.value })} disabled={disabled} />
      </Field>
      <Field label="Nome completo *">
        <input value={profile.nomeCompleto || ''} onChange={(e) => onPatch({ nomeCompleto: e.target.value })} disabled={disabled} />
      </Field>
      <Field label="Nome social">
        <input value={profile.nomeSocial || ''} onChange={(e) => onPatch({ nomeSocial: e.target.value })} disabled={disabled} />
      </Field>
      <Field label="Sexo">
        <select value={profile.sexo || ''} onChange={(e) => onPatch({ sexo: e.target.value })} disabled={disabled}>
          <option value="">—</option>
          <option value="M">Masculino</option>
          <option value="F">Feminino</option>
          <option value="Outro">Outro</option>
        </select>
      </Field>
      <Field label="Data de nascimento">
        <input type="date" value={profile.dataNascimento || ''} onChange={(e) => onPatch({ dataNascimento: e.target.value })} disabled={disabled} />
      </Field>
      <Field label="E-mail">
        <input type="email" value={profile.email || ''} onChange={(e) => onPatch({ email: e.target.value })} disabled={disabled} />
      </Field>
      {photoSlot ? (
        <div className="collaborator-form-grid__full">{photoSlot}</div>
      ) : null}
    </div>
  );
}

export function CollaboratorRoleCategoryFields({ profile, disabled, onPatch }) {
  const cat = profile.rhCategoria || '';
  const cargos = getCargosForCategory(cat);

  const handleCategoriaChange = (value) => {
    const list = getCargosForCategory(value);
    const keep = list.includes(profile.cargo) ? profile.cargo : '';
    onPatch({ rhCategoria: value, cargo: keep });
  };

  return (
    <div className="collaborator-form-grid">
      <Field label="Categoria *">
        <select value={cat} onChange={(e) => handleCategoriaChange(e.target.value)} disabled={disabled}>
          <option value="">Selecione</option>
          {COLLABORATOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Cargo *">
        <select value={profile.cargo || ''} onChange={(e) => onPatch({ cargo: e.target.value })} disabled={disabled || !cat}>
          <option value="">{cat ? 'Selecione o cargo' : 'Escolha uma categoria primeiro'}</option>
          {cargos.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <div className="collaborator-form-grid__full">
        <Field label="Função / descrição da atuação">
          <textarea
            className="collaborator-rh-textarea"
            rows={3}
            value={profile.rhFuncaoDescricao || ''}
            onChange={(e) => onPatch({ rhFuncaoDescricao: e.target.value })}
            disabled={disabled}
            placeholder="Detalhe a atuação específica na clínica (opcional)."
          />
        </Field>
      </div>
      <Field label="Tipo de vínculo *">
        <select value={profile.tipoVinculo || ''} onChange={(e) => onPatch({ tipoVinculo: e.target.value })} disabled={disabled}>
          <option value="">Selecione</option>
          {TIPO_VINCULO_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </optgroup>
          ))}
          {profile.tipoVinculo && !TIPO_VINCULO_OPTIONS.includes(profile.tipoVinculo) ? (
            <option value={profile.tipoVinculo}>{profile.tipoVinculo}</option>
          ) : null}
        </select>
      </Field>
      <Field label="Setor *">
        <select value={profile.setor || ''} onChange={(e) => onPatch({ setor: e.target.value })} disabled={disabled}>
          <option value="">Selecione</option>
          {SETOR_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Status *">
        <select value={profile.status || 'ativo'} onChange={(e) => onPatch({ status: e.target.value })} disabled={disabled}>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>
      </Field>
    </div>
  );
}

export function CollaboratorSpecialtyFields({ profile, disabled, onPatch }) {
  const cat = profile.rhCategoria || '';
  if (!isCorpoClinicoCategory(cat)) return null;

  return (
    <div className="collaborator-form-grid">
      <Field label="Especialidades clínicas">
        <input
          value={(profile.especialidades || []).join(', ')}
          onChange={(e) =>
            onPatch({
              especialidades: e.target.value.split(',').map((item) => item.trim()).filter(Boolean),
            })
          }
          disabled={disabled}
          placeholder="Ex.: Implantodontia, Ortodontia (separar por vírgula)"
        />
      </Field>
      <Field label="Conselho *">
        <input value={profile.conselhoNome || 'CRO'} onChange={(e) => onPatch({ conselhoNome: e.target.value })} disabled={disabled} placeholder="CRO" />
      </Field>
      <Field label="Número do conselho *">
        <input value={profile.registroProfissional || ''} onChange={(e) => onPatch({ registroProfissional: e.target.value })} disabled={disabled} />
      </Field>
      <Field label="UF do conselho *">
        <select value={(profile.conselhoUf || '').toUpperCase()} onChange={(e) => onPatch({ conselhoUf: e.target.value })} disabled={disabled}>
          <option value="">Selecione</option>
          {BR_UF_SIGLAS.map((uf) => (
            <option key={uf} value={uf}>{uf}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}

/** Composto para modal de criação — mantém layout em blocos empilhados. */
export function CollaboratorRhProfileFields({ profile, disabled, onPatch, photoSlot }) {
  return (
    <div className="collaborator-rh-form stack">
      <div className="collaborator-rh-block">
        <h4 className="collaborator-rh-block-title">Dados pessoais</h4>
        <CollaboratorPersonalFields profile={profile} disabled={disabled} onPatch={onPatch} photoSlot={photoSlot} />
      </div>
      <div className="collaborator-rh-block">
        <h4 className="collaborator-rh-block-title">Categoria, cargo e função</h4>
        <p className="muted collaborator-rh-hint">Selecione a categoria para carregar os cargos compatíveis com a clínica.</p>
        <CollaboratorRoleCategoryFields profile={profile} disabled={disabled} onPatch={onPatch} />
      </div>
      {isCorpoClinicoCategory(profile.rhCategoria || '') ? (
        <div className="collaborator-rh-block">
          <h4 className="collaborator-rh-block-title">Especialidade e conselho</h4>
          <CollaboratorSpecialtyFields profile={profile} disabled={disabled} onPatch={onPatch} />
        </div>
      ) : null}
      <p className="muted collaborator-rh-footnote">
        Permissões de acesso ao sistema são configuradas na aba <strong>Acessos e permissões</strong>.
      </p>
    </div>
  );
}
