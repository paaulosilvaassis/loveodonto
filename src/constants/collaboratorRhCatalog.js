/**
 * Catálogo de RH para clínicas odontológicas — categorias, cargos por categoria,
 * vínculos, setores e helpers de UI/validação.
 */

export const COLLABORATOR_CATEGORIES = [
  'Diretoria e Gestão',
  'Corpo Clínico',
  'Apoio Clínico',
  'Recepção e Atendimento',
  'Comercial e Relacionamento',
  'Financeiro e Administrativo',
  'Marketing e Comunicação',
  'Tecnologia e Suporte',
  'Serviços Gerais e Apoio Operacional',
];

/** @type {Record<string, string[]>} */
export const CARGOS_BY_CATEGORY = {
  'Diretoria e Gestão': [
    'Proprietário',
    'Sócio',
    'Diretor Executivo',
    'Diretor Clínico',
    'Gestor Geral',
    'Gerente de Clínica',
    'Gerente Administrativo',
    'Gerente Comercial',
    'Coordenador Operacional',
    'Coordenador de Unidade',
    'Supervisor Administrativo',
    'Supervisor Comercial',
  ],
  'Corpo Clínico': [
    'Cirurgião-Dentista',
    'Clínico Geral',
    'Implantodontista',
    'Ortodontista',
    'Endodontista',
    'Periodontista',
    'Protesista',
    'Cirurgião Bucomaxilofacial',
    'Odontopediatra',
    'Harmonização Orofacial',
    'Estomatologista',
    'Radiologista Odontológico',
    'Dentística / Estética',
    'DTM e Dor Orofacial',
    'Patologista Bucal',
    'Odontogeriatra',
    'Especialista em Prótese Dentária',
    'Especialista em Reabilitação Oral',
  ],
  'Apoio Clínico': [
    'Auxiliar em Saúde Bucal (ASB)',
    'Técnico em Saúde Bucal (TSB)',
    'Auxiliar de Prótese Dentária',
    'Técnico em Prótese Dentária (TPD)',
    'Instrumentador Clínico',
    'Auxiliar de Esterilização',
    'Auxiliar de Consultório',
    'Assistente Clínico',
  ],
  'Recepção e Atendimento': [
    'Recepcionista',
    'Secretária',
    'Secretária Clínica',
    'Atendente',
    'Agendador',
    'Concierge',
    'Assistente de Atendimento',
    'Assistente de Relacionamento',
    'Líder de Recepção',
  ],
  'Comercial e Relacionamento': [
    'Consultor Comercial',
    'Consultor de Vendas',
    'Avaliador Comercial',
    'Executivo Comercial',
    'Assistente Comercial',
    'Coordenador Comercial',
    'SDR',
    'Closer / Fechador',
    'CRC / Central de Relacionamento com Cliente',
    'Pós-vendas',
    'Analista de Relacionamento',
    'Recuperador de Pacientes',
    'Captador de Leads',
  ],
  'Financeiro e Administrativo': [
    'Auxiliar Administrativo',
    'Assistente Administrativo',
    'Analista Administrativo',
    'Auxiliar Financeiro',
    'Assistente Financeiro',
    'Analista Financeiro',
    'Coordenador Financeiro',
    'Faturista',
    'Contas a Receber',
    'Contas a Pagar',
    'Caixa',
    'Comprador',
    'Estoquista',
    'Almoxarife',
    'Assistente de Faturamento',
    'Assistente de Convênios',
  ],
  'Marketing e Comunicação': [
    'Analista de Marketing',
    'Social Media',
    'Gestor de Tráfego',
    'Designer',
    'Videomaker',
    'Copywriter',
    'Assistente de Marketing',
    'Coordenador de Marketing',
    'CRM / Automação de Marketing',
  ],
  'Tecnologia e Suporte': [
    'Suporte de TI',
    'Analista de Sistemas',
    'Administrador de Sistemas',
    'Assistente de Suporte',
    'Coordenador de TI',
  ],
  'Serviços Gerais e Apoio Operacional': [
    'Serviços Gerais',
    'Auxiliar de Limpeza',
    'Auxiliar de Higienização',
    'Copeira',
    'Porteiro',
    'Segurança',
    'Apoio Externo',
    'Manutenção',
  ],
};

export const TIPO_VINCULO_OPTIONS = [
  'CLT',
  'PJ',
  'Autônomo',
  'Prestador de Serviço',
  'Sócio',
  'Estagiário',
  'Terceirizado',
  'Comissionado',
];

export const SETOR_OPTIONS = [
  'Clínico',
  'Comercial',
  'Administrativo',
  'Financeiro',
  'Recepção',
  'Marketing',
  'Esterilização',
  'Gestão',
  'TI',
  'Serviços Gerais',
];

export const BR_UF_SIGLAS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];

/** Mapeamento de cargos legados (pré-RH) → categoria + cargo atualizados. */
export const LEGACY_CARGO_MIGRATION = {
  Recepção: { rhCategoria: 'Recepção e Atendimento', cargo: 'Recepcionista' },
  Dentista: { rhCategoria: 'Corpo Clínico', cargo: 'Clínico Geral' },
  Ortodontista: { rhCategoria: 'Corpo Clínico', cargo: 'Ortodontista' },
  'ASB/TSB': { rhCategoria: 'Apoio Clínico', cargo: 'Auxiliar em Saúde Bucal (ASB)' },
  Financeiro: { rhCategoria: 'Financeiro e Administrativo', cargo: 'Analista Financeiro' },
  Gerente: { rhCategoria: 'Diretoria e Gestão', cargo: 'Gerente de Clínica' },
  Administrador: { rhCategoria: 'Diretoria e Gestão', cargo: 'Gestor Geral' },
};

export function getCargosForCategory(categoria) {
  if (!categoria || !CARGOS_BY_CATEGORY[categoria]) return [];
  return CARGOS_BY_CATEGORY[categoria];
}

export function isCorpoClinicoCategory(categoria) {
  return categoria === 'Corpo Clínico';
}

/** Corpo clínico ou cargos compatíveis com profissional da agenda (legado). */
export function isAgendaProfessional(collaborator) {
  if (!collaborator) return false;
  if (isCorpoClinicoCategory(collaborator.rhCategoria)) return true;
  const c = String(collaborator.cargo || '').toLowerCase();
  return /dentista|ortodontista|cirurgião|cirurgiao|implant|endodont|periodont|protesista|odon|clínico geral|clinico geral|radiologista|bucomaxilo|estomatologista|odontopediatra|harmoniza|reabilita/i.test(c);
}

export function getAllCargosFlat() {
  const set = new Set();
  Object.values(CARGOS_BY_CATEGORY).forEach((list) => {
    list.forEach((c) => set.add(c));
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Infere categoria a partir do cargo (útil após migração parcial). */
export function findCategoryForCargo(cargo) {
  if (!cargo) return '';
  for (const [cat, cargos] of Object.entries(CARGOS_BY_CATEGORY)) {
    if (cargos.includes(cargo)) return cat;
  }
  return '';
}

export function migrateLegacyCollaboratorRow(row) {
  if (!row || typeof row !== 'object') return row;
  const next = { ...row };
  if (!next.rhCategoria && LEGACY_CARGO_MIGRATION[next.cargo]) {
    next.rhCategoria = LEGACY_CARGO_MIGRATION[next.cargo].rhCategoria;
    next.cargo = LEGACY_CARGO_MIGRATION[next.cargo].cargo;
  }
  if (!next.rhCategoria && next.cargo) {
    next.rhCategoria = findCategoryForCargo(next.cargo) || '';
  }
  if (next.rhFuncaoDescricao === undefined) next.rhFuncaoDescricao = '';
  if (next.conselhoNome === undefined) next.conselhoNome = '';
  if (next.conselhoUf === undefined) next.conselhoUf = '';
  if (next.tipoVinculo === undefined) next.tipoVinculo = '';
  if (next.setor === undefined) next.setor = '';
  if (!Array.isArray(next.especialidades)) next.especialidades = [];
  return next;
}

export function isBrUfValid(uf) {
  return BR_UF_SIGLAS.includes(String(uf || '').trim().toUpperCase());
}
