/**
 * Progresso dinâmico da cerimônia. Não assume 2 signatários nem ordem fixa.
 */
export function deriveCeremonyProgress({ contract, ceremony } = {}) {
  const required = (ceremony?.requiredSigners || []).filter((slot) => slot?.required !== false);
  if (required.length > 0) {
    const completedSigners = required.filter((slot) => slot.status === 'signed' || slot.satisfied);
    const remainingSigners = required.filter((slot) => slot.status !== 'signed' && !slot.satisfied);
    return {
      requiredCount: required.length,
      completedCount: completedSigners.length,
      remainingCount: remainingSigners.length,
      requiredSigners: required,
      completedSigners,
      remainingSigners,
      label: `${completedSigners.length} de ${required.length} assinaturas concluídas`,
    };
  }
  const snap = contract?.metadata?.signatureCeremony;
  if (snap?.requiredCount != null) {
    const completed = Number(snap.satisfiedCount) || 0;
    const requiredCount = Number(snap.requiredCount) || 0;
    return {
      requiredCount,
      completedCount: completed,
      remainingCount: Math.max(0, requiredCount - completed),
      requiredSigners: [],
      completedSigners: [],
      remainingSigners: [],
      label: `${completed} de ${requiredCount} assinaturas concluídas`,
    };
  }
  return {
    requiredCount: 0,
    completedCount: 0,
    remainingCount: 0,
    requiredSigners: [],
    completedSigners: [],
    remainingSigners: [],
    label: '—',
  };
}
