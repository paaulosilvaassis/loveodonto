/**

 * Ponte controlada entre appointmentService (legado IDB) e agendaRepository V3.

 * Phase 5.8 read + Phase 5.9 write cutover via flags.

 */

import { normalizeTenantId } from './tenantIsolation.js';

import {

  createAgendaRepository,

  rehydrateAgendaCacheIfPrimary,

} from '../repositories/agenda/agendaRepository.ts';

import {

  getAgendaRepositoryFlags,

  isAgendaReadPrimaryEnabled,

  isAgendaWriteEnabled,

  shouldCompareAgendaIdbVsRemote,

} from '../repositories/agenda/agendaRepositoryFlags.ts';

import {

  registerAgendaRemoteCancel,

  registerAgendaRemoteCreate,

  registerAgendaRemoteGet,

  registerAgendaRemoteList,

  registerAgendaRemoteUpdate,

} from '../repositories/agenda/agendaAdminApiRepository.ts';

import {

  cancelAppointmentRemote,

  createAppointmentRemote,

  fetchAppointmentRemote,

  fetchAppointmentsRemote,

  updateAppointmentRemote,

} from './agendaAppointmentsApi.js';



/** @type {import('../repositories/agenda/agendaRepositoryFlags.ts').AgendaRepositoryFlagsInput | null} */

let flagsInputOverride = null;



/** @type {(() => import('../repositories/agenda/agendaTypes.ts').IAgendaRepository) | null} */

let repositoryFactoryOverride = null;



let remoteClientsRegistered = false;



function ensureRemoteClientsRegistered() {

  if (remoteClientsRegistered) return;

  remoteClientsRegistered = true;

  registerAgendaRemoteList(async (_tenantId, filters) => fetchAppointmentsRemote(filters));

  registerAgendaRemoteGet(async (_tenantId, ref) => fetchAppointmentRemote(ref));

  registerAgendaRemoteCreate(async (_tenantId, dto) => createAppointmentRemote(dto));

  registerAgendaRemoteUpdate(async (_tenantId, ref, dto) => updateAppointmentRemote(ref, dto));

  registerAgendaRemoteCancel(async (_tenantId, ref, reason) => cancelAppointmentRemote(ref, reason));

}



/**

 * Apenas testes — injeta overrides de flags.

 * @param {import('../repositories/agenda/agendaRepositoryFlags.ts').AgendaRepositoryFlagsInput | null} input

 */

export function __setAgendaServiceBridgeFlagsForTest(input) {

  flagsInputOverride = input;

}



/**

 * Apenas testes — injeta factory do repository.

 * @param {(() => import('../repositories/agenda/agendaTypes.ts').IAgendaRepository) | null} factory

 */

export function __setAgendaRepositoryFactoryForTest(factory) {

  repositoryFactoryOverride = factory;

}



/** @returns {import('../repositories/agenda/agendaRepositoryFlags.ts').AgendaRepositoryFlagsInput} */

function bridgeFlagsInput() {

  return flagsInputOverride ?? {};

}



function getRepository() {

  ensureRemoteClientsRegistered();

  const factory = repositoryFactoryOverride ?? createAgendaRepository;

  return factory({ flagsInput: bridgeFlagsInput() });

}



export function getAgendaRepositoryForRead() {

  return getRepository();

}



export function shouldUseAgendaRepositoryRead() {

  return isAgendaReadPrimaryEnabled(bridgeFlagsInput());

}



export function shouldUseAgendaRepositoryWrite() {

  return isAgendaWriteEnabled(bridgeFlagsInput());

}



export function shouldRunAgendaShadowRead() {

  return shouldCompareAgendaIdbVsRemote(bridgeFlagsInput());

}



export function scheduleAgendaCacheRehydrate(tenantId) {

  if (!shouldUseAgendaRepositoryRead()) return;

  const normalized = normalizeTenantId(tenantId);

  if (!normalized) return;

  queueMicrotask(() => {

    void rehydrateAgendaCacheIfPrimary(normalized);

  });

}



export function getAgendaRepositoryFlagsForBridge() {

  return getAgendaRepositoryFlags(bridgeFlagsInput());

}


