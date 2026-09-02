import { createId } from '../helpers.js';
import { DB_NO_CHANGE } from '../../db/noChange.js';
import {
  buildPhotoAssets,
  isLegacyGuideMedia,
  PHOTO_BANK_VERSION,
} from './clinicalGuidePhotoBank.js';

const DISCLAIMER = 'O tempo, as etapas e os resultados podem variar conforme avaliação clínica individual. O dentista responsável irá avaliar a indicação de cada caso.';

function baseGuide({
  slug,
  title,
  category,
  shortDescription,
  patientDescription,
  technicalDescription,
  indications = [],
  contraindications = [],
  treatmentSteps = [],
  preCare = [],
  postCare = [],
  benefits = [],
  risks = [],
  averageDuration = '',
  faq = [],
  internalNotes = '',
  keywords = [],
  images = [],
  photoAssets = null,
}) {
  const now = new Date().toISOString();
  const guideId = createId('cguide');
  const assets = photoAssets || buildPhotoAssets(slug, category, title);
  const coverUrl = images[0]?.imageUrl || assets.coverImageUrl;
  const stepSource = images.length ? images : assets.gallery.filter((g) => g.imageType === 'step' || g.imageType === 'cover');

  return {
    guide: {
      id: guideId,
      tenantId: null,
      title,
      slug,
      category,
      shortDescription,
      patientDescription: `${patientDescription}\n\n${DISCLAIMER}`,
      technicalDescription,
      indications,
      contraindications,
      treatmentSteps: treatmentSteps.length ? treatmentSteps : assets.steps.map((s) => ({
        title: s.title,
        description: s.description,
      })),
      preCare,
      postCare,
      benefits,
      risks,
      averageDuration,
      faq,
      internalNotes,
      coverImageUrl: coverUrl,
      beforeAfter: assets.beforeAfter || null,
      videos: [],
      pdfUrl: '',
      mediaVersion: PHOTO_BANK_VERSION,
      isSystemDefault: true,
      isCustom: false,
      visibility: 'all',
      active: true,
      keywords,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    images: (images.length ? images : assets.gallery).map((img, index) => ({
      id: createId('cguideimg'),
      tenantId: null,
      guideId,
      imageUrl: img.imageUrl,
      caption: img.caption || '',
      description: img.description || '',
      imageType: img.imageType || (index === 0 ? 'cover' : 'step'),
      sortOrder: img.sortOrder ?? index,
      visibleToPatient: img.visibleToPatient !== false,
      createdAt: now,
    })),
  };
}

function simpleGuide(slug, title, category, patientDescription, extra = {}) {
  return baseGuide({
    slug,
    title,
    category,
    shortDescription: patientDescription.slice(0, 120),
    patientDescription,
    technicalDescription: extra.technicalDescription || `Procedimento odontológico da categoria ${category}. Avaliação clínica, planejamento e execução conforme protocolo da clínica.`,
    indications: extra.indications || ['Indicação avaliada individualmente pelo dentista responsável.'],
    contraindications: extra.contraindications || ['Contraindicações devem ser verificadas na consulta.'],
    treatmentSteps: extra.treatmentSteps || [
      { title: 'Consulta e avaliação', description: 'Exame clínico, anamnese e definição do plano.' },
      { title: 'Planejamento', description: 'Explicação das etapas e orçamento apresentado ao paciente.' },
      { title: 'Execução', description: 'Realização do procedimento conforme indicação clínica.' },
      { title: 'Acompanhamento', description: 'Retornos e orientações de cuidados.' },
    ],
    preCare: extra.preCare || ['Comparecer com exames solicitados, se houver.', 'Informar medicamentos e alergias.'],
    postCare: extra.postCare || ['Seguir orientações do dentista responsável.', 'Manter higiene oral adequada.'],
    benefits: extra.benefits || ['Melhora funcional e/ou estética conforme o caso de cada paciente.'],
    risks: extra.risks || ['Riscos e limitações serão explicados na consulta; podem variar conforme avaliação clínica.'],
    averageDuration: extra.averageDuration || 'Depende do caso de cada paciente.',
    faq: extra.faq || [
      { question: 'Dói?', answer: 'O conforto pode variar; anestesia e técnicas modernas ajudam a tornar o procedimento mais tranquilo.' },
      { question: 'Quanto tempo dura?', answer: 'O tempo pode variar conforme avaliação clínica e complexidade do caso.' },
    ],
    keywords: extra.keywords || [title.toLowerCase(), slug.replace(/-/g, ' ')],
    treatmentSteps: extra.treatmentSteps,
    images: extra.images || [],
    photoAssets: buildPhotoAssets(slug, category, title),
  });
}

export function buildProtocoloTotalGuide() {
  return baseGuide({
    slug: 'protocolo-total',
    title: 'Protocolo Total',
    category: 'implantodontia',
    shortDescription: 'Reabilitação fixa da arcada com implantes e prótese protocolo — explicação didática para apresentação ao paciente.',
    patientDescription: `O protocolo total é uma forma de reabilitar uma arcada (superior, inferior ou ambas) com dentes fixos apoiados em implantes. Em vez de usar uma dentadura removível, a prótese fica fixada sobre os implantes, oferecendo mais estabilidade no dia a dia.

A diferença principal em relação à dentadura convencional é que o protocolo é fixo: não precisa ser retirado para dormir (salvo orientação específica do dentista) e tende a proporcionar mais segurança na fala e na mastigação. A quantidade de implantes pode variar conforme avaliação clínica — geralmente são utilizados de quatro a seis implantes por arcada, mas isso depende do caso de cada paciente.

O tratamento costuma ser dividido em fases: avaliação e planejamento, cirurgia de instalação dos implantes, período de cicatrização/osseointegração, fases de prova da prótese e, por fim, instalação da prótese definitiva. O tempo total pode variar de alguns meses, conforme condição óssea, saúde geral e necessidade de procedimentos complementares.`,
    technicalDescription: `Reabilitação fixa implantossuportada (protocolo/acrylic hybrid ou similar) com planejamento radiográfico e cirúrgico guiado quando indicado. Avaliar qualidade e quantidade óssea, necessidade de enxerto, torque de inserção, distribuição de implantes e tipo de prótese (PMMA provisória, estrutura em metal/resina, cerâmica). Documentar fases cirúrgica, protética e de manutenção.`,
    indications: [
      'Edêntulos totais ou próximos, com indicação para reabilitação fixa.',
      'Pacientes que buscam alternativa à prótese removível convencional.',
      'Condição sistêmica e hábitos compatíveis com cirurgia implantar (avaliação individual).',
    ],
    contraindications: [
      'Infecções ativas não controladas.',
      'Condições sistêmicas descompensadas sem liberação médica.',
      'Hábitos ou fatores que comprometam prognóstico (avaliação individual).',
    ],
    treatmentSteps: [
      { title: 'Avaliação e exames', description: 'Consulta, tomografia/planejamento e definição do número de implantes.' },
      { title: 'Fase cirúrgica', description: 'Instalação dos implantes na arcada; pode incluir exodontias e enxertos.' },
      { title: 'Cicatrização / osseointegração', description: 'Período em que o osso se integra aos implantes; duração varia conforme o caso.' },
      { title: 'Prova da prótese', description: 'Ajustes de oclusão, estética e conforto antes da versão definitiva.' },
      { title: 'Instalação definitiva', description: 'Fixação da prótese protocolo sobre os implantes.' },
      { title: 'Manutenção', description: 'Retornos periódicos e orientação de higienização.' },
    ],
    preCare: [
      'Trazer exames solicitados (radiografias, tomografia).',
      'Informar medicamentos, alergias e histórico médico.',
      'Evitar fumar antes da cirurgia, se orientado pelo dentista.',
    ],
    postCare: [
      'Higienização com escova, fio dental e acessórios indicados (ex.: passa-fio).',
      'Retornos de revisão conforme cronograma da clínica.',
      'Procurar a clínica em caso de mobilidade, dor persistente ou sangramento.',
    ],
    benefits: [
      'Reabilitação fixa com melhor estabilidade que prótese removível convencional, conforme o caso.',
      'Recuperação funcional e estética da arcada.',
      'Maior conforto na fala e mastigação para muitos pacientes.',
    ],
    risks: [
      'Falha de osseointegração (pode variar conforme avaliação clínica).',
      'Necessidade de manutenção periódica da prótese e dos implantes.',
      'Possibilidade de ajustes ou retratamento em casos específicos.',
    ],
    averageDuration: 'Em geral de 4 a 12 meses, podendo variar conforme avaliação clínica.',
    faq: [
      { question: 'Qual a diferença entre dentadura e protocolo?', answer: 'A dentadura é removível e apoiada na gengiva; o protocolo é fixo sobre implantes, com maior estabilidade na maioria dos casos.' },
      { question: 'Quantos implantes são usados?', answer: 'Geralmente de 4 a 6 por arcada, mas pode variar conforme avaliação clínica de cada paciente.' },
      { question: 'Posso comer normalmente?', answer: 'Após a fase de adaptação e liberação do dentista, a mastigação tende a melhorar; o ritmo depende do caso.' },
      { question: 'Como higienizar?', answer: 'Com escova, fio ou passa-fio específicos e orientação da equipe; a higiene é fundamental para a longevidade do tratamento.' },
    ],
    internalNotes: 'Usar este guia para apresentação visual durante orçamento de protocolo. Personalize imagens com fotos da clínica.',
    keywords: ['protocolo total', 'protocolo', 'implante', 'arcada', 'edentulo', 'prótese fixa'],
    photoAssets: buildPhotoAssets('protocolo-total', 'implantodontia', 'Protocolo Total'),
  });
}

export function buildClinicalGuideSeedData() {
  const guides = [];
  const images = [];

  const push = (entry) => {
    guides.push(entry.guide);
    images.push(...entry.images);
  };

  push(buildProtocoloTotalGuide());

  push(simpleGuide(
    'implante-unitario',
    'Implante Unitário',
    'implantodontia',
    'O implante unitário substitui um dente ausente por um pino de titânio inserido no osso e uma coroa sobre ele. É uma opção para recuperar função e estética de um único dente, sem desgastar dentes vizinhos. O tempo de tratamento pode variar conforme avaliação clínica.',
    {
      averageDuration: '3 a 6 meses (pode variar).',
      keywords: ['implante', 'implante unitário', 'coroa sobre implante'],
    },
  ));

  push(simpleGuide(
    'protese-sobre-implante',
    'Prótese sobre Implante',
    'implantodontia',
    'Prótese fixa ou removível apoiada em implantes para reabilitar um ou mais dentes. A indicação e o tipo de prótese dependem do caso de cada paciente.',
    { keywords: ['prótese sobre implante', 'implante', 'coroa implante'] },
  ));

  push(simpleGuide(
    'overdenture',
    'Overdenture',
    'implantodontia',
    'Prótese removível apoiada em implantes que oferece mais retenção que a dentadura convencional. Pode ser indicada quando a reabilitação fixa completa não é possível ou desejada.',
    { keywords: ['overdenture', 'prótese removível', 'implante'] },
  ));

  push(simpleGuide(
    'flexite',
    'Flexite',
    'protese',
    'Prótese parcial removível em material flexível (nylon/flexite), geralmente mais estética e confortável que metálicas em alguns casos. A indicação depende da avaliação clínica.',
    { keywords: ['flexite', 'prótese flexível', 'prótese parcial'] },
  ));

  push(simpleGuide(
    'lente-contato-resina',
    'Lente de Contato em Resina',
    'dentistica_estetica',
    'Lâminas finas em resina composta para melhorar forma e cor dos dentes anteriores. Resultado e durabilidade podem variar conforme avaliação clínica e hábitos do paciente.',
    { keywords: ['lente de contato', 'lente resina', 'estética'] },
  ));

  push(simpleGuide(
    'lente-contato-porcelana',
    'Lente de Contato em Porcelana',
    'dentistica_estetica',
    'Lâminas cerâmicas ultrafinas para harmonização estética do sorriso. Exige planejamento e provas; o resultado depende do caso de cada paciente.',
    { keywords: ['lente de contato', 'lente porcelana', 'faceta cerâmica'] },
  ));

  push(simpleGuide(
    'clareamento-dental',
    'Clareamento Dental',
    'dentistica_estetica',
    'Procedimento para clarear a cor natural dos dentes, realizado no consultório, em casa ou combinado. Sensibilidade e resultado podem variar conforme avaliação clínica.',
    {
      postCare: ['Evitar alimentos pigmentados nas primeiras 48h, se orientado.', 'Usar produtos recomendados pelo dentista.'],
      keywords: ['clareamento', 'clareamento dental', 'estética'],
    },
  ));

  push(simpleGuide(
    'restauracao',
    'Restauração',
    'dentistica_estetica',
    'Reconstrução de parte do dente afetada por cárie, fratura ou desgaste, com material estético (resina) ou outro indicado. Preserva estrutura dental saudável.',
    { keywords: ['restauração', 'obturação', 'resina', 'cárie'] },
  ));

  push(simpleGuide(
    'tratamento-canal',
    'Tratamento de Canal',
    'endodontia',
    'Procedimento para tratar inflamação ou infecção na polpa do dente, removendo o tecido doente e selando o canal. Permite manter o dente na boca quando indicado.',
    {
      averageDuration: '1 a 3 sessões (pode variar).',
      keywords: ['canal', 'endodontia', 'tratamento de canal'],
    },
  ));

  push(simpleGuide(
    'extracao-siso',
    'Extração de Siso',
    'cirurgia',
    'Remoção cirúrgica do dente do siso (terceiro molar) quando há indicação clínica — dor, infecção, apinhamento ou risco de complicações. A complexidade varia conforme posição do dente.',
    {
      postCare: ['Repouso relativo.', 'Compressas e medicação conforme prescrição.', 'Evitar bochechos vigorosos nas primeiras 24h.'],
      keywords: ['siso', 'terceiro molar', 'extração', 'exodontia'],
    },
  ));

  push(simpleGuide(
    'aparelho-convencional',
    'Aparelho Ortodôntico',
    'ortodontia',
    'Aparelho fixo ou removível para corrigir alinhamento, mordida e espaçamentos. O tempo de tratamento depende da complexidade de cada caso.',
    {
      averageDuration: '12 a 36 meses (pode variar).',
      keywords: ['aparelho', 'ortodontia', 'aparelho fixo', 'bráquete'],
    },
  ));

  push(simpleGuide(
    'alinhadores',
    'Alinhadores',
    'ortodontia',
    'Placas transparentes removíveis que movem os dentes gradualmente. Exige disciplina no uso e troca conforme orientação. Indicação depende da avaliação ortodôntica.',
    {
      averageDuration: '6 a 24 meses (pode variar).',
      keywords: ['alinhador', 'invisalign', 'ortodontia transparente'],
    },
  ));

  push(simpleGuide(
    'limpeza-profilaxia',
    'Limpeza / Profilaxia',
    'periodontia',
    'Remoção de placa bacteriana e tártaro superficial para prevenção de cáries e doença gengival. Recomendada periodicamente conforme orientação do dentista.',
    {
      averageDuration: '1 sessão.',
      keywords: ['limpeza', 'profilaxia', 'higiene', 'tártaro'],
    },
  ));

  push(simpleGuide(
    'raspagem',
    'Raspagem Periodontal',
    'periodontia',
    'Procedimento para remover tártaro abaixo da gengiva e tratar inflamação periodontal. Pode ser realizado em uma ou mais sessões, conforme avaliação clínica.',
    { keywords: ['raspagem', 'periodontia', 'gengiva', 'tártaro'] },
  ));

  push(simpleGuide(
    'gengivoplastia',
    'Gengivoplastia',
    'dentistica_estetica',
    'Procedimento para remodelar o contorno gengival e harmonizar o sorriso. Pode ser indicado por motivos estéticos ou funcionais, conforme avaliação.',
    { keywords: ['gengivoplastia', 'gengiva', 'estética gengival'] },
  ));

  push(simpleGuide(
    'ponte-fixa',
    'Ponte Fixa',
    'protese',
    'Prótese fixa que substitui um ou mais dentes ausentes, apoiada nos dentes pilares adjacentes. Indicada quando há dentes saudáveis para suporte.',
    { keywords: ['ponte', 'ponte fixa', 'prótese fixa'] },
  ));

  push(simpleGuide(
    'coroa-dentaria',
    'Coroa Dentária',
    'protese',
    'Restauração que cobre o dente para recuperar forma, função e estética após tratamento de canal, fratura extensa ou desgaste. Material definido na consulta.',
    { keywords: ['coroa', 'coroa dentária', 'prótese coroa'] },
  ));

  return { guides, images };
}

function needsPhotoRefresh(guide, images) {
  if (!guide?.isSystemDefault) return false;
  if (Number(guide.mediaVersion) < PHOTO_BANK_VERSION) return true;
  if (isLegacyGuideMedia(guide.coverImageUrl)) return true;
  return images.some((img) => isLegacyGuideMedia(img.imageUrl));
}

export function backfillClinicalGuideImages(db, { changedRef } = {}) {
  if (!Array.isArray(db.clinicalGuides)) return db;
  if (!Array.isArray(db.clinicalGuideImages)) db.clinicalGuideImages = [];

  let changed = false;
  for (const guide of db.clinicalGuides) {
    if (!guide?.id || guide.deletedAt) continue;

    const existing = db.clinicalGuideImages.filter((img) => img.guideId === guide.id);
    if (!needsPhotoRefresh(guide, existing) && existing.length > 0) continue;

    changed = true;
    const assets = buildPhotoAssets(guide.slug, guide.category, guide.title);
    db.clinicalGuideImages = db.clinicalGuideImages.filter((img) => img.guideId !== guide.id);

    const now = new Date().toISOString();
    assets.gallery.forEach((item, index) => {
      db.clinicalGuideImages.push({
        id: createId('cguideimg'),
        tenantId: guide.tenantId || null,
        guideId: guide.id,
        imageUrl: item.imageUrl,
        caption: item.caption,
        description: item.description || '',
        imageType: item.imageType || 'step',
        sortOrder: item.sortOrder ?? index,
        visibleToPatient: true,
        createdAt: now,
      });
    });

    const guideIndex = db.clinicalGuides.findIndex((g) => g.id === guide.id);
    if (guideIndex >= 0) {
      db.clinicalGuides[guideIndex] = {
        ...db.clinicalGuides[guideIndex],
        coverImageUrl: assets.coverImageUrl,
        beforeAfter: assets.beforeAfter,
        treatmentSteps: (guide.treatmentSteps?.length && guide.slug !== 'protocolo-total')
          ? guide.treatmentSteps
          : assets.steps.map((s) => ({ title: s.title, description: s.description })),
        mediaVersion: PHOTO_BANK_VERSION,
        updatedAt: now,
      };
    }
  }

  if (db.clinicalGuidesMediaVersion !== PHOTO_BANK_VERSION) {
    db.clinicalGuidesMediaVersion = PHOTO_BANK_VERSION;
    changed = true;
  }
  if (changedRef) changedRef.changed = Boolean(changedRef.changed) || changed;
  return db;
}

function applyClinicalGuideSeed(db) {
  const changedRef = { changed: false };
  if (!Array.isArray(db.clinicalGuides)) {
    db.clinicalGuides = [];
    changedRef.changed = true;
  }
  if (!Array.isArray(db.clinicalGuideImages)) {
    db.clinicalGuideImages = [];
    changedRef.changed = true;
  }

  if (db.clinicalGuides.length === 0) {
    const { guides, images } = buildClinicalGuideSeedData();
    db.clinicalGuides = guides;
    db.clinicalGuideImages = images;
    db.clinicalGuidesMediaVersion = PHOTO_BANK_VERSION;
    return db;
  }

  backfillClinicalGuideImages(db, { changedRef });
  if (!changedRef.changed) return DB_NO_CHANGE;
  return db;
}

/** Migrations exigem sempre o db. Writers de runtime usam apply + DB_NO_CHANGE. */
export function seedClinicalGuidesForDb(db) {
  const result = applyClinicalGuideSeed(db);
  return result === DB_NO_CHANGE ? db : result;
}

export { applyClinicalGuideSeed };
