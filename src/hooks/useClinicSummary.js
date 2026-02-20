import { useEffect, useState } from 'react';
import { getClinicSummary } from '../services/clinicService.js';

const CACHE_KEY = 'clinic.summary.cache';
const CACHE_TTL = 5 * 60 * 1000;

const readCache = () => {
  const raw = sessionStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

export const useClinicSummary = () => {
  const [summary, setSummary] = useState(() => readCache());

  useEffect(() => {
    const next = getClinicSummary();
    setSummary(next);
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: next, timestamp: Date.now() }));
  }, []);

  return summary;
};
