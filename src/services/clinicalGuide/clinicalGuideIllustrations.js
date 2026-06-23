/**
 * Ilustrações SVG educativas para o Guia Clínico.
 * Usa base64 para máxima compatibilidade em <img src>.
 */

function svgToDataUrl(svg) {
  if (typeof Buffer !== 'undefined') {
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
  }
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function wrapIllustration(content, { bg = '#f8fafc', title = '' } = {}) {
  const titleBlock = title
    ? `<text x="400" y="36" text-anchor="middle" fill="#334155" font-family="system-ui,sans-serif" font-size="18" font-weight="600">${title}</text>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
    <rect fill="${bg}" width="800" height="500" rx="16"/>
    ${titleBlock}
    ${content}
  </svg>`;
  return svgToDataUrl(svg);
}

/** Arcada edêntula */
export function illustrateEdentulousArch(caption = 'Arcada sem dentes') {
  return wrapIllustration(`
    <ellipse cx="400" cy="300" rx="220" ry="90" fill="#fda4af" opacity="0.35"/>
    <path d="M200 280 Q400 180 600 280" stroke="#e11d48" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M220 310 Q400 250 580 310" stroke="#fb7185" stroke-width="14" fill="none" stroke-linecap="round"/>
    <text x="400" y="420" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="14">${caption}</text>
  `, { bg: '#fff1f2', title: 'Situação inicial' });
}

/** Implantes instalados */
export function illustrateImplantsInstalled(caption = 'Implantes na arcada') {
  return wrapIllustration(`
    <ellipse cx="400" cy="300" rx="220" ry="90" fill="#fde68a" opacity="0.3"/>
    <path d="M220 310 Q400 250 580 310" stroke="#d97706" stroke-width="12" fill="none"/>
    <rect x="268" y="250" width="18" height="70" rx="4" fill="#94a3b8"/>
    <rect x="348" y="235" width="18" height="85" rx="4" fill="#94a3b8"/>
    <rect x="434" y="235" width="18" height="85" rx="4" fill="#94a3b8"/>
    <rect x="514" y="250" width="18" height="70" rx="4" fill="#94a3b8"/>
    <circle cx="277" cy="245" r="10" fill="#64748b"/>
    <circle cx="357" cy="230" r="10" fill="#64748b"/>
    <circle cx="443" cy="230" r="10" fill="#64748b"/>
    <circle cx="523" cy="245" r="10" fill="#64748b"/>
    <text x="400" y="420" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="14">${caption}</text>
  `, { bg: '#fffbeb', title: 'Fase cirúrgica' });
}

/** Barra / prótese protocolo */
export function illustrateProsthesisBar(caption = 'Estrutura da prótese') {
  return wrapIllustration(`
    <path d="M200 290 Q400 220 600 290" stroke="#fb7185" stroke-width="10" fill="none"/>
    <rect x="240" y="255" width="320" height="22" rx="11" fill="#3b82f6"/>
    <rect x="270" y="277" width="18" height="40" fill="#94a3b8"/>
    <rect x="330" y="277" width="18" height="40" fill="#94a3b8"/>
    <rect x="390" y="277" width="18" height="40" fill="#94a3b8"/>
    <rect x="450" y="277" width="18" height="40" fill="#94a3b8"/>
    <rect x="510" y="277" width="18" height="40" fill="#94a3b8"/>
    <text x="400" y="420" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="14">${caption}</text>
  `, { bg: '#eff6ff', title: 'Estrutura protética' });
}

/** Resultado final com dentes */
export function illustrateFinalTeeth(caption = 'Dentes fixos instalados') {
  return wrapIllustration(`
    <path d="M210 300 Q400 210 590 300" stroke="#fb7185" stroke-width="12" fill="none"/>
    <g fill="#f8fafc" stroke="#cbd5e1" stroke-width="2">
      <rect x="250" y="255" width="28" height="38" rx="8"/><rect x="290" y="245" width="28" height="48" rx="8"/>
      <rect x="330" y="240" width="28" height="53" rx="8"/><rect x="370" y="238" width="28" height="55" rx="8"/>
      <rect x="410" y="238" width="28" height="55" rx="8"/><rect x="450" y="240" width="28" height="53" rx="8"/>
      <rect x="490" y="245" width="28" height="48" rx="8"/><rect x="530" y="255" width="28" height="38" rx="8"/>
    </g>
    <text x="400" y="420" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="14">${caption}</text>
  `, { bg: '#f0fdf4', title: 'Resultado final' });
}

/** Implante unitário */
export function illustrateSingleImplant() {
  return wrapIllustration(`
    <rect x="360" y="180" width="80" height="55" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
    <rect x="385" y="235" width="30" height="90" rx="6" fill="#94a3b8"/>
    <polygon points="400,340 370,380 430,380" fill="#64748b"/>
    <text x="400" y="420" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="14">Coroa sobre implante</text>
  `, { bg: '#f8fafc', title: 'Implante unitário' });
}

/** Clareamento */
export function illustrateWhitening() {
  return wrapIllustration(`
    <g fill="#ffffff" stroke="#e2e8f0" stroke-width="2">
      <rect x="290" y="220" width="36" height="50" rx="8"/><rect x="340" y="210" width="36" height="60" rx="8"/>
      <rect x="390" y="205" width="36" height="65" rx="8"/><rect x="440" y="210" width="36" height="60" rx="8"/>
      <rect x="490" y="220" width="36" height="50" rx="8"/>
    </g>
    <circle cx="400" cy="130" r="35" fill="#fef08a" opacity="0.8"/>
    <text x="400" y="420" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="14">Harmonização da cor dental</text>
  `, { bg: '#fefce8', title: 'Clareamento dental' });
}

/** Aparelho ortodôntico */
export function illustrateBraces() {
  return wrapIllustration(`
    <g fill="#f8fafc" stroke="#cbd5e1" stroke-width="2">
      <rect x="270" y="240" width="30" height="42" rx="6"/><rect x="315" y="230" width="30" height="52" rx="6"/>
      <rect x="360" y="225" width="30" height="57" rx="6"/><rect x="405" y="225" width="30" height="57" rx="6"/>
      <rect x="450" y="230" width="30" height="52" rx="6"/><rect x="495" y="240" width="30" height="42" rx="6"/>
    </g>
    <rect x="265" y="268" width="270" height="6" rx="3" fill="#6366f1"/>
    <circle cx="285" cy="271" r="5" fill="#a5b4fc"/><circle cx="330" cy="271" r="5" fill="#a5b4fc"/>
    <circle cx="375" cy="271" r="5" fill="#a5b4fc"/><circle cx="420" cy="271" r="5" fill="#a5b4fc"/>
    <circle cx="465" cy="271" r="5" fill="#a5b4fc"/><circle cx="510" cy="271" r="5" fill="#a5b4fc"/>
    <text x="400" y="420" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="14">Bráquetes e fio metálico</text>
  `, { bg: '#eef2ff', title: 'Aparelho fixo' });
}

/** Tratamento de canal */
export function illustrateRootCanal() {
  return wrapIllustration(`
    <rect x="360" y="170" width="80" height="70" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
    <path d="M400 240 L400 360" stroke="#94a3b8" stroke-width="24" stroke-linecap="round"/>
    <path d="M400 260 L385 330 M400 260 L415 330 M400 280 L378 350 M400 280 L422 350" stroke="#f97316" stroke-width="4" fill="none"/>
    <text x="400" y="420" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="14">Limpeza e obturação dos canais</text>
  `, { bg: '#fff7ed', title: 'Tratamento de canal' });
}

/** Limpeza / profilaxia */
export function illustrateCleaning() {
  return wrapIllustration(`
    <path d="M240 300 Q400 230 560 300" stroke="#fb7185" stroke-width="14" fill="none"/>
    <path d="M280 285 Q400 250 520 285" stroke="#22c55e" stroke-width="6" fill="none" stroke-dasharray="8 6"/>
    <circle cx="520" cy="260" r="28" fill="#dbeafe" stroke="#3b82f6" stroke-width="2"/>
    <line x1="505" y1="245" x2="545" y2="285" stroke="#3b82f6" stroke-width="4"/>
    <text x="400" y="420" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="14">Remoção de placa e tártaro</text>
  `, { bg: '#f0fdf4', title: 'Profilaxia' });
}

/** Genérico por categoria */
export function illustrateByCategory(category, title = 'Tratamento') {
  const map = {
    implantodontia: illustrateSingleImplant,
    protese: illustrateFinalTeeth,
    dentistica_estetica: illustrateWhitening,
    ortodontia: illustrateBraces,
    endodontia: illustrateRootCanal,
    cirurgia: illustrateSingleImplant,
    periodontia: illustrateCleaning,
  };
  const fn = map[category];
  return fn ? fn() : wrapIllustration(`
    <circle cx="400" cy="260" r="80" fill="#e0e7ff"/>
    <text x="400" y="268" text-anchor="middle" fill="#4338ca" font-family="system-ui,sans-serif" font-size="20" font-weight="600">${title}</text>
  `, { bg: '#f8fafc', title });
}

export function getProtocoloTotalImages() {
  return [
    { caption: 'Arcada sem dentes — situação inicial', imageUrl: illustrateEdentulousArch() },
    { caption: 'Implantes instalados na arcada', imageUrl: illustrateImplantsInstalled() },
    { caption: 'Barra / estrutura da prótese sobre implantes', imageUrl: illustrateProsthesisBar() },
    { caption: 'Resultado final — dentes fixos', imageUrl: illustrateFinalTeeth() },
  ];
}

export function getDefaultGuideImages(slug, category, title) {
  if (slug === 'protocolo-total') return getProtocoloTotalImages();

  const slugMap = {
    'implante-unitario': [illustrateSingleImplant()],
    'protese-sobre-implante': [illustrateSingleImplant(), illustrateFinalTeeth()],
    overdenture: [illustrateEdentulousArch('Arcada com poucos dentes'), illustrateProsthesisBar('Overdenture sobre implantes')],
    'clareamento-dental': [illustrateWhitening()],
    'aparelho-convencional': [illustrateBraces()],
    alinhadores: [illustrateBraces()],
    'tratamento-canal': [illustrateRootCanal()],
    'limpeza-profilaxia': [illustrateCleaning()],
    raspagem: [illustrateCleaning()],
  };

  const urls = slugMap[slug] || [illustrateByCategory(category, title)];
  return urls.map((imageUrl, index) => ({
    caption: index === 0 ? `Ilustração — ${title}` : `Etapa ilustrativa — ${title}`,
    imageUrl,
  }));
}
