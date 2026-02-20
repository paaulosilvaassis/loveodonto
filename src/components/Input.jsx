import { forwardRef } from 'react';
import { clsx } from 'clsx';

/**
 * Componente Input padronizado do Design System Gestão Odonto
 * @param {Object} props
 * @param {'sm'|'md'|'lg'} props.size - Tamanho do input
 * @param {React.ReactNode} props.icon - Ícone (lucide-react)
 * @param {boolean} props.error - Estado de erro
 * @param {string} props.className - Classes CSS adicionais
 */
const Input = forwardRef(
  (
    {
      size = 'md',
      icon: Icon,
      error = false,
      className = '',
      ...props
    },
    ref
  ) => {
    const classes = clsx(
      'input',
      `input-${size}`,
      {
        'input-error': error,
        'input-with-icon': Icon,
      },
      className
    );

    if (Icon) {
      return (
        <div className={clsx('input-wrapper', { 'input-wrapper-error': error })}>
          <div className="input-icon-wrapper">
            <Icon size={size === 'sm' ? 16 : size === 'lg' ? 20 : 18} />
          </div>
          <input
            ref={ref}
            className={classes}
            {...props}
          />
        </div>
      );
    }

    return (
      <input
        ref={ref}
        className={classes}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export default Input;
