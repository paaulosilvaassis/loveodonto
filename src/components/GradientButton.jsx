import { forwardRef } from 'react';

/**
 * Botão com gradiente premium para ações principais e secundárias
 * @param {Object} props
 * @param {'primary'|'secondary'} props.variant - Variante do botão (primary: roxo→azul, secondary: rosa→roxo)
 * @param {React.ReactNode} props.children - Conteúdo do botão
 * @param {React.ReactNode} props.icon - Ícone (lucide-react)
 * @param {string} props.className - Classes CSS adicionais
 * @param {string} props.ariaLabel - Label para acessibilidade
 */
const GradientButton = forwardRef(
  ({ variant = 'primary', children, icon: Icon, className = '', ariaLabel, ...props }, ref) => {
    const baseClasses = 'gradient-button';
    const variantClasses = variant === 'primary' ? 'gradient-button-primary' : 'gradient-button-secondary';
    const combinedClasses = `${baseClasses} ${variantClasses} ${className}`.trim();

    return (
      <button ref={ref} className={combinedClasses} aria-label={ariaLabel} {...props}>
        {Icon && <Icon size={20} className="gradient-button-icon" />}
        {children && <span className="gradient-button-text">{children}</span>}
      </button>
    );
  }
);

GradientButton.displayName = 'GradientButton';

export default GradientButton;
