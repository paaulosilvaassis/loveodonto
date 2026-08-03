/**
 * @module repositories/crm/crmActivityTypes
 * @description Activity Stream DTO — Phase 6.6 CRM Wave B Read Cutover.
 * Unificação apenas na Repository Layer; stores IDB permanecem intactas.
 */

export type CrmActivityType =
  | 'CALL'
  | 'EMAIL'
  | 'FOLLOW_UP'
  | 'TASK'
  | 'MOVE_STAGE'
  | 'NOTE'
  | 'WHATSAPP'
  | 'AUTOMATION'
  | 'SYSTEM';

export type CrmActivitySource =
  | 'crmLeadEvents'
  | 'crmFollowUps'
  | 'crmTasks'
  | 'followUps';

export type CrmActivityStatus =
  | 'pending'
  | 'done'
  | 'canceled'
  | 'completed'
  | 'cancelled'
  | 'recorded'
  | string;

/** DTO interno unificado — Activity Stream. */
export interface CrmActivity {
  id: string;
  type: CrmActivityType;
  leadId: string | null;
  patientId: string | null;
  ownerId: string | null;
  timestamp: string;
  status: CrmActivityStatus;
  payload: Record<string, unknown>;
  source: CrmActivitySource;
  tenantId: string;
}

export interface CrmActivityListFilters {
  tenantId?: string;
  leadId?: string;
  patientId?: string;
  clinicId?: string;
  source?: CrmActivitySource | CrmActivitySource[];
  type?: CrmActivityType | CrmActivityType[];
  status?: string;
  pending?: boolean;
}

export interface CrmActivityCompareDiff {
  field: string;
  indexedDb: unknown;
  activity: unknown;
}

export interface CrmActivityCompareResult {
  match: boolean;
  diffs: CrmActivityCompareDiff[];
  id?: string;
  source?: CrmActivitySource;
}

export const CRM_ACTIVITY_COMPARE_FIELDS = [
  'id',
  'type',
  'leadId',
  'ownerId',
  'timestamp',
  'status',
  'payload',
] as const;
