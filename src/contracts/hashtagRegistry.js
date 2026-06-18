/** Hashtags suportadas no módulo de contratos (#tag) */
export const CONTRACT_HASHTAG_DEFS = [
  { tag: '#clausula', description: 'Referência genérica a cláusula (uso interno / numeração).' },
  { tag: '#clinicaRazaoSocial', description: 'Razão social da clínica (cadastro).' },
  { tag: '#clinicaCNPJCPF', description: 'CNPJ ou CPF da clínica (cadastro).' },
  { tag: '#emissorCNPJCPF', description: 'CNPJ/CPF do emissor do documento (normalmente igual ao da clínica).' },
  { tag: '#emissorNomeRazaoSocial', description: 'Nome ou razão social do emissor.' },
  { tag: '#clinicaEndereco', description: 'Endereço completo da clínica.' },
  { tag: '#clinicaCidadeEstado', description: 'Cidade e UF da clínica.' },
  { tag: '#procedimentos', description: 'Tabela/lista HTML dos procedimentos do orçamento.' },
  { tag: '#parcelas', description: 'Tabela/lista HTML de parcelas / títulos vinculados quando existirem.' },
  { tag: '#manutencaoMeses', description: 'Periodicidade de manutenção ortodôntica (meses), se informada.' },
  { tag: '#totalContrato', description: 'Valor total do contrato (procedimentos), formato numérico.' },
  { tag: '#totalManutencoes', description: 'Valor total estimado de manutenções ortodônticas.' },
  { tag: '#totalGeralContrato', description: 'Soma total (contrato + manutenções).' },
  { tag: '#totalContratoExtenso', description: 'Valor total do contrato por extenso.' },
  { tag: '#totalManutencoesExtenso', description: 'Total de manutenções por extenso.' },
  { tag: '#totalGeralContratoExtenso', description: 'Total geral por extenso.' },
  { tag: '#pacienteNomeCompleto', description: 'Nome completo do paciente ou responsável financeiro.' },
  { tag: '#dependenteNomeCompleto', description: 'Nome do dependente (quando houver responsável financeiro).' },
  { tag: '#pessoaCPF', description: 'CPF da pessoa referida no contexto (paciente ou responsável).' },
  { tag: '#pessoaRG', description: 'RG da pessoa referida no contexto.' },
  { tag: '#pacienteRG', description: 'RG do paciente cadastrado.' },
  { tag: '#pacienteCPF', description: 'CPF do paciente cadastrado.' },
  { tag: '#pacienteEndereco', description: 'Endereço do paciente.' },
  { tag: '#dentistaNomeCompleto', description: 'Nome do profissional que gera/assina o documento.' },
  { tag: '#dentistaConselhoNumero', description: 'Número do conselho (CRO) do profissional.' },
  { tag: '#orcamentoObservacoes', description: 'Observações do orçamento.' },
  { tag: '#clinica_nome', description: 'Nome fantasia / razão social da clínica.' },
  { tag: '#clinica_cnpj', description: 'CNPJ da clínica.' },
  { tag: '#clinica_endereco', description: 'Endereço completo da clínica.' },
  { tag: '#responsavel_tecnico', description: 'Responsável técnico da clínica.' },
  { tag: '#cro_responsavel', description: 'CRO do responsável técnico.' },
  { tag: '#paciente_nome', description: 'Nome completo do paciente.' },
  { tag: '#paciente_cpf', description: 'CPF do paciente.' },
  { tag: '#paciente_endereco', description: 'Endereço do paciente.' },
  { tag: '#paciente_telefone', description: 'Telefone principal do paciente.' },
  { tag: '#profissional_nome', description: 'Nome do profissional responsável.' },
  { tag: '#profissional_cro', description: 'CRO do profissional.' },
  { tag: '#orcamento_numero', description: 'Número/identificador do orçamento.' },
  { tag: '#orcamento_data', description: 'Data do orçamento.' },
  { tag: '#tratamento_nome', description: 'Nome do tratamento / título do orçamento.' },
  { tag: '#dentes', description: 'Dentes/regiões envolvidos (odontograma/orçamento).' },
  { tag: '#valor_total', description: 'Valor total do orçamento.' },
  { tag: '#entrada', description: 'Valor de entrada / sinal.' },
  { tag: '#forma_pagamento', description: 'Forma de pagamento acordada.' },
  { tag: '#data_assinatura', description: 'Data da assinatura (preenchida ao assinar).' },
  { tag: '#responsavel_legal', description: 'Nome do responsável legal (menor).' },
  { tag: '#responsavel_cpf', description: 'CPF do responsável legal.' },
  { tag: '#clinicaCidade', description: 'Cidade da clínica.' },
  { tag: '#clinicaEstado', description: 'UF da clínica.' },
  { tag: '#clinicaTelefone', description: 'Telefone principal da clínica.' },
  { tag: '#clinicaEmail', description: 'E-mail da clínica.' },
  { tag: '#responsavelTecnicoNome', description: 'Nome do responsável técnico.' },
  { tag: '#responsavelTecnicoCRO', description: 'CRO do responsável técnico.' },
  { tag: '#pacienteDataNascimento', description: 'Data de nascimento do paciente.' },
  { tag: '#pacienteEmail', description: 'E-mail do paciente.' },
  { tag: '#dependenteCPF', description: 'CPF do dependente.' },
  { tag: '#dependenteDataNascimento', description: 'Data de nascimento do dependente.' },
  { tag: '#responsavelNomeCompleto', description: 'Nome do responsável financeiro/legal.' },
  { tag: '#responsavelEndereco', description: 'Endereço do responsável.' },
  { tag: '#responsavelTelefone', description: 'Telefone do responsável.' },
  { tag: '#responsavelEmail', description: 'E-mail do responsável.' },
  { tag: '#responsavelParentesco', description: 'Parentesco do responsável.' },
  { tag: '#numeroContrato', description: 'Número amigável do contrato (CTR-xxx).' },
  { tag: '#dataContrato', description: 'Data de emissão do contrato.' },
  { tag: '#formaPagamento', description: 'Forma de pagamento escolhida.' },
  { tag: '#saldo', description: 'Saldo após entrada.' },
  { tag: '#quantidadeParcelas', description: 'Quantidade de parcelas.' },
  { tag: '#valorParcela', description: 'Valor de cada parcela.' },
  { tag: '#dataPrimeiroVencimento', description: 'Data do primeiro vencimento.' },
  { tag: '#testemunha1Nome', description: 'Nome da testemunha 1 (opcional).' },
  { tag: '#testemunha1CPF', description: 'CPF da testemunha 1 (opcional).' },
  { tag: '#testemunha2Nome', description: 'Nome da testemunha 2 (opcional).' },
  { tag: '#testemunha2CPF', description: 'CPF da testemunha 2 (opcional).' },
];

const KNOWN = new Set(CONTRACT_HASHTAG_DEFS.map((d) => d.tag));

/** Extrai hashtags #Palavra do texto */
export function extractHashtags(text) {
  const s = String(text || '');
  const re = /#[a-zA-Z0-9_]+/g;
  return s.match(re) || [];
}

/** Retorna tags desconhecidas (não no registry) */
export function findUnknownHashtags(text) {
  const found = new Set(extractHashtags(text));
  return [...found].filter((t) => !KNOWN.has(t));
}

export function isKnownHashtag(tag) {
  return KNOWN.has(String(tag || '').trim());
}
