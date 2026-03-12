/**
 * Ícone oficial de Suporte Love Odonto.
 * SVG vetorial inline, degradê azul ou currentColor (inverse).
 */
export default function SupportIcon({
  size = 24,
  variant = 'full', // 'full' | 'minimal'
  inverse = false, // true = usa currentColor (para botões com gradiente)
  className = '',
  ...props
}) {
  const fillColor = inverse ? 'currentColor' : 'url(#support-icon-grad-minimal)';

  if (variant === 'minimal') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden
        role="img"
        {...props}
      >
        {!inverse && (
          <defs>
            <linearGradient id="support-icon-grad-minimal" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1e3a8a" />
            </linearGradient>
          </defs>
        )}
        {/* Headset minimalista: arco + auriculares + microfone */}
        <path
          d="M7 11c0-2.76 2.24-5 5-5s5 2.24 5 5"
          stroke={fillColor}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="7" cy="11" rx="2.5" ry="2.8" fill={fillColor} />
        <ellipse cx="17" cy="11" rx="2.5" ry="2.8" fill={fillColor} />
        <path
          d="M17 14v4l-1 1"
          stroke={fillColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="16" cy="19" r="1.2" fill={fillColor} />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      role="img"
      {...props}
    >
      <defs>
        <linearGradient id="support-icon-grad-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="support-icon-grad-main" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      {/* Círculo de fundo sutil */}
      <circle cx="12" cy="12" r="11" fill="url(#support-icon-grad-bg)" />
      {/* Arco do headset */}
      <path
        d="M7 11c0-2.76 2.24-5 5-5s5 2.24 5 5"
        stroke="url(#support-icon-grad-main)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Auricular esquerdo */}
      <ellipse cx="7" cy="11" rx="2.2" ry="2.5" fill="url(#support-icon-grad-main)" />
      {/* Auricular direito */}
      <ellipse cx="17" cy="11" rx="2.2" ry="2.5" fill="url(#support-icon-grad-main)" />
      {/* Haste do microfone */}
      <path
        d="M17 13.5c0 0 1.5 2 0 3.5"
        stroke="url(#support-icon-grad-main)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Cápsula do microfone */}
      <ellipse cx="16.5" cy="17" rx="1.2" ry="1.5" fill="url(#support-icon-grad-main)" />
    </svg>
  );
}
