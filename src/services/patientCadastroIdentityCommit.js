import { createPatientQuick, getPatient, updatePatientProfile } from './patientService.js';
import {
  assertCadastroIdentitySaveAllowed,
  listDirtyIdentityFields,
} from './patientIdentityIntegrity.js';

export function commitPatientCadastroProfile(user, { routePatientId, draft, originalProfile }) {
  const livePatient = routePatientId ? getPatient(routePatientId) : null;
  assertCadastroIdentitySaveAllowed({
    routePatientId: routePatientId || null,
    draft,
    livePatient,
  });
  const payload = {
    full_name: draft?.profile?.full_name,
    nickname: draft?.profile?.nickname,
    social_name: draft?.profile?.social_name,
    sex: draft?.profile?.sex,
    birth_date: draft?.profile?.birth_date,
    cpf: draft?.profile?.cpf,
    has_financial_responsible: Boolean(draft?.profile?.has_financial_responsible),
    dependent_full_name: draft?.profile?.dependent_full_name,
  };
  if (!payload.full_name || !payload.sex || !payload.birth_date || !payload.cpf) {
    throw new Error('Preencha os campos obrigatórios: Nome, Sexo, Data de nascimento e CPF.');
  }
  if (routePatientId) {
    const dirtyIdentityFields = listDirtyIdentityFields(
      originalProfile || livePatient?.profile,
      draft.profile,
    );
    const updated = updatePatientProfile(user, routePatientId, payload, {
      source: 'patient-cadastro',
      dirtyIdentityFields,
    });
    return { patientId: updated.id, profile: updated };
  }
  const created = createPatientQuick(user, payload);
  return { patientId: created.patientId, profile: created.profile };
}
