import { clsx } from 'clsx';

/**
 * Componente Card padronizado do Design System Gestão Odonto
 * @param {Object} props
 * @param {React.ReactNode} props.children - Conteúdo do card
 * @param {string} props.className - Classes CSS adicionais
 * @param {boolean} props.hover - Efeito hover
 * @param {boolean} props.padding - Padding interno (padrão: true)
 */
export default function Card({ children, className = '', hover = false, padding = true, ...props }) {
  const classes = clsx(
    'card-base',
    {
      'card-hover': hover,
      'card-no-padding': !padding,
    },
    className
  );

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
