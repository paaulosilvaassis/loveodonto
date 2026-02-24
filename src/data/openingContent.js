/**
 * Conteúdo da tela de abertura do app — 30 variações (uma por dia do mês).
 * Cada entrada: título, subtítulo opcional, tema (gradiente).
 */
export const OPENING_VARIATIONS = [
  { title: 'Bom dia!', subtitle: 'Que hoje seja leve e produtivo.', theme: 'primary' },
  { title: 'Olá!', subtitle: 'Pronto para cuidar dos sorrisos?', theme: 'secondary' },
  { title: 'Boa jornada!', subtitle: 'Cada atendimento faz a diferença.', theme: 'ocean' },
  { title: 'Dia de foco.', subtitle: 'Um passo de cada vez.', theme: 'sunset' },
  { title: 'Comece bem.', subtitle: 'Sua clínica merece o melhor de você.', theme: 'primary' },
  { title: 'Energia positiva.', subtitle: 'Transmita confiança em cada consulta.', theme: 'mint' },
  { title: 'Bom trabalho!', subtitle: 'Organize, atenda, brilhe.', theme: 'berry' },
  { title: 'Segunda com força.', subtitle: 'Semana cheia de conquistas.', theme: 'primary' },
  { title: 'Terça em ação.', subtitle: 'Agenda em dia, pacientes satisfeitos.', theme: 'ocean' },
  { title: 'Quarta no pique.', subtitle: 'Metade da semana, foco total.', theme: 'sunset' },
  { title: 'Quinta de ouro.', subtitle: 'Última reta da semana forte.', theme: 'secondary' },
  { title: 'Sextou!', subtitle: 'Feche a semana com chave de ouro.', theme: 'berry' },
  { title: 'Sábado especial.', subtitle: 'Quem cuida da clínica merece reconhecimento.', theme: 'mint' },
  { title: 'Domingo em paz.', subtitle: 'Recarregue para a próxima semana.', theme: 'ocean' },
  { title: 'Sorria mais.', subtitle: 'Você ajuda outros a sorrir.', theme: 'primary' },
  { title: 'Clínica em ordem.', subtitle: 'Gestão simples, resultados claros.', theme: 'secondary' },
  { title: 'Pacientes em primeiro.', subtitle: 'Experiência que marca.', theme: 'sunset' },
  { title: 'Financeiro sob controle.', subtitle: 'Tudo certo para crescer.', theme: 'mint' },
  { title: 'Agenda inteligente.', subtitle: 'Menos conflitos, mais atendimentos.', theme: 'berry' },
  { title: 'Equipe alinhada.', subtitle: 'Comunicação faz a diferença.', theme: 'ocean' },
  { title: 'Cresça todo dia.', subtitle: 'Pequenos passos, grandes resultados.', theme: 'primary' },
  { title: 'Gratidão.', subtitle: 'Por cada paciente que confia em você.', theme: 'secondary' },
  { title: 'Resiliência.', subtitle: 'Desafios viram aprendizado.', theme: 'sunset' },
  { title: 'Clareza.', subtitle: 'Decisões melhores com dados na mão.', theme: 'mint' },
  { title: 'Presença.', subtitle: 'Um atendimento de cada vez.', theme: 'berry' },
  { title: 'Excelência.', subtitle: 'O padrão que sua clínica merece.', theme: 'ocean' },
  { title: 'Simplicidade.', subtitle: 'Menos complicação, mais resultado.', theme: 'primary' },
  { title: 'Confiança.', subtitle: 'Sua equipe e seus pacientes contam com você.', theme: 'secondary' },
  { title: 'Inspiração.', subtitle: 'Hoje é dia de inspirar alguém.', theme: 'sunset' },
  { title: 'Até amanhã.', subtitle: 'Amanhã tem mais. Descanse bem.', theme: 'mint' },
];

const THEMES = {
  primary: 'linear-gradient(135deg, #6A00FF 0%, #EC4899 100%)',
  secondary: 'linear-gradient(135deg, #EC4899 0%, #6A00FF 100%)',
  ocean: 'linear-gradient(135deg, #0EA5E9 0%, #6366F1 100%)',
  sunset: 'linear-gradient(135deg, #F59E0B 0%, #EC4899 100%)',
  mint: 'linear-gradient(135deg, #10B981 0%, #0EA5E9 100%)',
  berry: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
};

/**
 * Retorna o índice da variação (0–29) com base no dia do mês.
 */
export function getOpeningIndex() {
  const day = new Date().getDate();
  return (day - 1) % OPENING_VARIATIONS.length;
}

/**
 * Retorna o conteúdo e o gradiente da abertura do dia.
 */
export function getOpeningForToday() {
  const index = getOpeningIndex();
  const item = OPENING_VARIATIONS[index];
  return {
    ...item,
    gradient: THEMES[item.theme] || THEMES.primary,
    dayNumber: index + 1,
  };
}
