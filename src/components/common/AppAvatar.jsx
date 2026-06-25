import { memo, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { getInitialsFromName, getUserAvatarUrl, getDisplayName } from '../../utils/avatarUtils.js';

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

  useEffect(() => {
    setLoaded(false);
    setBroken(false);
  }, [resolvedUrl]);

  const showPhoto = Boolean(resolvedUrl) && !broken;
  const showSkeleton = showPhoto && !loaded;
  const ariaLabel = alt || (displayName ? `Avatar de ${displayName}` : 'Avatar');

  return (
    <span
      className={clsx(
        'app-avatar',
        size !== 'inherit' && `app-avatar--${size}`,
        showPhoto && 'has-photo',
        showSkeleton && 'is-loading',
        className,
      )}
      title={title || displayName || undefined}
      aria-label={!showPhoto ? ariaLabel : undefined}
    >
      {showSkeleton ? <span className="app-avatar__skeleton" aria-hidden /> : null}
      {showPhoto ? (
        <img
          src={resolvedUrl}
          alt={ariaLabel}
          className="app-avatar__img"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setBroken(true);
            setLoaded(true);
          }}
        />
      ) : (
        <span className="app-avatar__initials" aria-hidden>
          {initials}
        </span>
      )}
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
