import { useEffect, useRef, useState } from 'react';
import { createSupplier } from '../services/suppliersService.js';
import { useCepAutofill } from '../hooks/useCepAutofill.js';
import { formatCep } from '../utils/validators.js';

const SUPPLIER_CATEGORIES = [
  'Material odontológico',
  'Laboratório',
  'Marketing',
  'Software',
  'Manutenção',
  'Equipamentos',
  'Serviços terceirizados',
  'Utilidades',
  'Limpeza',
  'Administrativo',
  'Outros',
];

const initialAddress = {
  zip_code: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
};

/**
 * Modal reutilizável de cadastro de fornecedor.
 * Usado em FornecedoresPage e FinancePayablesPage (Nova despesa).
 * @param {boolean} open - Controla visibilidade
 * @param {() => void} onClose - Callback ao fechar
 * @param {(supplier: object) => void} onSuccess - Callback ao salvar com sucesso (recebe o fornecedor criado)
 * @param {object} user - Usuário autenticado
 * @param {boolean} [nested=false] - Se true, usa z-index maior para modal sobre modal
 */
export default function SupplierFormModal({ open, onClose, onSuccess, user, nested = false }) {
  const [error, setError] = useState('');
  const numberInputRef = useRef(null);
  const [addressState, setAddressState] = useState(initialAddress);

  const {
    loading: cepLoading,
    cepError,
    handleCepChange,
    handleCepBlur,
    handleFieldChange,
    isAutoFilled,
    status: cepStatus,
  } = useCepAutofill({
    enabled: open,
    getAddress: () => addressState,
    setAddress: setAddressState,
    fields: {
      cep: 'zip_code',
      street: 'street',
      neighborhood: 'district',
      city: 'city',
      state: 'state',
    },
  });

  const cepErrorDisplay =
    cepError === 'CEP não encontrado.'
      ? 'CEP não encontrado. Preencha o endereço manualmente.'
      : cepError === 'CEP inválido.'
        ? 'Informe um CEP válido.'
        : cepError;

  useEffect(() => {
    if (cepStatus?.state === 'filled' && numberInputRef.current) {
      numberInputRef.current.focus();
    }
  }, [cepStatus?.state]);

  useEffect(() => {
    if (!open) setAddressState(initialAddress);
  }, [open]);

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');
    const form = event.target;
    const formData = new FormData(form);

    const payload = {
      person_type: formData.get('person_type') || 'PJ',
      legal_name: formData.get('legal_name') || '',
      trade_name: formData.get('trade_name') || '',
      document: formData.get('document') || '',
      state_registration: formData.get('state_registration') || '',
      category: formData.get('category') || '',
      status: formData.get('status') || 'ativo',
      contact_name: formData.get('contact_name') || '',
      phone: formData.get('phone') || '',
      whatsapp: formData.get('whatsapp') || '',
      email: formData.get('email') || '',
      website: formData.get('website') || '',
      zip_code: formData.get('zip_code') || '',
      street: formData.get('street') || '',
      number: formData.get('number') || '',
      complement: formData.get('complement') || '',
      district: formData.get('district') || '',
      city: formData.get('city') || '',
      state: formData.get('state') || '',
      preferred_payment_method: formData.get('preferred_payment_method') || '',
      pix_key: formData.get('pix_key') || '',
      bank: formData.get('bank') || '',
      agency: formData.get('agency') || '',
      account: formData.get('account') || '',
      account_type: formData.get('account_type') || '',
      account_holder: formData.get('account_holder') || '',
      average_payment_term_days: formData.get('average_payment_term_days') || '',
      notes: formData.get('notes') || '',
    };

    try {
      const supplier = createSupplier(user, payload);
      form.reset();
      setAddressState(initialAddress);
      onSuccess?.(supplier);
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Erro ao salvar fornecedor.');
    }
  };

  if (!open) return null;

  const backdropClass = nested ? 'modal-backdrop modal-backdrop--nested' : 'modal-backdrop';
  const contentClass = nested ? 'modal-content suppliers-modal suppliers-modal--nested' : 'modal-content suppliers-modal';

  return (
    <div className={backdropClass} onClick={onClose}>
      <div className={contentClass} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header suppliers-modal-header">
          <h3>Novo fornecedor</h3>
          <p className="suppliers-modal-subtitle">
            Cadastre fornecedores para utilizar no financeiro e contas a pagar.
          </p>
          {error && (
            <p className="suppliers-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <form className="suppliers-form modal-form" onSubmit={handleSubmit}>
          <div className="modal-body suppliers-modal-body">
            <section className="suppliers-form-block">
              <h4>Identificação</h4>
              <div className="suppliers-form-grid">
                <label>
                  Tipo de pessoa
                  <select name="person_type" defaultValue="PJ">
                    <option value="PF">Pessoa Física (PF)</option>
                    <option value="PJ">Pessoa Jurídica (PJ)</option>
                  </select>
                </label>
                <label>
                  Categoria *
                  <select name="category" defaultValue="">
                    <option value="">Selecione</option>
                    {SUPPLIER_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </label>
                <label className="suppliers-field-full">
                  Razão social
                  <input name="legal_name" type="text" placeholder="Opcional" />
                </label>
                <label className="suppliers-field-full">
                  Nome fantasia
                  <input name="trade_name" type="text" placeholder="Nome fantasia" />
                </label>
                <label>
                  CPF/CNPJ
                  <input name="document" type="text" placeholder="Somente números" />
                </label>
                <label>
                  Inscrição estadual
                  <input name="state_registration" type="text" placeholder="Opcional" />
                </label>
                <label>
                  Status *
                  <select name="status" defaultValue="ativo">
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="suppliers-form-block">
              <h4>Contato</h4>
              <div className="suppliers-form-grid">
                <label>
                  Nome do responsável
                  <input name="contact_name" type="text" />
                </label>
                <label>
                  Telefone principal *
                  <input name="phone" type="tel" />
                </label>
                <label>
                  WhatsApp
                  <input name="whatsapp" type="tel" />
                </label>
                <label>
                  E-mail
                  <input name="email" type="email" />
                </label>
                <label className="suppliers-field-full">
                  Site
                  <input name="website" type="url" />
                </label>
              </div>
            </section>

            <section className="suppliers-form-block">
              <h4>Endereço</h4>
              <div className="suppliers-form-grid">
                <label>
                  CEP
                  <div className={`cep-input-wrapper ${cepLoading ? 'is-loading' : ''}`}>
                    <input
                      name="zip_code"
                      type="text"
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="00000-000"
                      value={formatCep(addressState.zip_code)}
                      onChange={(e) => handleCepChange(formatCep(e.target.value))}
                      onBlur={handleCepBlur}
                    />
                    <span className="cep-spinner" aria-hidden="true" />
                  </div>
                  {cepErrorDisplay && (
                    <small className="suppliers-cep-error" role="alert">
                      {cepErrorDisplay}
                    </small>
                  )}
                </label>
                <label>
                  Número
                  <input
                    ref={numberInputRef}
                    name="number"
                    type="text"
                    value={addressState.number}
                    onChange={(e) => setAddressState((p) => ({ ...p, number: e.target.value }))}
                  />
                </label>
                <label className="suppliers-field-full">
                  Rua
                  <input
                    name="street"
                    type="text"
                    value={addressState.street}
                    onChange={(e) => handleFieldChange('street', e.target.value)}
                    className={isAutoFilled('street') ? 'input-autofilled' : ''}
                  />
                </label>
                <label>
                  Bairro
                  <input
                    name="district"
                    type="text"
                    value={addressState.district}
                    onChange={(e) => handleFieldChange('district', e.target.value)}
                    className={isAutoFilled('district') ? 'input-autofilled' : ''}
                  />
                </label>
                <label>
                  Cidade
                  <input
                    name="city"
                    type="text"
                    value={addressState.city}
                    onChange={(e) => handleFieldChange('city', e.target.value)}
                    className={isAutoFilled('city') ? 'input-autofilled' : ''}
                  />
                </label>
                <label>
                  Estado
                  <input
                    name="state"
                    type="text"
                    maxLength={2}
                    placeholder="UF"
                    value={addressState.state}
                    onChange={(e) => handleFieldChange('state', e.target.value)}
                    className={isAutoFilled('state') ? 'input-autofilled' : ''}
                  />
                </label>
                <label>
                  Complemento
                  <input
                    name="complement"
                    type="text"
                    value={addressState.complement}
                    onChange={(e) => setAddressState((p) => ({ ...p, complement: e.target.value }))}
                  />
                </label>
              </div>
            </section>

            <section className="suppliers-form-block">
              <h4>Dados financeiros</h4>
              <div className="suppliers-form-grid">
                <label>
                  Forma de pagamento preferida
                  <input name="preferred_payment_method" type="text" />
                </label>
                <label>
                  Prazo médio de pagamento (dias)
                  <input name="average_payment_term_days" type="number" min="0" />
                </label>
                <label>
                  Chave PIX
                  <input name="pix_key" type="text" />
                </label>
                <label>
                  Banco
                  <input name="bank" type="text" />
                </label>
                <label>
                  Agência
                  <input name="agency" type="text" />
                </label>
                <label>
                  Conta
                  <input name="account" type="text" />
                </label>
                <label>
                  Tipo de conta
                  <input name="account_type" type="text" />
                </label>
                <label>
                  Favorecido
                  <input name="account_holder" type="text" />
                </label>
              </div>
            </section>

            <section className="suppliers-form-block">
              <h4>Controle interno</h4>
              <label className="suppliers-field-full">
                Observações
                <textarea name="notes" rows={3} />
              </label>
            </section>
          </div>

          <div className="modal-footer suppliers-modal-footer">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="button primary">
              Salvar fornecedor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
