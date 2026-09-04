import { createPatientQuick, getPatient, updatePatientProfile } from './patientService.js';
import {
  assertCadastroIdentitySaveAllowed,
  listDirtyIdentityFields,
} from './patientIdentityIntegrity.js';
import { shouldUsePatientRepositoryWritePrimary } from './patientRepositoryBridge.js';

export async function commitPatientCadastroProfile(user, { routePatientId, draft, originalProfile }) {
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
    tags: Array.isArray(draft?.profile?.tags) ? draft.profile.tags : [],
  };
  if (!payload.full_name || !payload.sex || !payload.birth_date || !payload.cpf) {
    throw new Error('Preencha os campos obrigatórios: Nome, Sexo, Data de nascimento e CPF.');
  }
  if (routePatientId) {
    const dirtyIdentityFields = listDirtyIdentityFields(
      originalProfile || livePatient?.profile,
      draft.profile,
    );
    const updated = await Promise.resolve(updatePatientProfile(user, routePatientId, payload, {
      source: 'patient-cadastro',
      dirtyIdentityFields,
    }));
    return { patientId: updated.id, profile: updated };
  }
  const created = await Promise.resolve(createPatientQuick(user, payload));
  return { patientId: created.patientId, profile: created.profile };
}

/** Sync wrapper — só seguro com WRITE_PRIMARY=false (defaults). */
export function commitPatientCadastroProfileSync(user, args) {
  if (shouldUsePatientRepositoryWritePrimary()) {
    throw new Error('commitPatientCadastroProfileSync indisponível com WRITE_PRIMARY; use a versão async.');
  }
  const livePatient = args.routePatientId ? getPatient(args.routePatientId) : null;
  assertCadastroIdentitySaveAllowed({
    routePatientId: args.routePatientId || null,
    draft: args.draft,
    livePatient,
  });
  const payload = {
    full_name: args.draft?.profile?.full_name,
    nickname: args.draft?.profile?.nickname,
    social_name: args.draft?.profile?.social_name,
    sex: args.draft?.profile?.sex,
    birth_date: args.draft?.profile?.birth_date,
    cpf: args.draft?.profile?.cpf,
    has_financial_responsible: Boolean(args.draft?.profile?.has_financial_responsible),
    dependent_full_name: args.draft?.profile?.dependent_full_name,
  };
  if (!payload.full_name || !payload.sex || !payload.birth_date || !payload.cpf) {
    throw new Error('Preencha os campos obrigatórios: Nome, Sexo, Data de nascimento e CPF.');
  }
  if (args.routePatientId) {
    const dirtyIdentityFields = listDirtyIdentityFields(
      args.originalProfile || livePatient?.profile,
      args.draft.profile,
    );
    const updated = updatePatientProfile(user, args.routePatientId, payload, {
      source: 'patient-cadastro',
      dirtyIdentityFields,
    });
    return { patientId: updated.id, profile: updated };
  }
  const created = createPatientQuick(user, payload);
  return { patientId: created.patientId, profile: created.profile };
}
