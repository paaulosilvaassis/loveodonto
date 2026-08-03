import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import Button from '../../../components/Button.jsx';

/**
 * Editor reordenável genérico para listas de configuração CRM.
 */
export function CrmOrderedListEditor({
  items,
  onChange,
  labelField = 'label',
  placeholder = 'Nome',
  emptyLabel = 'Nenhum item cadastrado.',
  addLabel = 'Adicionar',
  showActiveToggle = true,
}) {
  const update = (index, patch) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const move = (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (index) => onChange(items.filter((_, i) => i !== index));

  const add = () => onChange([...items, { id: null, [labelField]: '', isActive: true }]);

  return (
    <div className="crm-settings-list-editor">
      {items.length === 0 && <p className="crm-dash-empty">{emptyLabel}</p>}
      <ul className="crm-settings-list">
        {items.map((item, index) => (
          <li key={item.id || `new-${index}`} className={`crm-settings-list-row ${item.isActive === false ? 'is-inactive' : ''}`}>
            <div className="crm-settings-list-order">
              <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp size={14} />
              </button>
              <button type="button" aria-label="Descer" disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown size={14} />
              </button>
            </div>
            <input
              type="text"
              className="crm-settings-list-input"
              value={item[labelField] || ''}
              placeholder={placeholder}
              onChange={(e) => update(index, { [labelField]: e.target.value })}
            />
            {showActiveToggle && (
              <label className="crm-settings-list-active">
                <input
                  type="checkbox"
                  checked={item.isActive !== false}
                  onChange={() => update(index, { isActive: item.isActive === false })}
                />
                Ativo
              </label>
            )}
            <button type="button" className="crm-settings-list-delete" aria-label="Excluir" onClick={() => remove(index)}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={add}>{addLabel}</Button>
    </div>
  );
}
