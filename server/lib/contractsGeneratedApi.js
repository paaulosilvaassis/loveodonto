/**
 * Phase 4.10 Wave 3D — POST /internal/app/contracts/generated.
 * Espelha contrato gerado (IndexedDB → Postgres) quando migration 006 existir.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function buildGeneratedContractRow({ record = {}, tenantId, authUserId }) {
  const rec = record && typeof record === 'object' ? record : {};
  const id = normalizeText(rec.id);
  if (!id) {
    return { error: 'record.id é obrigatório.', status: 400 };
  }

  return {
    row: {
      id,
      tenant_id: tenantId,
      patient_id: normalizeText(rec.patientId),
      quote_id: normalizeText(rec.quoteId),
      quote_source: normalizeText(rec.quoteSource),
      template_id: normalizeText(rec.templateId) || null,
      template_version: Number(rec.templateVersion) || 1,
      contract_number: normalizeText(rec.contractNumber) || null,
      final_content: String(rec.finalContent ?? ''),
      rendered_html: String(rec.renderedHtml ?? ''),
      pdf_url: rec.pdfUrl ? String(rec.pdfUrl) : null,
      status: normalizeText(rec.status) || 'draft',
      generated_by: authUserId,
      generated_at: rec.generatedAt || new Date().toISOString(),
      canceled_at: rec.canceledAt || null,
      signed_at: rec.signedAt || null,
      metadata: rec.metadata && typeof rec.metadata === 'object' ? rec.metadata : {},
      updated_at: new Date().toISOString(),
    },
  };
}

export function mapGeneratedContractsTableError(error, normalizeDatabaseError) {
  const msg = normalizeDatabaseError(error, '');
  const lower = String(msg || '').toLowerCase();
  if (lower.includes('generated_contracts') && (lower.includes('does not exist') || lower.includes('not exist'))) {
    return {
      status: 501,
      body: {
        error:
          'Tabela generated_contracts ausente. Aplique a migration supabase/migrations/006_app_contracts.sql no projeto Supabase do backend.',
      },
    };
  }
  return null;
}

export function createContractsGeneratedHandler(deps) {
  const { supabase, normalizeDatabaseError } = deps;

  return async function handleContractsGenerated(req, res) {
    try {
      const authUserId = req.appAuthUser.id;
      const { data: tenantUser, error: tenantUserError } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', authUserId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (tenantUserError) throw tenantUserError;
      if (!tenantUser?.tenant_id) {
        return res.status(404).json({ error: 'Tenant não encontrado para o usuário autenticado.' });
      }

      const built = buildGeneratedContractRow({
        record: req.body?.record,
        tenantId: tenantUser.tenant_id,
        authUserId,
      });
      if (built.error) {
        return res.status(built.status).json({ error: built.error });
      }

      const { error } = await supabase.from('generated_contracts').upsert(built.row, { onConflict: 'id' });
      if (error) {
        const mapped = mapGeneratedContractsTableError(error, normalizeDatabaseError);
        if (mapped) return res.status(mapped.status).json(mapped.body);
        throw error;
      }

      return res.json({ ok: true, id: built.row.id });
    } catch (err) {
      console.error('[contracts-generated]', err);
      return res.status(400).json({ error: normalizeDatabaseError(err, 'Falha ao sincronizar contrato.') });
    }
  };
}
