export const toMinutes = (time) => {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const minutesToTime = (minutes) => {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export const addMinutesToTime = (time, minutesToAdd) => {
  return minutesToTime(toMinutes(time) + minutesToAdd);
};

export const diffMinutes = (startTime, endTime) => {
  return Math.max(0, toMinutes(endTime) - toMinutes(startTime));
};

export const normalizeSlotCapacity = (value) => {
  return Number(value) === 2 ? 2 : 1;
};

export const isTimeOverlap = (startA, endA, startB, endB) => {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(endA) > toMinutes(startB);
};

export const matchesOverlapResource = (candidate, item) => {
  if (candidate.professionalId && item.professionalId !== candidate.professionalId) return false;
  if (candidate.roomId) return item.roomId === candidate.roomId;
  return true;
};

export const resolveWorkSchedule = ({
  workHours = [],
  fallbackStart = '08:00',
  fallbackEnd = '18:00',
  fallbackSlotMinutes = 30,
} = {}) => {
  const isValidTime = (value) => /^\d{2}:\d{2}$/.test(value || '');
  const activeHours = Array.isArray(workHours) ? workHours.filter((item) => item?.ativo) : [];

  let earliest = null;
  let latest = null;
  for (const item of activeHours) {
    const startCandidates = [item?.inicio, item?.intervaloInicio].filter(isValidTime);
    const endCandidates = [item?.fim, item?.intervaloFim].filter(isValidTime);
    for (const startValue of startCandidates) {
      const minutes = toMinutes(startValue);
      if (earliest === null || minutes < earliest) earliest = minutes;
    }
    for (const endValue of endCandidates) {
      const minutes = toMinutes(endValue);
      if (latest === null || minutes > latest) latest = minutes;
    }
  }

  const workStartMinutes = earliest ?? toMinutes(fallbackStart);
  const workEndMinutes = latest ?? toMinutes(fallbackEnd);
  const validRange = workEndMinutes > workStartMinutes;

  const slotMinutesCandidate = activeHours.find((item) => Number.isFinite(item?.slotMinutes))?.slotMinutes;
  const slotMinutes =
    Number.isFinite(slotMinutesCandidate) && Number(slotMinutesCandidate) > 0
      ? Number(slotMinutesCandidate)
      : fallbackSlotMinutes;

  const finalStartMinutes = validRange ? workStartMinutes : toMinutes(fallbackStart);
  const finalEndMinutes = validRange ? workEndMinutes : toMinutes(fallbackEnd);

  return {
    workStart: minutesToTime(finalStartMinutes),
    workEnd: minutesToTime(finalEndMinutes),
    slotMinutes,
    hasConfig: activeHours.length > 0,
    isValid: validRange,
  };
};
