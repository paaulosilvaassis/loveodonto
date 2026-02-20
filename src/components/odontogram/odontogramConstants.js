export const FACE_CODES = ['M', 'D', 'V', 'L', 'O'];

export const FDI_UPPER = [
  '18', '17', '16', '15', '14', '13', '12', '11',
  '21', '22', '23', '24', '25', '26', '27', '28',
];

export const FDI_LOWER = [
  '48', '47', '46', '45', '44', '43', '42', '41',
  '31', '32', '33', '34', '35', '36', '37', '38',
];

export const BASIC_CONDITIONS = [
  { key: 'higido', label: 'Hígido', requiresFaces: false },
  { key: 'carie', label: 'Cárie', requiresFaces: true },
  { key: 'restauracao', label: 'Restauração', requiresFaces: true },
  { key: 'ausente', label: 'Ausente', requiresFaces: false },
  { key: 'extracao_indicada', label: 'Extração indicada', requiresFaces: false },
  { key: 'endodontia', label: 'Endodontia', requiresFaces: false },
  { key: 'coroa_protese', label: 'Coroa/Prótese', requiresFaces: false },
  { key: 'implante', label: 'Implante', requiresFaces: false },
  { key: 'fratura', label: 'Fratura', requiresFaces: false },
];
