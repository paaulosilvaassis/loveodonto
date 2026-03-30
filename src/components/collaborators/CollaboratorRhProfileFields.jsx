import { Field } from '../Field.jsx';
import {
  BR_UF_SIGLAS,
  COLLABORATOR_CATEGORIES,
  TIPO_VINCULO_OPTIONS,
  SETOR_OPTIONS,
  getCargosForCategory,
  isCorpoClinicoCategory,
} from '../../constants/collaboratorRhCatalog.js';

/**
 * Blocos de cadastro RH (pessoais + profissional) para ficha e modal de colaborador.
 * @param {object} props
 * @param {Record<string, unknown>} props.profile
 * @param {boolean} props.disabled
 * @param {(patch: Record<string, unknown>) => void} props.onPatch
 * @param {import('react').ReactNode} [props.photoSlot] — campo de upload de foto (renderizado no bloco pessoal)
 */
export function CollaboratorRhProfileFields({ profile, disabled, onPatch, photoSlot }) {
  const cat = profile.rhCategoria || '';
  const cargos = getCargosForCategory(cat);
  const showCorpoClinicoExtras = isCorpoClinicoCategory(cat);

  const handleCategoriaChange = (value) => {
    const list = getCargosForCategory(value);
    const keep = list.includes(profile.cargo) ? profile.cargo : '';
    onPatch({ rhCategoria: value, cargo: keep });
  };

  return (
    <div className="collaborator-rh-form stack">
      <div className="collaborator-rh-block">
        <h4 className="collaborator-rh-block-title">Dados pessoais</h4>
        <div className="form-grid">
          <Field label="Apelido *">
            <input
              value={profile.apelido || ''}
              onChange={(e) => onPatch({ apelido: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Nome completo *">
            <input
              value={profile.nomeCompleto || ''}
              onChange={(e) => onPatch({ nomeCompleto: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Nome social">
            <input
              value={profile.nomeSocial || ''}
              onChange={(e) => onPatch({ nomeSocial: e.target.value })}
              disabled={disabled}
            />
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
            <input
              type="date"
              value={profile.dataNascimento || ''}
              onChange={(e) => onPatch({ dataNascimento: e.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="E-mail">
            <input
              type="email"
              value={profile.email || ''}
              onChange={(e) => onPatch({ email: e.target.value })}
              disabled={disabled}
            />
          </Field>
          {photoSlot ? (
            <div className="collaborator-rh-photo-slot" style={{ gridColumn: '1 / -1' }}>
              {photoSlot}
            </div>
          ) : null}
        </div>
      </div>

      <div className="collaborator-rh-block">
        <h4 className="collaborator-rh-block-title">Categoria, cargo e função</h4>
        <p className="muted collaborator-rh-hint">Selecione a categoria para carregar os cargos compatíveis com a clínica.</p>
        <div className="form-grid">
          <Field label="Categoria *">
            <select value={cat} onChange={(e) => handleCategoriaChange(e.target.value)} disabled={disabled}>
              <option value="">Selecione</option>
              {COLLABORATOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cargo *">
            <select
              value={profile.cargo || ''}
              onChange={(e) => onPatch({ cargo: e.target.value })}
              disabled={disabled || !cat}
            >
              <option value="">{cat ? 'Selecione o cargo' : 'Escolha uma categoria primeiro'}</option>
              {cargos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
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
      </div>

      {showCorpoClinicoExtras ? (
        <div className="collaborator-rh-block">
          <h4 className="collaborator-rh-block-title">Especialidade e conselho</h4>
          <p className="muted collaborator-rh-hint">
            Para o corpo clínico, informe especialidades e o registro no conselho (ex.: CRO).
          </p>
          <div className="form-grid">
            <Field label="Especialidades clínicas">
              <input
                value={(profile.especialidades || []).join(', ')}
                onChange={(e) =>
                  onPatch({
                    especialidades: e.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                disabled={disabled}
                placeholder="Ex.: Implantodontia, Ortodontia (separar por vírgula)"
              />
            </Field>
            <Field label="Conselho *">
              <input
                value={profile.conselhoNome || 'CRO'}
                onChange={(e) => onPatch({ conselhoNome: e.target.value })}
                disabled={disabled}
                placeholder="CRO"
              />
            </Field>
            <Field label="Número do conselho *">
              <input
                value={profile.registroProfissional || ''}
                onChange={(e) => onPatch({ registroProfissional: e.target.value })}
                disabled={disabled}
              />
            </Field>
            <Field label="UF do conselho *">
              <select
                value={(profile.conselhoUf || '').toUpperCase()}
                onChange={(e) => onPatch({ conselhoUf: e.target.value })}
                disabled={disabled}
              >
                <option value="">Selecione</option>
                {BR_UF_SIGLAS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      ) : null}

      <div className="collaborator-rh-block">
        <h4 className="collaborator-rh-block-title">Vínculo e setor</h4>
        <div className="form-grid">
          <Field label="Tipo de vínculo *">
            <select
              value={profile.tipoVinculo || ''}
              onChange={(e) => onPatch({ tipoVinculo: e.target.value })}
              disabled={disabled}
            >
              <option value="">Selecione</option>
              {TIPO_VINCULO_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Setor *">
            <select value={profile.setor || ''} onChange={(e) => onPatch({ setor: e.target.value })} disabled={disabled}>
              <option value="">Selecione</option>
              {SETOR_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="collaborator-rh-block">
        <h4 className="collaborator-rh-block-title">Status e permissões</h4>
        <div className="form-grid">
          <Field label="Status *">
            <select
              value={profile.status || 'ativo'}
              onChange={(e) => onPatch({ status: e.target.value })}
              disabled={disabled}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </Field>
          <p className="muted collaborator-rh-footnote" style={{ gridColumn: '1 / -1', margin: 0 }}>
            Permissões de acesso ao sistema são configuradas na aba <strong>Acessos</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
