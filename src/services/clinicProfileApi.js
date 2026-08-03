import { assertLogoUrlSafeForApi } from './clinicLogoUploadService.js';
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
import {
  assertAdminApiFetchAllowed,
  buildAdminApiUrl,
  getDevDirectAdminApiUrl,
  getConfiguredAdminApiBaseUrl,
} from '../config/adminApiBase.js';

async function putJson(path, body) {
  assertAdminApiFetchAllowed();
  const accessToken = await getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Sessão SaaS ausente para salvar perfil da clínica.');
  }
  const urls = [];
  if (import.meta.env.DEV && !getConfiguredAdminApiBaseUrl()) {
    urls.push(getDevDirectAdminApiUrl(path));
  }
  urls.push(buildAdminApiUrl(path));

  let lastErr;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error(
            'A logomarca é grande demais para enviar diretamente. '
              + 'O upload deve ir para o Supabase Storage antes de salvar — atualize a página e tente novamente.',
          );
        }
        throw new Error(json?.error || `Erro HTTP ${response.status} ao salvar perfil da clínica.`);
      }
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Falha ao salvar perfil da clínica.');
}

export async function saveClinicProfileRemote(payload) {
  const body = { ...payload };
  if (body.logoUrl != null) {
    body.logoUrl = assertLogoUrlSafeForApi(body.logoUrl);
  }
  return putJson('/internal/app/clinic-profile', body);
}
