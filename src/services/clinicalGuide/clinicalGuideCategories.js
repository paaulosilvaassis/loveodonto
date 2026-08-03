export const CLINICAL_GUIDE_CATEGORIES = [
  {
    id: 'implantodontia',
    label: 'Implantodontia',
    treatments: [
      'implante-unitario',
      'protocolo-total',
      'protocolo-superior',
      'protocolo-inferior',
      'overdenture',
      'protese-sobre-implante',
      'enxerto-osseo',
    ],
  },
  {
    id: 'protese',
    label: 'Prótese',
    treatments: [
      'protese-total',
      'protese-parcial-removivel',
      'flexite',
      'ponte-fixa',
      'coroa-dentaria',
      'nucleo-pino',
    ],
  },
  {
    id: 'dentistica_estetica',
    label: 'Dentística / Estética',
    treatments: [
      'lente-contato-resina',
      'lente-contato-porcelana',
      'restauracao',
      'clareamento-dental',
      'faceta-resina',
      'gengivoplastia',
    ],
  },
  {
    id: 'ortodontia',
    label: 'Ortodontia',
    treatments: [
      'aparelho-convencional',
      'aparelho-autoligado',
      'alinhadores',
      'manutencao-ortodontica',
    ],
  },
  {
    id: 'endodontia',
    label: 'Endodontia',
    treatments: [
      'tratamento-canal',
      'retratamento-canal',
    ],
  },
  {
    id: 'cirurgia',
    label: 'Cirurgia',
    treatments: [
      'extracao-simples',
      'extracao-siso',
      'frenectomia',
      'bichectomia',
    ],
  },
  {
    id: 'periodontia',
    label: 'Periodontia',
    treatments: [
      'limpeza-profilaxia',
      'raspagem',
      'tratamento-periodontal',
    ],
  },
];

export const CLINICAL_GUIDE_CATEGORY_LABELS = Object.fromEntries(
  CLINICAL_GUIDE_CATEGORIES.map((c) => [c.id, c.label]),
);

export function getCategoryLabel(categoryId) {
  return CLINICAL_GUIDE_CATEGORY_LABELS[categoryId] || categoryId || 'Outros';
}
