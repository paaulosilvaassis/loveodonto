/**
 * Converte valor inteiro (0..999999999) para extenso em português (BR), uso em contratos.
 * Centavos não tratados aqui — arredonde antes se necessário.
 */
const UNIDADES = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n) {
  let x = Math.floor(Number(n) || 0);
  if (x < 0) x = 0;
  if (x === 0) return '';
  if (x === 100) return 'cem';
  if (x < 20) return UNIDADES[x];
  if (x < 100) {
    const u = x % 10;
    const d = Math.floor(x / 10);
    const base = DEZENAS[d];
    return u ? `${base} e ${UNIDADES[u]}` : base;
  }
  const c = Math.floor(x / 100);
  const rest = x % 100;
  const cTxt = CENTENAS[c];
  if (!rest) return cTxt;
  return `${cTxt} e ${ate999(rest)}`.replace(' e zero', '');
}

function milhares(n) {
  let x = Math.floor(Number(n) || 0);
  if (x === 0) return 'zero';
  const partes = [];
  const milM = Math.floor(x / 1_000_000);
  if (milM) {
    partes.push(milM === 1 ? 'um milhão' : `${ate999(milM)} milhões`);
    x %= 1_000_000;
  }
  const mil = Math.floor(x / 1000);
  if (mil) {
    partes.push(mil === 1 ? 'mil' : `${ate999(mil)} mil`);
    x %= 1000;
  }
  if (x) partes.push(ate999(x) || String(x));
  return partes.join(' e ').replace(/\s+e\s+mil\b/g, ' mil').replace(/^um mil\b/, 'mil');
}

export function integerToWordsPt(n) {
  const v = Math.floor(Number(n) || 0);
  if (!Number.isFinite(v) || v < 0) return 'zero';
  if (v === 0) return 'zero';
  return milhares(v);
}

export function currencyToWordsPt(value) {
  const reais = Math.floor(Number(value) || 0);
  const cents = Math.round(((Number(value) || 0) - reais) * 100);
  let s = `${integerToWordsPt(reais)} real${reais === 1 ? '' : 'is'}`;
  if (cents > 0) s += ` e ${integerToWordsPt(cents)} centavo${cents === 1 ? '' : 's'}`;
  return s;
}
