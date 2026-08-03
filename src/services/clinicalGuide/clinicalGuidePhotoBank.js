/**
 * Banco de fotografias clínicas profissionais (stock odontológico).
 * Clínicas podem substituir por casos reais via Biblioteca de Imagens.
 * Fonte padrão: Unsplash (uso editorial/comercial conforme licença Unsplash).
 */

export const PHOTO_BANK_VERSION = 2;

function photo(id, w = 1400) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`;
}

const STOCK = {
  smileBright: photo('photo-1606811971618-4486d14f3f99'),
  smileNatural: photo('photo-1598256989800-fe5f95da9787'),
  smileClose: photo('photo-1571771894821-ce9b6d11d08e'),
  dentalChair: photo('photo-1609840114035-3c981b782dfe'),
  dentistPatient: photo('photo-1588776814546-1ffcf47267a5'),
  dentalTools: photo('photo-1629909613654-28e377c37b09'),
  dentalScan: photo('photo-1606811848677-f0b757ba5735'),
  hygiene: photo('photo-1607613009820-a29f7bb81c04'),
  braces: photo('photo-1598256989800-fe5f95da9787'),
  whitening: photo('photo-1609840114035-3c981b782dfe'),
  surgery: photo('photo-1579684385127-1ef15d508118'),
  lab: photo('photo-1581091226825-a6a2a5aee158'),
  happyPatient: photo('photo-1559839734-2b71ea197ec2'),
  consultation: photo('photo-1588776814546-1ffcf47267a5'),
  matureSmile: photo('photo-1582750433449-648ed127bb54'),
};

const BANK = {
  'protocolo-total': {
    cover: STOCK.happyPatient,
    beforeAfter: { before: STOCK.matureSmile, after: STOCK.smileBright },
    steps: [
      { title: 'Paciente sem dentes', description: 'Situação inicial da arcada — avaliação clínica e planejamento personalizado.', imageUrl: STOCK.matureSmile },
      { title: 'Instalação dos implantes', description: 'Fase cirúrgica com posicionamento dos implantes conforme indicação do dentista.', imageUrl: STOCK.surgery },
      { title: 'Período de osseointegração', description: 'Tempo de cicatrização e integração óssea — pode variar conforme cada caso.', imageUrl: STOCK.dentalScan },
      { title: 'Moldagem', description: 'Registro da arcada para confecção da prótese com precisão.', imageUrl: STOCK.consultation },
      { title: 'Prova da prótese', description: 'Ajustes de oclusão, estética e conforto antes da versão definitiva.', imageUrl: STOCK.lab },
      { title: 'Resultado final', description: 'Reabilitação fixa com dentes instalados — resultado pode variar conforme avaliação clínica.', imageUrl: STOCK.smileBright },
    ],
  },
  'implante-unitario': {
    cover: STOCK.dentalTools,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileNatural },
    steps: [
      { title: 'Avaliação', description: 'Exame clínico e imagens para planejar o implante unitário.', imageUrl: STOCK.dentalScan },
      { title: 'Instalação', description: 'Posicionamento do implante no osso.', imageUrl: STOCK.surgery },
      { title: 'Coroa definitiva', description: 'Instalação da coroa sobre o implante.', imageUrl: STOCK.smileNatural },
    ],
  },
  'protese-sobre-implante': {
    cover: STOCK.dentistPatient,
    beforeAfter: { before: STOCK.matureSmile, after: STOCK.smileBright },
    steps: [
      { title: 'Planejamento', description: 'Definição do tipo de prótese sobre implantes.', imageUrl: STOCK.consultation },
      { title: 'Fase protética', description: 'Confecção e provas da prótese.', imageUrl: STOCK.lab },
      { title: 'Instalação', description: 'Fixação da prótese sobre os implantes.', imageUrl: STOCK.smileBright },
    ],
  },
  overdenture: {
    cover: STOCK.dentalChair,
    beforeAfter: { before: STOCK.matureSmile, after: STOCK.happyPatient },
    steps: [
      { title: 'Avaliação', description: 'Indicação de overdenture sobre implantes.', imageUrl: STOCK.consultation },
      { title: 'Implantes de ancoragem', description: 'Instalação dos pilares de retenção.', imageUrl: STOCK.surgery },
      { title: 'Prótese removível', description: 'Prótese com maior estabilidade que dentadura convencional.', imageUrl: STOCK.happyPatient },
    ],
  },
  flexite: {
    cover: STOCK.dentistPatient,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileNatural },
    steps: [
      { title: 'Moldagem', description: 'Registro para prótese flexível.', imageUrl: STOCK.consultation },
      { title: 'Prova', description: 'Ajuste de encaixe e estética.', imageUrl: STOCK.lab },
      { title: 'Entrega', description: 'Instalação da flexite.', imageUrl: STOCK.smileNatural },
    ],
  },
  'ponte-fixa': {
    cover: STOCK.smileNatural,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileBright },
    steps: [
      { title: 'Preparo', description: 'Preparo dos dentes pilares.', imageUrl: STOCK.dentalTools },
      { title: 'Prova', description: 'Validação de oclusão e estética.', imageUrl: STOCK.lab },
      { title: 'Cimentação', description: 'Fixação da ponte definitiva.', imageUrl: STOCK.smileBright },
    ],
  },
  'lente-contato-resina': {
    cover: STOCK.smileBright,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.whitening },
    steps: [
      { title: 'Planejamento estético', description: 'Análise de forma e cor do sorriso.', imageUrl: STOCK.consultation },
      { title: 'Aplicação', description: 'Lâminas em resina composta.', imageUrl: STOCK.dentalTools },
      { title: 'Resultado', description: 'Harmonização do sorriso — pode variar conforme o caso.', imageUrl: STOCK.smileBright },
    ],
  },
  'lente-contato-porcelana': {
    cover: STOCK.smileNatural,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileBright },
    steps: [
      { title: 'Planejamento digital', description: 'Projeto do novo sorriso.', imageUrl: STOCK.dentalScan },
      { title: 'Laboratório', description: 'Confecção das lentes em porcelana.', imageUrl: STOCK.lab },
      { title: 'Cimentação', description: 'Instalação das lentes definitivas.', imageUrl: STOCK.smileBright },
    ],
  },
  'clareamento-dental': {
    cover: STOCK.whitening,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileBright },
    steps: [
      { title: 'Avaliação', description: 'Verificação de indicação e sensibilidade.', imageUrl: STOCK.consultation },
      { title: 'Aplicação do gel', description: 'Clareamento no consultório ou orientação para casa.', imageUrl: STOCK.dentalChair },
      { title: 'Resultado', description: 'Tom mais claro — resultado pode variar.', imageUrl: STOCK.smileBright },
    ],
  },
  'aparelho-convencional': {
    cover: STOCK.braces,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileNatural },
    steps: [
      { title: 'Documentação', description: 'Fotos, moldes e planejamento ortodôntico.', imageUrl: STOCK.dentalScan },
      { title: 'Instalação', description: 'Colagem dos bráquetes e passagem do fio.', imageUrl: STOCK.dentalTools },
      { title: 'Alinhamento', description: 'Evolução do tratamento ao longo dos meses.', imageUrl: STOCK.smileNatural },
    ],
  },
  alinhadores: {
    cover: STOCK.smileNatural,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileBright },
    steps: [
      { title: 'Scan digital', description: 'Captura 3D da arcada.', imageUrl: STOCK.dentalScan },
      { title: 'Placas transparentes', description: 'Sequência de alinhadores personalizados.', imageUrl: STOCK.lab },
      { title: 'Resultado', description: 'Sorriso alinhado — tempo varia conforme o caso.', imageUrl: STOCK.smileBright },
    ],
  },
  'tratamento-canal': {
    cover: STOCK.dentalTools,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileNatural },
    steps: [
      { title: 'Diagnóstico', description: 'Radiografia e testes de vitalidade.', imageUrl: STOCK.dentalScan },
      { title: 'Tratamento', description: 'Limpeza e selamento dos canais.', imageUrl: STOCK.dentalTools },
      { title: 'Restauração', description: 'Reconstrução do dente tratado.', imageUrl: STOCK.smileNatural },
    ],
  },
  'extracao-siso': {
    cover: STOCK.surgery,
    beforeAfter: { before: STOCK.dentalScan, after: STOCK.happyPatient },
    steps: [
      { title: 'Avaliação radiográfica', description: 'Análise da posição do siso.', imageUrl: STOCK.dentalScan },
      { title: 'Procedimento', description: 'Extração com anestesia e cuidados pós-operatórios.', imageUrl: STOCK.surgery },
      { title: 'Recuperação', description: 'Acompanhamento da cicatrização.', imageUrl: STOCK.consultation },
    ],
  },
  'limpeza-profilaxia': {
    cover: STOCK.hygiene,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileNatural },
    steps: [
      { title: 'Avaliação', description: 'Exame da gengiva e dentes.', imageUrl: STOCK.consultation },
      { title: 'Profilaxia', description: 'Remoção de placa e tártaro.', imageUrl: STOCK.hygiene },
      { title: 'Orientação', description: 'Técnicas de higiene para manutenção.', imageUrl: STOCK.smileNatural },
    ],
  },
  raspagem: {
    cover: STOCK.hygiene,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileNatural },
    steps: [
      { title: 'Diagnóstico periodontal', description: 'Sondagem e avaliação da gengiva.', imageUrl: STOCK.dentalScan },
      { title: 'Raspagem', description: 'Remoção de tártaro subgengival.', imageUrl: STOCK.hygiene },
      { title: 'Manutenção', description: 'Retornos periódicos conforme orientação.', imageUrl: STOCK.smileNatural },
    ],
  },
  gengivoplastia: {
    cover: STOCK.smileBright,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileNatural },
    steps: [
      { title: 'Análise do sorriso', description: 'Avaliação do contorno gengival.', imageUrl: STOCK.consultation },
      { title: 'Procedimento', description: 'Remodelação da gengiva.', imageUrl: STOCK.dentalTools },
      { title: 'Resultado estético', description: 'Harmonização do sorriso.', imageUrl: STOCK.smileBright },
    ],
  },
  restauracao: {
    cover: STOCK.dentalTools,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileNatural },
    steps: [
      { title: 'Remoção da cárie', description: 'Limpeza do tecido afetado.', imageUrl: STOCK.dentalTools },
      { title: 'Restauração em resina', description: 'Reconstrução estética do dente.', imageUrl: STOCK.lab },
      { title: 'Acabamento', description: 'Polimento e ajuste de mordida.', imageUrl: STOCK.smileNatural },
    ],
  },
  'coroa-dentaria': {
    cover: STOCK.lab,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileBright },
    steps: [
      { title: 'Preparo', description: 'Desgaste e moldagem do dente.', imageUrl: STOCK.dentalTools },
      { title: 'Laboratório', description: 'Confecção da coroa.', imageUrl: STOCK.lab },
      { title: 'Instalação', description: 'Cimentação da coroa definitiva.', imageUrl: STOCK.smileBright },
    ],
  },
};

const CATEGORY_FALLBACK = {
  implantodontia: STOCK.dentalTools,
  protese: STOCK.lab,
  dentistica_estetica: STOCK.smileBright,
  ortodontia: STOCK.braces,
  endodontia: STOCK.dentalTools,
  cirurgia: STOCK.surgery,
  periodontia: STOCK.hygiene,
};

export function getPhotoBankEntry(slug, category, title) {
  if (BANK[slug]) return BANK[slug];
  const cover = CATEGORY_FALLBACK[category] || STOCK.consultation;
  return {
    cover,
    beforeAfter: { before: STOCK.smileClose, after: STOCK.smileNatural },
    steps: [
      { title: `Sobre ${title}`, description: 'Avaliação clínica personalizada para definir o melhor plano.', imageUrl: cover },
      { title: 'Tratamento', description: 'Execução conforme indicação do dentista responsável.', imageUrl: STOCK.dentalChair },
      { title: 'Acompanhamento', description: 'Retornos e orientações de cuidados.', imageUrl: STOCK.smileNatural },
    ],
  };
}

export function buildPhotoAssets(slug, category, title) {
  const entry = getPhotoBankEntry(slug, category, title);
  const gallery = entry.steps.map((step, index) => ({
    caption: step.title,
    description: step.description,
    imageUrl: step.imageUrl,
    imageType: index === 0 ? 'cover' : 'step',
    sortOrder: index,
  }));

  if (entry.beforeAfter?.before) {
    gallery.push({
      caption: 'Antes do tratamento',
      imageUrl: entry.beforeAfter.before,
      imageType: 'before',
      sortOrder: 100,
    });
  }
  if (entry.beforeAfter?.after) {
    gallery.push({
      caption: 'Depois do tratamento',
      imageUrl: entry.beforeAfter.after,
      imageType: 'after',
      sortOrder: 101,
    });
  }

  return {
    coverImageUrl: entry.cover,
    beforeAfter: entry.beforeAfter || null,
    steps: entry.steps,
    gallery,
  };
}

export function isLegacyGuideMedia(url) {
  const value = String(url || '');
  return value.startsWith('data:image/svg+xml')
    || value.includes('substitua pela imagem');
}
