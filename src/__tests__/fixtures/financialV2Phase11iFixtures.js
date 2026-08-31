/**
 * Fixtures sintéticas Phase 11.I — sem PII real.
 */
export const TENANT_A = 'tenant-11i-a';
export const TENANT_B = 'tenant-11i-b';
export const PATIENT_A = 'patient-11i-a';
export const PATIENT_B = 'patient-11i-b';

export function emptyFinanceDb(overrides = {}) {
  return {
    tenants: [
      { id: TENANT_A, name: 'Clinica 11I A', status: 'active' },
      { id: TENANT_B, name: 'Clinica 11I B', status: 'active' },
    ],
    patients: [
      { id: PATIENT_A, tenant_id: TENANT_A, full_name: 'Paciente 11I A' },
      { id: PATIENT_B, tenant_id: TENANT_B, full_name: 'Paciente 11I B' },
    ],
    accountsReceivable: [],
    receivablePayments: [],
    financings: [],
    receivableCharges: [],
    clinicalAppointments: [],
    ...overrides,
  };
}

export function cleanReceivable(extras = {}) {
  return {
    id: extras.id || 'recv-11i-clean',
    tenant_id: TENANT_A,
    patient_id: PATIENT_A,
    origin_type: extras.origin_type || 'manual_entry',
    origin_id: extras.origin_id || null,
    installment_number: extras.installment_number ?? 0,
    original_amount: 100,
    discount_amount: 0,
    interest_amount: 0,
    fine_amount: 0,
    net_amount: 100,
    received_amount: 0,
    remaining_amount: 100,
    status: 'upcoming',
    due_date: '2026-09-15',
    ...extras,
  };
}
