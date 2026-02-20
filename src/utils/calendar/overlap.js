/**
 * Motor de overlaps para agendamentos no CalendarGrid
 * Gerencia detecção de sobreposição e validação de limites de encaixe
 */

import { toMinutes } from '../agendaUtils.js';

/**
 * @typedef {Object} CalendarEvent
 * @property {string} id
 * @property {string} startTime - Formato HH:mm
 * @property {string} endTime - Formato HH:mm
 * @property {string} professionalId
 * @property {string|null|undefined} roomId
 * @property {number} [slotCapacity=1] - 1 ou 2
 */

/**
 * Verifica se dois intervalos de tempo se sobrepõem
 * @param {string} startA - Formato HH:mm
 * @param {string} endA - Formato HH:mm
 * @param {string} startB - Formato HH:mm
 * @param {string} endB - Formato HH:mm
 * @returns {boolean}
 */
export const overlaps = (startA, endA, startB, endB) => {
  const startA_min = toMinutes(startA);
  const endA_min = toMinutes(endA);
  const startB_min = toMinutes(startB);
  const endB_min = toMinutes(endB);
  return startA_min < endB_min && endA_min > startB_min;
};

/**
 * Gera chave única para agrupamento de overlaps (mesmo profissional + mesma sala)
 * @param {CalendarEvent} ev
 * @returns {string}
 */
export const overlapKey = (ev) => {
  const roomPart = ev.roomId ? ev.roomId : 'no-room';
  return `${ev.professionalId}:${roomPart}`;
};

/**
 * Conta quantos eventos se sobrepõem com o candidato
 * @param {CalendarEvent[]} events - Lista de eventos existentes
 * @param {CalendarEvent} candidate - Evento candidato a ser verificado
 * @param {string|null} excludeId - ID do evento a excluir da contagem (para edição)
 * @returns {number}
 */
export const countOverlaps = (events, candidate, excludeId = null) => {
  const key = overlapKey(candidate);
  return events.filter((ev) => {
    if (excludeId && ev.id === excludeId) return false;
    if (overlapKey(ev) !== key) return false;
    return overlaps(candidate.startTime, candidate.endTime, ev.startTime, ev.endTime);
  }).length;
};

/**
 * Valida se um evento pode ser colocado respeitando o limite de 2 overlaps
 * @param {CalendarEvent[]} events - Lista de eventos existentes
 * @param {CalendarEvent} candidate - Evento candidato
 * @param {string|null} excludeId - ID do evento a excluir (para edição)
 * @returns {{ ok: boolean, reason?: string }}
 */
export const canPlaceEvent = (events, candidate, excludeId = null) => {
  const overlapCount = countOverlaps(events, candidate, excludeId);
  
  if (overlapCount >= 2) {
    return {
      ok: false,
      reason: 'Limite de encaixe atingido (máx. 2).',
    };
  }
  
  const capacity = Number(candidate.slotCapacity) === 2 ? 2 : 1;
  
  if (overlapCount === 1 && capacity === 1) {
    return {
      ok: false,
      reason: 'Horário já ocupado. Ative "Permitir encaixe" para permitir dois atendimentos.',
    };
  }
  
  return { ok: true };
};

/**
 * Calcula layout de lanes para eventos sobrepostos (máximo 2 lanes)
 * @param {CalendarEvent[]} events - Eventos do mesmo recurso (mesma chave)
 * @returns {Map<string, { laneIndex: number, columns: number }>}
 */
export const calculateLaneLayout = (events) => {
  const layout = new Map();
  
  if (!events.length) return layout;
  
  // Ordenar por startTime
  const sorted = [...events].sort((a, b) => {
    const startDiff = toMinutes(a.startTime) - toMinutes(b.startTime);
    if (startDiff !== 0) return startDiff;
    return toMinutes(a.endTime) - toMinutes(b.endTime);
  });
  
  // Agrupar eventos em clusters de overlaps
  // Um cluster contém eventos que se sobrepõem entre si (transitivamente)
  const clusters = [];
  let currentCluster = [];
  
  sorted.forEach((event) => {
    // Verificar se o evento se sobrepõe com algum evento do cluster atual
    const overlapsWithCluster = currentCluster.some((existing) =>
      overlaps(event.startTime, event.endTime, existing.startTime, existing.endTime)
    );
    
    if (!currentCluster.length || overlapsWithCluster) {
      // Adicionar ao cluster atual
      currentCluster.push(event);
    } else {
      // Finalizar cluster anterior e começar novo
      if (currentCluster.length > 0) {
        clusters.push(currentCluster);
      }
      currentCluster = [event];
    }
  });
  
  // Adicionar último cluster
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }
  
  // Para cada cluster, atribuir lanes (máximo 2)
  clusters.forEach((cluster) => {
    if (cluster.length === 1) {
      // Evento único: lane 0, 1 coluna
      layout.set(cluster[0].id, {
        laneIndex: 0,
        columns: 1,
      });
      return;
    }
    
    // Cluster com overlaps: atribuir lanes (máximo 2)
    const lanes = [[], []]; // Array de eventos em cada lane
    
    cluster.forEach((event) => {
      let assignedLane = -1;
      
      // Tentar colocar na primeira lane onde não há overlap
      for (let i = 0; i < 2; i++) {
        const hasOverlap = lanes[i].some((existing) =>
          overlaps(event.startTime, event.endTime, existing.startTime, existing.endTime)
        );
        
        if (!hasOverlap) {
          assignedLane = i;
          lanes[i].push(event);
          break;
        }
      }
      
      // Se não encontrou lane livre e ainda há espaço (menos de 2 lanes ocupadas)
      if (assignedLane === -1) {
        // Se há menos de 2 eventos nas lanes, podemos colocar na lane menos ocupada
        if (lanes[0].length < 2 && lanes[1].length < 2) {
          assignedLane = lanes[0].length <= lanes[1].length ? 0 : 1;
          lanes[assignedLane].push(event);
        } else {
          // Overflow: mais de 2 eventos se sobrepondo
          console.warn(`Overflow: evento ${event.id} não pode ser colocado (máx 2 lanes)`);
          assignedLane = 0; // Fallback
          lanes[0].push(event);
        }
      }
    });
    
    // Calcular número de colunas (quantas lanes estão ocupadas)
    const columns = lanes.filter((lane) => lane.length > 0).length;
    
    // Atribuir layout para cada evento do cluster
    cluster.forEach((event) => {
      const laneIndex = lanes[0].includes(event) ? 0 : lanes[1].includes(event) ? 1 : 0;
      layout.set(event.id, {
        laneIndex,
        columns: Math.max(columns, 1),
      });
    });
  });
  
  return layout;
};
