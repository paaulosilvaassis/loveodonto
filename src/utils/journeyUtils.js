/**
 * Utilitários para a Jornada do Paciente
 */

/**
 * Calcula o tempo de espera em segundos desde checkInAt até now
 * @param {string | null} checkInAt - ISO datetime string ou null
 * @param {Date} now - Data atual
 * @returns {number} - Segundos de espera, ou 0 se checkInAt for null
 */
export const getWaitTimeSeconds = (checkInAt, now = new Date()) => {
  if (!checkInAt) return 0;
  try {
    const checkInDate = new Date(checkInAt);
    if (isNaN(checkInDate.getTime())) return 0;
    const diffMs = now.getTime() - checkInDate.getTime();
    return Math.max(0, Math.floor(diffMs / 1000));
  } catch {
    return 0;
  }
};

/**
 * Alias com assinatura pedida: getWaitTime(now, checkInAt)
 * @param {Date} now - Data atual
 * @param {string | null} checkInAt - ISO datetime string ou null
 * @returns {number} - Segundos de espera
 */
export const getWaitTime = (now, checkInAt) => getWaitTimeSeconds(checkInAt, now);

/**
 * Formata segundos em mm:ss ou hh:mm:ss
 * @param {number} seconds - Total de segundos
 * @returns {string} - Formato "mm:ss" ou "hh:mm:ss"
 */
export const formatWaitTime = (seconds) => {
  if (seconds < 0) return '00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/**
 * Retorna a cor baseada no tempo de espera
 * @param {number} seconds - Segundos de espera
 * @returns {'green' | 'yellow' | 'red'}
 */
export const getWaitTimeColor = (seconds) => {
  if (seconds < 300) return 'green'; // < 5 min
  if (seconds < 900) return 'yellow'; // 5-15 min
  return 'red'; // > 15 min
};

/**
 * Formata nome para exibição (primeiro nome + inicial do sobrenome)
 * @param {string} fullName - Nome completo
 * @returns {string}
 */
export const formatPatientName = (fullName) => {
  if (!fullName) return 'Paciente';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastNameInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${firstName} ${lastNameInitial}.`;
};

/**
 * Formata telefone para exibição
 * @param {object} phone - Objeto com ddd e number
 * @returns {string}
 */
export const formatPhoneDisplay = (phone) => {
  if (!phone || !phone.ddd || !phone.number) return '—';
  return `(${phone.ddd}) ${phone.number}`;
};

/**
 * Calcula o tempo médio de espera de uma lista de agendamentos finalizados hoje
 * @param {Array} appointments - Lista de agendamentos com checkInAt e calledAt
 * @returns {number} - Média em minutos, ou 0 se não houver dados
 */
export const calculateAverageWaitTime = (appointments) => {
  const today = new Date().toISOString().slice(0, 10);
  const finishedToday = appointments.filter((apt) => {
    if (!apt.checkInAt || !apt.calledAt) return false;
    const aptDate = apt.date || apt.checkInAt.slice(0, 10);
    return aptDate === today && apt.status === 'finalizado';
  });

  if (finishedToday.length === 0) return 0;

  const waitTimes = finishedToday
    .map((apt) => {
      try {
        const checkIn = new Date(apt.checkInAt);
        const called = new Date(apt.calledAt);
        if (isNaN(checkIn.getTime()) || isNaN(called.getTime())) return null;
        return Math.floor((called.getTime() - checkIn.getTime()) / 1000 / 60); // minutos
      } catch {
        return null;
      }
    })
    .filter((time) => time !== null && time >= 0);

  if (waitTimes.length === 0) return 0;
  const sum = waitTimes.reduce((acc, time) => acc + time, 0);
  return Math.round(sum / waitTimes.length);
};

/**
 * Retorna o maior tempo de espera atual e o nome do paciente
 * @param {Array} appointments - Lista de agendamentos em espera
 * @param {Date} now - Data atual
 * @returns {{seconds: number, name: string} | null}
 */
export const getLongestWaitTime = (appointments, now = new Date()) => {
  const waiting = appointments.filter((apt) => apt.status === 'em_espera' && apt.checkInAt);
  if (waiting.length === 0) return null;

  let longest = null;
  let maxSeconds = 0;

  waiting.forEach((apt) => {
    const seconds = getWaitTimeSeconds(apt.checkInAt, now);
    if (seconds > maxSeconds) {
      maxSeconds = seconds;
      longest = { seconds, name: apt.patientName || apt.patientFirstName || 'Paciente' };
    }
  });

  return longest;
};
