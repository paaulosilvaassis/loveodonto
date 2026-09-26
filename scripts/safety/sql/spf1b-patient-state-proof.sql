-- SPF.1B — Production patient state proof. READ ONLY. Aggregates only. No PII, no ids.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';

-- Q0. Prova da sessão (sem dados)
SELECT current_setting('transaction_read_only') AS transaction_read_only,
       current_user AS db_role;

-- Q1. Inventário: tabelas esperadas pelas migrations 025/027 + qualquer outra public.patient_* existente (só nomes)
WITH expected(table_name) AS (
  VALUES ('patients'), ('patient_phones'), ('patient_documents'), ('patient_records'),
         ('patient_birth_details'), ('patient_education'), ('patient_addresses'),
         ('patient_relationships'), ('patient_insurances'), ('patient_access'),
         ('patient_activity_summary')
), present AS (
  SELECT c.relname::text AS table_name, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('r', 'p')
     AND (c.relname = 'patients' OR c.relname LIKE 'patient\_%')
)
SELECT coalesce(e.table_name, p.table_name) AS table_name,
       (e.table_name IS NOT NULL)            AS expected_by_migrations,
       (p.table_name IS NOT NULL)            AS exists_in_db,
       p.relrowsecurity                      AS rls_enabled,
       p.relforcerowsecurity                 AS rls_forced
  FROM expected e
  FULL OUTER JOIN present p ON p.table_name = e.table_name
 ORDER BY 1;

-- Q2. patients — agregados (executa só se a tabela e as colunas existirem; nunca aborta)
WITH chk AS (
  SELECT to_regclass('public.patients') AS rel
), cols AS (
  SELECT count(*) AS n
    FROM chk
    JOIN pg_attribute a ON a.attrelid = chk.rel
   WHERE NOT a.attisdropped AND a.attnum > 0
     AND a.attname IN ('tenant_id', 'legacy_id', 'deleted_at')
), doc AS (
  SELECT CASE WHEN chk.rel IS NOT NULL AND cols.n = 3 THEN query_to_xml($q$
    SELECT count(*)                                                        AS total,
           count(*) FILTER (WHERE deleted_at IS NULL)                      AS active,
           count(*) FILTER (WHERE deleted_at IS NOT NULL)                  AS soft_deleted,
           count(*) FILTER (WHERE tenant_id IS NULL)                       AS without_tenant,
           count(*) FILTER (WHERE legacy_id IS NOT NULL AND legacy_id <> '') AS with_legacy_id,
           count(*) FILTER (WHERE legacy_id IS NULL OR legacy_id = '')     AS without_legacy_id,
           count(DISTINCT (tenant_id, legacy_id))                          AS distinct_tenant_legacy_all,
           count(DISTINCT (tenant_id, legacy_id)) FILTER (WHERE deleted_at IS NULL) AS distinct_tenant_legacy_active,
           (SELECT count(*) FROM (SELECT 1 FROM public.patients d WHERE d.deleted_at IS NULL
                                   GROUP BY d.tenant_id, d.legacy_id HAVING count(*) > 1) k) AS dup_keys_active,
           (SELECT coalesce(sum(k.c - 1), 0) FROM (SELECT count(*) AS c FROM public.patients d WHERE d.deleted_at IS NULL
                                   GROUP BY d.tenant_id, d.legacy_id HAVING count(*) > 1) k) AS dup_extra_rows_active,
           (SELECT count(*) FROM (SELECT 1 FROM public.patients d
                                   GROUP BY d.tenant_id, d.legacy_id HAVING count(*) > 1) k) AS dup_keys_all_rows,
           (SELECT coalesce(sum(k.c - 1), 0) FROM (SELECT count(*) AS c FROM public.patients d
                                   GROUP BY d.tenant_id, d.legacy_id HAVING count(*) > 1) k) AS dup_extra_rows_all_rows
      FROM public.patients
  $q$, false, true, '') END AS x
    FROM chk, cols
)
SELECT CASE WHEN x IS NULL THEN 'SKIPPED_TABLE_OR_COLUMNS_MISSING' ELSE 'OK' END AS status,
       (xpath('/row/total/text()', x))[1]::text::bigint                         AS total,
       (xpath('/row/active/text()', x))[1]::text::bigint                        AS active,
       (xpath('/row/soft_deleted/text()', x))[1]::text::bigint                  AS soft_deleted,
       (xpath('/row/without_tenant/text()', x))[1]::text::bigint                AS without_tenant,
       (xpath('/row/with_legacy_id/text()', x))[1]::text::bigint                AS with_legacy_id,
       (xpath('/row/without_legacy_id/text()', x))[1]::text::bigint             AS without_legacy_id,
       (xpath('/row/distinct_tenant_legacy_all/text()', x))[1]::text::bigint    AS distinct_tenant_legacy_all,
       (xpath('/row/distinct_tenant_legacy_active/text()', x))[1]::text::bigint AS distinct_tenant_legacy_active,
       (xpath('/row/dup_keys_active/text()', x))[1]::text::bigint               AS dup_keys_active,
       (xpath('/row/dup_extra_rows_active/text()', x))[1]::text::bigint         AS dup_extra_rows_active,
       (xpath('/row/dup_keys_all_rows/text()', x))[1]::text::bigint             AS dup_keys_all_rows,
       (xpath('/row/dup_extra_rows_all_rows/text()', x))[1]::text::bigint       AS dup_extra_rows_all_rows
  FROM doc;

-- Q3. patients — distribuição por tenant ANONIMIZADA (TENANT_1..N por volume; nenhum UUID sai)
WITH chk AS (
  SELECT to_regclass('public.patients') AS rel
), cols AS (
  SELECT count(*) AS n
    FROM chk
    JOIN pg_attribute a ON a.attrelid = chk.rel
   WHERE NOT a.attisdropped AND a.attnum > 0
     AND a.attname IN ('tenant_id', 'deleted_at')
), doc AS (
  SELECT CASE WHEN chk.rel IS NOT NULL AND cols.n = 2 THEN query_to_xml($q$
    SELECT count(*) AS tenant_groups,
           string_agg(g.label || ': total=' || g.total || ', active=' || g.active, ' | ' ORDER BY g.rn) AS distribution
      FROM (SELECT row_number() OVER (ORDER BY (tenant_id IS NULL), count(*) DESC, tenant_id) AS rn,
                   CASE WHEN tenant_id IS NULL THEN 'TENANT_NULL'
                        ELSE 'TENANT_' || row_number() OVER (ORDER BY (tenant_id IS NULL), count(*) DESC, tenant_id)
                   END AS label,
                   count(*) AS total,
                   count(*) FILTER (WHERE deleted_at IS NULL) AS active
              FROM public.patients
             GROUP BY tenant_id) g
  $q$, false, true, '') END AS x
    FROM chk, cols
)
SELECT CASE WHEN x IS NULL THEN 'SKIPPED_TABLE_OR_COLUMNS_MISSING' ELSE 'OK' END AS status,
       (xpath('/row/tenant_groups/text()', x))[1]::text::bigint AS tenant_groups,
       (xpath('/row/distribution/text()', x))[1]::text          AS distribution
  FROM doc;

-- Q4. Satélites — total, ativos, pacientes distintos, órfãos (por tabela; tabelas ausentes não abortam)
WITH sat(table_name) AS (
  VALUES ('patient_phones'), ('patient_documents'), ('patient_records'), ('patient_birth_details'),
         ('patient_education'), ('patient_addresses'), ('patient_relationships'), ('patient_insurances'),
         ('patient_access'), ('patient_activity_summary')
), chk AS (
  SELECT s.table_name,
         to_regclass('public.' || s.table_name) AS rel,
         (SELECT count(*) FROM pg_attribute a
           WHERE a.attrelid = to_regclass('public.' || s.table_name)
             AND NOT a.attisdropped AND a.attnum > 0
             AND a.attname IN ('tenant_id', 'patient_id', 'deleted_at')) AS ncols,
         (to_regclass('public.patients') IS NOT NULL) AS patients_exists
    FROM sat s
), doc AS (
  SELECT c.table_name, c.rel, c.ncols,
         CASE WHEN c.rel IS NOT NULL AND c.ncols = 3 THEN query_to_xml(format($f$
           SELECT count(*)                                     AS total,
                  count(*) FILTER (WHERE s.deleted_at IS NULL) AS active,
                  count(DISTINCT s.patient_id)                 AS distinct_patients,
                  %2$s                                         AS orphans
             FROM public.%1$I s
         $f$,
           c.table_name,
           CASE WHEN c.patients_exists
                THEN 'count(*) FILTER (WHERE s.patient_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = s.patient_id))'
                ELSE 'NULL::bigint' END), false, true, '') END AS x
    FROM chk c
)
SELECT table_name,
       CASE WHEN rel IS NULL THEN 'TABLE_ABSENT'
            WHEN ncols < 3   THEN 'COLUMNS_MISSING'
            ELSE 'OK' END                                        AS status,
       (xpath('/row/total/text()', x))[1]::text::bigint             AS total,
       (xpath('/row/active/text()', x))[1]::text::bigint            AS active,
       (xpath('/row/distinct_patients/text()', x))[1]::text::bigint AS distinct_patients,
       (xpath('/row/orphans/text()', x))[1]::text::bigint           AS orphans
  FROM doc
 ORDER BY table_name;

-- Q5. Satélites — duplicidade por chave lógica COMPROVADA (índices únicos das migrations 025/027)
WITH keys(table_name, key_name, key_cols, extra_pred, req_cols) AS (
  VALUES
    ('patient_phones',           'tenant_legacy_id',        'd.tenant_id, d.legacy_id',     '',                                  ARRAY['tenant_id','legacy_id','deleted_at']),
    ('patient_phones',           'one_primary_per_patient', 'd.tenant_id, d.patient_id',    ' AND d.is_primary = true',          ARRAY['tenant_id','patient_id','deleted_at','is_primary']),
    ('patient_documents',        'tenant_patient',          'd.tenant_id, d.patient_id',    '',                                  ARRAY['tenant_id','patient_id','deleted_at']),
    ('patient_records',          'tenant_legacy_id',        'd.tenant_id, d.legacy_id',     '',                                  ARRAY['tenant_id','legacy_id','deleted_at']),
    ('patient_records',          'tenant_patient',          'd.tenant_id, d.patient_id',    '',                                  ARRAY['tenant_id','patient_id','deleted_at']),
    ('patient_records',          'tenant_record_number',    'd.tenant_id, d.record_number', $p$ AND d.record_number <> ''$p$,    ARRAY['tenant_id','record_number','deleted_at']),
    ('patient_birth_details',    'tenant_patient',          'd.tenant_id, d.patient_id',    '',                                  ARRAY['tenant_id','patient_id','deleted_at']),
    ('patient_education',        'tenant_patient',          'd.tenant_id, d.patient_id',    '',                                  ARRAY['tenant_id','patient_id','deleted_at']),
    ('patient_addresses',        'tenant_legacy_id',        'd.tenant_id, d.legacy_id',     '',                                  ARRAY['tenant_id','legacy_id','deleted_at']),
    ('patient_addresses',        'one_primary_per_patient', 'd.tenant_id, d.patient_id',    ' AND d.is_primary = true',          ARRAY['tenant_id','patient_id','deleted_at','is_primary']),
    ('patient_relationships',    'tenant_patient',          'd.tenant_id, d.patient_id',    '',                                  ARRAY['tenant_id','patient_id','deleted_at']),
    ('patient_insurances',       'tenant_legacy_id',        'd.tenant_id, d.legacy_id',     '',                                  ARRAY['tenant_id','legacy_id','deleted_at']),
    ('patient_access',           'tenant_patient',          'd.tenant_id, d.patient_id',    '',                                  ARRAY['tenant_id','patient_id','deleted_at']),
    ('patient_activity_summary', 'tenant_patient',          'd.tenant_id, d.patient_id',    '',                                  ARRAY['tenant_id','patient_id','deleted_at'])
), chk AS (
  SELECT k.*,
         to_regclass('public.' || k.table_name) AS rel,
         (SELECT count(*) FROM pg_attribute a
           WHERE a.attrelid = to_regclass('public.' || k.table_name)
             AND NOT a.attisdropped AND a.attnum > 0
             AND a.attname = ANY (k.req_cols)) AS ncols
    FROM keys k
), doc AS (
  SELECT c.table_name, c.key_name, c.rel, c.ncols, c.req_cols,
         CASE WHEN c.rel IS NOT NULL AND c.ncols = cardinality(c.req_cols) THEN query_to_xml(format($f$
           SELECT count(*)                  AS dup_keys,
                  coalesce(sum(k.c - 1), 0) AS dup_extra_rows
             FROM (SELECT count(*) AS c
                     FROM public.%1$I d
                    WHERE d.deleted_at IS NULL%3$s
                    GROUP BY %2$s
                   HAVING count(*) > 1) k
         $f$, c.table_name, c.key_cols, c.extra_pred), false, true, '') END AS x
    FROM chk c
)
SELECT table_name,
       key_name,
       CASE WHEN rel IS NULL                   THEN 'TABLE_ABSENT'
            WHEN ncols < cardinality(req_cols) THEN 'COLUMNS_MISSING'
            ELSE 'OK' END                                     AS status,
       (xpath('/row/dup_keys/text()', x))[1]::text::bigint       AS dup_keys,
       (xpath('/row/dup_extra_rows/text()', x))[1]::text::bigint AS dup_extra_rows
  FROM doc
 ORDER BY table_name, key_name;

-- Q6. Helpers da migration 026 — só nome, assinatura e prosecdef (nenhum corpo/source)
WITH expected(proname) AS (
  VALUES ('app_try_parse_uuid'), ('app_current_tenant_id'), ('app_user_has_active_tenant_membership'),
         ('app_user_can_read_tenant'), ('app_user_can_access_tenant'), ('app_user_is_tenant_admin'),
         ('app_user_admin_tenant_id'), ('app_validate_critical_tenant_tables_rls'),
         ('app_assert_critical_tenant_tables_rls')
)
SELECT e.proname,
       (p.oid IS NOT NULL)                       AS present,
       pg_get_function_identity_arguments(p.oid) AS signature,
       p.prosecdef                               AS security_definer
  FROM expected e
  LEFT JOIN (pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public')
         ON p.proname = e.proname
 ORDER BY e.proname, signature;

-- Q7. Prova final de que a transação continuou somente leitura
SELECT current_setting('transaction_read_only') AS transaction_read_only_at_end;

ROLLBACK;
