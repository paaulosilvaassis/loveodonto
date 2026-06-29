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
  return putJson('/internal/app/clinic-profile', payload);
}
