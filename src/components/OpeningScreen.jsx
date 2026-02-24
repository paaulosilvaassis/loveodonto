import { useEffect, useState } from 'react';
import { getOpeningForToday } from '../data/openingContent.js';

const DISMISS_MS = 3500;
const OPENING_STORAGE_KEY = 'appgestaoodonto.openingShown';

export function shouldShowOpening() {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(OPENING_STORAGE_KEY) !== 'true';
}

export function markOpeningShown() {
  try {
    sessionStorage.setItem(OPENING_STORAGE_KEY, 'true');
  } catch {
    // ignore
  }
}

/**
 * Tela de abertura do app — exibida uma vez por sessão.
 * Mostra uma das 30 variações (por dia do mês): mensagem + gradiente.
 * Fecha sozinha após DISMISS_MS ou no toque/clique.
 */
export default function OpeningScreen({ onDismiss }) {
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);
  const content = getOpeningForToday();

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      handleClose();
    }, DISMISS_MS);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    markOpeningShown();
    setTimeout(() => onDismiss?.(), 400);
  };

  if (!visible) return null;

  return (
    <div
      className={`opening-screen ${mounted ? 'opening-screen--mounted' : ''}`}
      role="dialog"
      aria-label="Mensagem do dia"
      onClick={handleClose}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClose(); } }}
      tabIndex={0}
    >
      <div
        className="opening-screen__bg"
        style={{ background: content.gradient }}
        aria-hidden
      />
      <div className="opening-screen__shade" aria-hidden />
      <div className="opening-screen__content">
        <p className="opening-screen__title">{content.title}</p>
        {content.subtitle && (
          <p className="opening-screen__subtitle">{content.subtitle}</p>
        )}
        <span className="opening-screen__day">Dia {content.dayNumber}</span>
      </div>
      <p className="opening-screen__tap-hint">Toque para continuar</p>
    </div>
  );
}
