/**
 * PHASE 11.L — fixtures sintéticos phase11l-* (não são dados financeiros reais).
 */
export const PHASE_11L_SOURCE_PREFIX = 'phase11l-';
export const PHASE_11L_TENANT_A = 'a11a11a1-1111-4111-8111-a11a11a1111a';
export const PHASE_11L_TENANT_B = 'b22b22b2-2222-4222-8222-b22b22b2222b';

export function buildPhase11lSyntheticLegacyDb() {
  return {
    tenants: [
      { id: PHASE_11L_TENANT_A, name: 'phase11l-clinic-a', status: 'active' },
      { id: PHASE_11L_TENANT_B, name: 'phase11l-clinic-b', status: 'active' },
    ],
    patients: [
      { id: 'phase11l-patient-a', tenant_id: PHASE_11L_TENANT_A, full_name: 'Paciente 11L A' },
      { id: 'phase11l-patient-b', tenant_id: PHASE_11L_TENANT_B, full_name: 'Paciente 11L B' },
    ],
    accountsReceivable: [
      {
        id: 'phase11l-recv-a1',
        tenant_id: PHASE_11L_TENANT_A,
        patient_id: 'phase11l-patient-a',
        origin_type: 'manual_entry',
        origin_id: null,
        installment_number: 1,
        total_installments: 1,
        description: 'phase11l receivable a1',
        issue_date: '2026-08-31',
        due_date: '2026-09-15',
        original_amount: 99.99,
        discount_amount: 0,
        interest_amount: 0,
        fine_amount: 0,
        net_amount: 99.99,
        received_amount: 49.99,
        remaining_amount: 50,
        status: 'partially_paid',
        payment_method_expected: 'pix',
      },
      {
        id: 'phase11l-recv-b1',
        tenant_id: PHASE_11L_TENANT_B,
        patient_id: 'phase11l-patient-b',
        origin_type: 'manual_entry',
        description: 'phase11l receivable b1',
        issue_date: '2026-08-31',
        due_date: '2026-09-20',
        original_amount: 10,
        net_amount: 10,
        received_amount: 0,
        remaining_amount: 10,
        status: 'upcoming',
      },
    ],
    receivablePayments: [
      {
        id: 'phase11l-pay-a1',
        tenant_id: PHASE_11L_TENANT_A,
        receivable_id: 'phase11l-recv-a1',
        operation_id: 'phase11l-op-pay-a1',
        kind: 'payment',
        status: 'applied',
        amount_received: 49.99,
        payment_method: 'pix',
        payment_date: '2026-08-31',
      },
      {
        id: 'phase11l-rev-a1',
        tenant_id: PHASE_11L_TENANT_A,
        receivable_id: 'phase11l-recv-a1',
        operation_id: 'phase11l-op-rev-a1',
        kind: 'reversal',
        status: 'applied',
        amount_received: 49.99,
        payment_method: 'pix',
        payment_date: '2026-08-31',
        reverses_payment_id: 'phase11l-pay-a1',
      },
    ],
    financings: [
      {
        id: 'phase11l-fin-a1',
        tenant_id: PHASE_11L_TENANT_A,
        patient_id: 'phase11l-patient-a',
        budget_id: 'phase11l-budget-fin-a1',
        status: 'draft',
        total_amount: 500,
        entry_amount: 0,
        total_payable_amount: 500,
        installments_count: 2,
      },
    ],
    receivableCharges: [
      {
        id: 'phase11l-chg-a1',
        tenant_id: PHASE_11L_TENANT_A,
        receivable_id: 'phase11l-recv-a1',
        operation_id: 'phase11l-op-chg-a1',
        provider: 'internal',
        status: 'draft',
        amount: 99.99,
      },
    ],
  };
}
