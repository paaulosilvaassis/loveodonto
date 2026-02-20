import { useCallback, useMemo, useRef, useState } from 'react';
import { isCepValid, onlyDigits } from '../utils/validators.js';
import { getAddressByCep } from '../services/cepService.js';

const mapAddressField = (data, key) => data[key] || '';

export const useCepAutofill = ({ enabled = true, getAddress, setAddress, fields }) => {
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const [loading, setLoading] = useState(false);
  const lastCepRef = useRef('');
  const editedFieldsRef = useRef(new Set());
  const autoFilledRef = useRef(new Set());

  const updateAddress = useCallback(
    (updater) => {
      setAddress((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        return next;
      });
    },
    [setAddress]
  );

  const markEdited = useCallback((field) => {
    if (!field) return;
    editedFieldsRef.current.add(field);
    autoFilledRef.current.delete(field);
  }, []);

  const isAutoFilled = useCallback((field) => autoFilledRef.current.has(field), []);

  const applyAddressData = useCallback(
    (data, { force = false } = {}) => {
      const targetFields = [
        { key: fields.street, value: mapAddressField(data, 'street') },
        { key: fields.neighborhood, value: mapAddressField(data, 'neighborhood') },
        { key: fields.city, value: mapAddressField(data, 'city') },
        { key: fields.state, value: mapAddressField(data, 'state') },
      ].filter((item) => item.key);

      updateAddress((prev) => {
        const next = { ...prev };
        targetFields.forEach(({ key, value }) => {
          const wasEdited = editedFieldsRef.current.has(key);
          if (!force && wasEdited) return;
          if (!value) return;
          next[key] = value;
          autoFilledRef.current.add(key);
        });
        return next;
      });
    },
    [fields, updateAddress]
  );

  const shouldConfirmOverwrite = useCallback(() => {
    const current = getAddress();
    if (!current) return false;
    const compareFields = [
      { key: fields.street, value: current[fields.street] || '' },
      { key: fields.neighborhood, value: current[fields.neighborhood] || '' },
      { key: fields.city, value: current[fields.city] || '' },
      { key: fields.state, value: current[fields.state] || '' },
    ].filter((item) => item.key);

    return compareFields.some(({ key, value }) => editedFieldsRef.current.has(key) && value);
  }, [fields, getAddress]);

  const lookupCep = useCallback(
    async (rawCep, { force = false } = {}) => {
      if (!enabled) return;
      const cleaned = onlyDigits(rawCep);
      if (!isCepValid(cleaned)) {
        setStatus({ state: 'invalid', message: 'CEP inválido.' });
        return;
      }
      if (!force && cleaned === lastCepRef.current && status.state === 'filled') return;
      setLoading(true);
      setStatus({ state: 'loading', message: '' });
      const result = await getAddressByCep(cleaned);
      setLoading(false);

      if (!result.ok) {
        setStatus({ state: result.error, message: result.message });
        return;
      }

      if (!force && shouldConfirmOverwrite()) {
        const confirmed = window.confirm('Alguns campos já foram editados manualmente. Deseja sobrescrever com os dados do CEP?');
        if (!confirmed) {
          setStatus({ state: 'skipped', message: '' });
          return;
        }
      }

      applyAddressData(result.data, { force: true });
      lastCepRef.current = cleaned;
      setStatus({ state: 'filled', message: '' });
    },
    [enabled, status.state, applyAddressData, shouldConfirmOverwrite]
  );

  const handleCepChange = useCallback(
    (value) => {
      updateAddress((prev) => ({ ...prev, [fields.cep]: value }));
      if (!enabled) return;
      const cleaned = onlyDigits(value);
      if (cleaned.length === 8) {
        lookupCep(cleaned);
        return;
      }
      setStatus((prev) => {
        if (['invalid', 'not_found', 'timeout', 'unavailable'].includes(prev.state)) {
          return { state: 'idle', message: '' };
        }
        return prev;
      });
    },
    [enabled, fields.cep, lookupCep, updateAddress]
  );

  const handleCepBlur = useCallback(() => {
    if (!enabled) return;
    const current = getAddress()?.[fields.cep] || '';
    const cleaned = onlyDigits(current);
    if (!cleaned) return;
    if (cleaned.length !== 8) {
      setStatus({ state: 'invalid', message: 'CEP inválido.' });
      return;
    }
    lookupCep(cleaned);
  }, [enabled, fields.cep, getAddress, lookupCep]);

  const handleFieldChange = useCallback(
    (field, value) => {
      updateAddress((prev) => ({ ...prev, [field]: value }));
      markEdited(field);
    },
    [markEdited, updateAddress]
  );

  const cepError = useMemo(() => {
    if (status.state === 'invalid') return status.message || 'CEP inválido.';
    if (status.state === 'not_found') return 'CEP não encontrado.';
    if (status.state === 'timeout' || status.state === 'unavailable') return status.message || 'Serviço de CEP indisponível.';
    return '';
  }, [status]);

  return {
    status,
    loading,
    cepError,
    handleCepChange,
    handleCepBlur,
    handleFieldChange,
    isAutoFilled,
    lookupCep,
  };
};
