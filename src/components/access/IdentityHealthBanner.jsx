import { AlertTriangle, Wrench } from 'lucide-react';
import Button from '../Button.jsx';
import { IDENTITY_HEALTH_LABELS } from '../../services/identityService.js';

export default function IdentityHealthBanner({
  identity,
  canEdit,
  saving = false,
  onRepair,
}) {
  if (!identity?.id || identity.identity_health === 'healthy') return null;

  const label = IDENTITY_HEALTH_LABELS[identity.identity_health] || identity.identity_health;

  return (
    <div className="cr-access__health-banner" role="alert">
      <AlertTriangle size={16} aria-hidden />
      <div>
        <strong>Encontramos uma inconsistência no acesso deste colaborador.</strong>
        <p className="muted">Saúde da identidade: {label}</p>
      </div>
      {onRepair ? (
        <Button
          variant="secondary"
          size="sm"
          icon={Wrench}
          disabled={!canEdit || saving}
          loading={saving}
          onClick={onRepair}
        >
          Corrigir automaticamente
        </Button>
      ) : null}
    </div>
  );
}
