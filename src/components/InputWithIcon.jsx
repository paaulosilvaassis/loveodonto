import { forwardRef } from 'react';

/**
 * Input com ícone integrado
 */
const InputWithIcon = forwardRef(
  ({ icon: Icon, placeholder, value, onChange, onKeyDown, onFocus, className = '', ...props }, ref) => {
    return (
      <div className={`input-with-icon ${className}`.trim()}>
        {Icon && (
          <div className="input-with-icon-icon">
            <Icon size={20} />
          </div>
        )}
        <input
          ref={ref}
          className="input-with-icon-input"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          {...props}
        />
      </div>
    );
  }
);

InputWithIcon.displayName = 'InputWithIcon';

export default InputWithIcon;
