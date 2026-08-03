import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { getInitialsFromName, getUserAvatarUrl, getDisplayName } from '../../utils/avatarUtils.js';
import { startCollaboratorPerf, endCollaboratorPerf } from '../../services/collaboratorPerfLogService.js';

const LOAD_TIMEOUT_MS = 8000;

function isEmbeddedImageUrl(url) {
  return typeof url === 'string' && (url.startsWith('data:') || url.startsWith('blob:'));
}

function AppAvatar({
  name = '',
  photoUrl,
  avatarUrl,
  imageUrl,
  user,
  email = '',
  size = 'md',
  status,
  fallbackInitials,
  className = '',
  alt = '',
  title,
  loading = 'eager',
  perfEvent = '',
}) {
  const entity = user;
  const resolvedUrl = useMemo(
    () => photoUrl || avatarUrl || imageUrl || getUserAvatarUrl(entity),
    [photoUrl, avatarUrl, imageUrl, entity],
  );
  const displayName = name || getDisplayName(entity, '');
  const resolvedEmail = email || entity?.email || '';
  const initials = fallbackInitials || getInitialsFromName(displayName, resolvedEmail);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const imgRef = useRef(null);
  const perfMarkRef = useRef(null);

  const markLoaded = useCallback(() => {
    setLoaded(true);
    if (perfMarkRef.current) {
      endCollaboratorPerf(perfMarkRef.current, { ok: true });
      perfMarkRef.current = null;
    }
  }, []);
  const markBroken = useCallback(() => {
    setBroken(true);
    setLoaded(true);
    if (perfMarkRef.current) {
      endCollaboratorPerf(perfMarkRef.current, { ok: false, broken: true });
      perfMarkRef.current = null;
    }
  }, []);

  useEffect(() => {
    setLoaded(false);
    setBroken(false);
    if (!perfEvent) return undefined;
    perfMarkRef.current = startCollaboratorPerf(perfEvent, {
      url: resolvedUrl || null,
    });
    if (!resolvedUrl) {
      endCollaboratorPerf(perfMarkRef.current, { ok: true, fallback: 'initials' });
      perfMarkRef.current = null;
      return undefined;
    }
    return () => {
      if (perfMarkRef.current) {
        endCollaboratorPerf(perfMarkRef.current, { cancelled: true });
        perfMarkRef.current = null;
      }
    };
  }, [resolvedUrl, perfEvent]);

  useEffect(() => {
    if (!resolvedUrl) return undefined;

    const syncFromImage = () => {
      const img = imgRef.current;
      if (!img?.complete) return;
      if (img.naturalWidth > 0) markLoaded();
      else markBroken();
    };

    syncFromImage();
    const raf = window.requestAnimationFrame(syncFromImage);

    const timer = window.setTimeout(() => {
      setLoaded((wasLoaded) => {
        if (wasLoaded) return wasLoaded;
        setBroken(true);
        return true;
      });
    }, LOAD_TIMEOUT_MS);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [resolvedUrl, markLoaded, markBroken]);

  const showPhoto = Boolean(resolvedUrl) && !broken;
  const showSkeleton = showPhoto && !loaded;
  const showInitials = !showPhoto || showSkeleton;
  const imgLoading = isEmbeddedImageUrl(resolvedUrl) ? 'eager' : loading;
  const ariaLabel = alt || (displayName ? `Avatar de ${displayName}` : 'Avatar');

  return (
    <span
      className={clsx(
        'app-avatar',
        size !== 'inherit' && `app-avatar--${size}`,
        showPhoto && 'has-photo',
        showSkeleton && 'is-loading',
        loaded && showPhoto && 'is-loaded',
        className,
      )}
      title={title || displayName || undefined}
      aria-label={!showPhoto ? ariaLabel : undefined}
    >
      {showInitials ? (
        <span className="app-avatar__initials" aria-hidden>
          {initials}
        </span>
      ) : null}
      {showSkeleton ? <span className="app-avatar__skeleton" aria-hidden /> : null}
      {showPhoto ? (
        <img
          ref={imgRef}
          src={resolvedUrl}
          alt={ariaLabel}
          className="app-avatar__img"
          loading={imgLoading}
          decoding={isEmbeddedImageUrl(resolvedUrl) ? 'sync' : 'async'}
          onLoad={markLoaded}
          onError={markBroken}
        />
      ) : null}
      {status ? (
        <span
          className={clsx('app-avatar__status', `app-avatar__status--${status}`)}
          aria-hidden
        />
      ) : null}
    </span>
  );
}

export default memo(AppAvatar);
