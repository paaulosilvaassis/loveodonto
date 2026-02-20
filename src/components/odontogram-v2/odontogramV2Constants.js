export const FDI_UPPER_PERMANENT = [
  '18', '17', '16', '15', '14', '13', '12', '11',
  '21', '22', '23', '24', '25', '26', '27', '28',
];

export const FDI_LOWER_PERMANENT = [
  '48', '47', '46', '45', '44', '43', '42', '41',
  '31', '32', '33', '34', '35', '36', '37', '38',
];

export const FDI_UPPER_DECIDUOUS = [
  '55', '54', '53', '52', '51',
  '61', '62', '63', '64', '65',
];

export const FDI_LOWER_DECIDUOUS = [
  '85', '84', '83', '82', '81',
  '71', '72', '73', '74', '75',
];

export const FDI_PERMANENT = [...FDI_UPPER_PERMANENT, ...FDI_LOWER_PERMANENT];
export const FDI_DECIDUOUS = [...FDI_UPPER_DECIDUOUS, ...FDI_LOWER_DECIDUOUS];

export const FACES = ['O', 'M', 'D', 'V', 'L', 'P'];

export const FACE_LABELS = {
  O: 'Oclusal/Incisal',
  M: 'Mesial',
  D: 'Distal',
  V: 'Vestibular',
  L: 'Lingual',
  P: 'Palatina',
};

export const STATUS_OPTIONS = [
  { value: 'HIGIDO', label: 'Hígido', color: '#22c55e' },
  { value: 'CARIE', label: 'Cárie', color: '#dc2626' },
  { value: 'RESTAURACAO', label: 'Restauração', color: '#2563eb' },
  { value: 'AUSENTE', label: 'Ausente', color: '#64748b' },
  { value: 'SELANTE', label: 'Selante', color: '#0ea5e9' },
  { value: 'EXTRACAO', label: 'Extração', color: '#f97316' },
];

export const DEFAULT_TOOTH_STATE = {
  status: 'HIGIDO',
  surfaces: { O: false, M: false, D: false, V: false, L: false, P: false },
  notes: '',
  implant: false,
};
