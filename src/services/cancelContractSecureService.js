import { loadDb, withDb } from '../db/index.js';
import { can } from '../permissions/permissions.js';
import { verifyPassword } from './userAuthService.js';
import { cancelGeneratedContract } from './contractService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { normalizeContractLifecycleStatus } from '../contracts/contractLifecycleGuard.js';
import { logClinicalEvent } from './clinicalService.js';
import { createId } from './helpers.js';

const CONFIRM_PHRASE = 'CANCELAR CONTRATO';

function findUserAuthRow(user) {
  if (!user?.id) return null;
  const db = loadDb();
  return (db.userAuth || []).find(
    (r) => r.userId === user.id || r.collaboratorId === user.collaboratorId,
  ) || null;
}

function canCancelContract(user) {
  return Boolean(
    user?.role === 'admin'
    || user?.isMaster
    || can(user, 'admin_contratos:cancel'),
  );
}

export async function cancelContractSecure(user, contractId, payload = {}) {
  const {
    password,
    reason,
    confirmPhrase,
    financialAction = 'keep',
  } = payload;

  if (!canCancelContract(user)) {
    throw new Error('Somente administradores podem cancelar contratos.');
  }
  if (!String(reason || '').trim()) {
    throw new Error('Informe o motivo do cancelamento.');
  }
  if (String(confirmPhrase || '').trim().toUpperCase() !== CONFIRM_PHRASE) {
    throw new Error(`Digite exatamente: ${CONFIRM_PHRASE}`);
  }

  const authRow = findUserAuthRow(user);
  if (!authRow?.passwordHash) {
    throw new Error('Credencial de administrador não encontrada.');
  }
  const passwordOk = await verifyPassword(password, authRow.passwordHash);
  if (!passwordOk) {
    throw new Error('Senha incorreta.');
  }

  const db = loadDb();
  const contract = (db.generatedContracts || []).find((c) => c.id === contractId);
  if (!contract) throw new Error('Contrato não encontrado.');
  const normalized = normalizeContractLifecycleStatus(contract.status);
  if (normalized === 'signed' || normalized === 'voided' || normalized === 'superseded') {
    throw new Error('Contrato assinado não pode ser cancelado por este fluxo.');
  }
  if (normalized === 'cancelled') {
    throw new Error('Contrato já está cancelado.');
  }

  const auditEntry = {
    id: createId('ctr_audit'),
    contractId,
    quoteId: contract.quoteId,
    quoteSource: contract.quoteSource,
    patientId: contract.patientId,
    userId: user.id,
    userName: user.name || user.nome || user.email || 'Administrador',
    userRole: user.role || null,
    canceledAt: new Date().toISOString(),
    reason: String(reason).trim(),
    financialAction,
    previousStatus: contract.status,
    newStatus: CONTRACT_STATUS.CANCELED,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };

  const canceled = cancelGeneratedContract(user, contractId, {
    reason: auditEntry.reason,
    canceledBy: user.id,
    canceledByName: auditEntry.userName,
    financialAction,
  });

  withDb((d) => {
    if (!d.contractCancelAudit) d.contractCancelAudit = [];
    d.contractCancelAudit.push(auditEntry);
    const idx = (d.generatedContracts || []).findIndex((c) => c.id === contractId);
    if (idx >= 0) {
      d.generatedContracts[idx] = {
        ...d.generatedContracts[idx],
        cancelReason: auditEntry.reason,
        cancelFinancialAction: financialAction,
        canceledBy: user.id,
        canceledByName: auditEntry.userName,
      };
    }
    return d;
  });

  if (contract.quoteSource === 'clinical_budget' && contract.quoteId) {
    logClinicalEvent(
      contract.quoteId,
      'contract_canceled',
      {
        contractId,
        reason: auditEntry.reason,
        financialAction,
      },
      user.id,
    );
  }

  return canceled;
}

export { CONFIRM_PHRASE as CONTRACT_CANCEL_CONFIRM_PHRASE };
