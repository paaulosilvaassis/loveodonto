import { forwardRef } from 'react';

/**
 * Input de busca moderno com select integrado
 */
const SearchInputWithSelect = forwardRef(
  ({ 
    selectValue, 
    onSelectChange, 
    selectOptions, 
    inputValue, 
    onInputChange, 
    onKeyDown, 
    onFocus,
    placeholder,
    className = '',
    children,
    ...props 
  }, ref) => {
    return (
      <>
        <div className={`search-input-with-select ${className}`.trim()}>
          <div className="search-input-with-select-select-wrapper">
            <select 
              className="search-input-with-select-select"
              value={selectValue}
              onChange={onSelectChange}
              aria-label="Tipo de busca"
            >
              {selectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <input
            ref={ref}
            className="search-input-with-select-input"
            type="text"
            value={inputValue}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            placeholder={placeholder}
            {...props}
          />
        </div>
        {children}
      </>
    );
  }
);

SearchInputWithSelect.displayName = 'SearchInputWithSelect';

export default SearchInputWithSelect;
