import { forwardRef } from 'react';
import { clsx } from 'clsx';

/**
 * Componente Button padronizado do Design System Gestão Odonto
 * @param {Object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'} props.variant - Variante do botão
 * @param {'sm'|'md'|'lg'} props.size - Tamanho do botão
 * @param {React.ReactNode} props.children - Conteúdo do botão
 * @param {React.ReactNode} props.icon - Ícone (lucide-react)
 * @param {boolean} props.loading - Estado de carregamento
 * @param {boolean} props.disabled - Estado desabilitado
 * @param {string} props.className - Classes CSS adicionais
 */
const Button = forwardRef(
  (
    {
      variant = 'primary',
      size = 'md',
      children,
      icon: Icon,
      loading = false,
      disabled = false,
      className = '',
      ...props
    },
    ref
  ) => {
    const classes = clsx(
      'btn',
      `btn-${variant}`,
      `btn-${size}`,
      {
        'btn-loading': loading,
        'btn-disabled': disabled,
      },
      className
    );

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <span className="btn-spinner" aria-hidden="true" />
        ) : Icon ? (
          <Icon size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20} className="btn-icon" />
        ) : null}
        {children && <span className="btn-text">{children}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
