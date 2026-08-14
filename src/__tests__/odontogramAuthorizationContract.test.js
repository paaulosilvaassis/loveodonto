import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MODULES_SPEC, permissionId } from '../permissions/catalog.js';
import {
  AUTH_DECISION_CODES,
  ODONTOGRAM_LIFECYCLE_OPERATIONS,
  ODONTOGRAM_OPERATIONS,
  ODONTOGRAM_OPERATION_PERMISSIONS,
  ODONTOGRAM_PERMISSION_ACTIONS,
  ODONTOGRAM_PERMISSION_CATALOG_IDS,
  ODONTOGRAM_PERMISSION_KEYS,
  ODONTOGRAM_PERMISSION_NAMESPACE,
  ODONTOGRAM_READ_OPERATIONS,
  ODONTOGRAM_WRITE_OPERATIONS,
  SQL_GRANULAR_PERMISSION_PRIMITIVE,
  authorizeOdontogramOperation,
} from '../domain/odontogram/index.js';

const BASE = Object.freeze({
  tenantMatches: true,
  patientMatches: true,
  permissions: Object.freeze([]),
});

function decide(overrides) {
  return authorizeOdontogramOperation({ ...BASE, ...overrides });
}

describe('OD-1D contrato de autorização do odontograma', () => {
  it('mapeia todas as operações para o namespace RBAC existente, sem granularidade falsa', () => {
    const catalog = MODULES_SPEC
      .flatMap((group) => group.children || [])
      .find((child) => child.key === 'prontuario_odontograma');
    expect(catalog.actions).toEqual(['view', 'create', 'edit']);
    expect(ODONTOGRAM_PERMISSION_NAMESPACE).toBe('prontuario_odontograma');
    expect([...ODONTOGRAM_PERMISSION_ACTIONS]).toEqual(['view', 'create', 'edit']);
    expect([...ODONTOGRAM_PERMISSION_KEYS]).toEqual([
      'prontuario_odontograma:view',
      'prontuario_odontograma:create',
      'prontuario_odontograma:edit',
    ]);
    expect([...ODONTOGRAM_PERMISSION_CATALOG_IDS]).toEqual([
      permissionId('prontuario_odontograma', 'view'),
      permissionId('prontuario_odontograma', 'create'),
      permissionId('prontuario_odontograma', 'edit'),
    ]);
    expect(SQL_GRANULAR_PERMISSION_PRIMITIVE).toBe('MISSING');
    expect(Object.keys(ODONTOGRAM_OPERATION_PERMISSIONS)).toEqual([...ODONTOGRAM_OPERATIONS]);
    for (const operation of ODONTOGRAM_OPERATIONS) {
      expect(ODONTOGRAM_PERMISSION_KEYS).toContain(ODONTOGRAM_OPERATION_PERMISSIONS[operation]);
    }
    expect(ODONTOGRAM_LIFECYCLE_OPERATIONS).toEqual([
      'submit_for_review',
      'finalize_chart',
      'reopen_chart',
    ]);
  });

  it('nega operação desconhecida, permissões ausentes e identidades inválidas', () => {
    expect(decide({ operation: 'tab_opened' }).code).toBe(AUTH_DECISION_CODES.UNKNOWN_OPERATION);
    expect(decide({ operation: 'view_current_chart', permissions: null }).code)
      .toBe(AUTH_DECISION_CODES.MISSING_PERMISSIONS);
    expect(decide({ operation: 'view_current_chart', tenantMatches: false }).code)
      .toBe(AUTH_DECISION_CODES.TENANT_MISMATCH);
    expect(decide({ operation: 'view_current_chart', tenantMatches: undefined }).code)
      .toBe(AUTH_DECISION_CODES.TENANT_MISMATCH);
    expect(decide({ operation: 'view_current_chart', tenantMatches: 'true' }).code)
      .toBe(AUTH_DECISION_CODES.TENANT_MISMATCH);
    expect(decide({ operation: 'view_current_chart', patientMatches: false }).code)
      .toBe(AUTH_DECISION_CODES.PATIENT_MISMATCH);
    expect(decide({ operation: 'view_current_chart', patientMatches: 1 }).code)
      .toBe(AUTH_DECISION_CODES.PATIENT_MISMATCH);
  });

  it('view autoriza só leitura; create/edit não se confundem com finalize', () => {
    const viewOnly = ['prontuario_odontograma:view'];
    expect(decide({ operation: 'view_current_chart', permissions: viewOnly }).allowed).toBe(true);
    expect(decide({ operation: 'view_clinical_history', permissions: viewOnly }).allowed).toBe(true);
    for (const operation of ODONTOGRAM_WRITE_OPERATIONS) {
      expect(decide({ operation, permissions: viewOnly, chartStatus: 'draft' }).allowed).toBe(false);
    }
    const createOnly = ['prontuario_odontograma:create'];
    expect(decide({ operation: 'create_chart', permissions: createOnly }).allowed).toBe(true);
    expect(decide({
      operation: 'finalize_chart',
      permissions: createOnly,
      chartStatus: 'draft',
    }).code).toBe(AUTH_DECISION_CODES.PERMISSION_DENIED);
    expect(decide({
      operation: 'correct_condition',
      permissions: createOnly,
      chartStatus: 'draft',
    }).code).toBe(AUTH_DECISION_CODES.PERMISSION_DENIED);
  });

  it('edit autoriza correção/finalize/reopen sem permissão inventada, com ciclo de vida', () => {
    const edit = ['perm-prontuario_odontograma-edit'];
    expect(decide({
      operation: 'correct_condition',
      permissions: edit,
      chartStatus: 'draft',
    }).allowed).toBe(true);
    expect(decide({
      operation: 'finalize_chart',
      permissions: edit,
      chartStatus: 'in_review',
    }).allowed).toBe(true);
    expect(decide({
      operation: 'record_condition',
      permissions: edit,
      chartStatus: 'finalized',
    }).code).toBe(AUTH_DECISION_CODES.CHART_FINALIZED);
    expect(decide({
      operation: 'reopen_chart',
      permissions: edit,
      chartStatus: 'finalized',
    }).allowed).toBe(true);
    expect(decide({
      operation: 'reopen_chart',
      permissions: edit,
      chartStatus: 'draft',
    }).code).toBe(AUTH_DECISION_CODES.INVALID_LIFECYCLE);
    expect(decide({
      operation: 'submit_for_review',
      permissions: edit,
      chartStatus: 'in_review',
    }).code).toBe(AUTH_DECISION_CODES.INVALID_LIFECYCLE);
  });

  it('não muta o caller, rejeita valores truthy e default-deny', () => {
    const permissions = ['prontuario_odontograma:view'];
    const input = {
      operation: 'view_current_chart',
      permissions,
      tenantMatches: true,
      patientMatches: true,
    };
    const before = JSON.stringify(input);
    const allowed = authorizeOdontogramOperation(input);
    expect(allowed.allowed).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    permissions.push('prontuario_odontograma:edit');
    expect(input.permissions).toHaveLength(2);

    expect(authorizeOdontogramOperation({
      operation: 'view_current_chart',
      permissions: { 'prontuario_odontograma:view': true },
      tenantMatches: true,
      patientMatches: true,
    }).code).toBe(AUTH_DECISION_CODES.MALFORMED_INPUT);

    expect(authorizeOdontogramOperation({
      operation: 'record_condition',
      permissions: ['yes'],
      tenantMatches: true,
      patientMatches: true,
      chartStatus: 'draft',
      adminOverride: 'true',
    }).code).toBe(AUTH_DECISION_CODES.MALFORMED_INPUT);

    expect(authorizeOdontogramOperation().code).toBe(AUTH_DECISION_CODES.MALFORMED_INPUT);
    expect(decide({
      operation: 'view_current_chart',
      permissions: [],
    }).allowed).toBe(false);
    expect(ODONTOGRAM_READ_OPERATIONS).not.toEqual(expect.arrayContaining(ODONTOGRAM_WRITE_OPERATIONS));
  });

  it('adminOverride estritamente boolean true ignora catálogo, não o tenant', () => {
    const allowed = decide({
      operation: 'finalize_chart',
      permissions: [],
      chartStatus: 'draft',
      adminOverride: true,
    });
    expect(allowed.allowed).toBe(true);
    expect(decide({
      operation: 'finalize_chart',
      permissions: [],
      chartStatus: 'draft',
      tenantMatches: false,
      adminOverride: true,
    }).code).toBe(AUTH_DECISION_CODES.TENANT_MISMATCH);
    expect(decide({
      operation: 'record_condition',
      permissions: [],
      chartStatus: 'finalized',
      adminOverride: true,
    }).code).toBe(AUTH_DECISION_CODES.CHART_FINALIZED);
  });

  it('não importa React, Supabase, IndexedDB, Three.js, finance nem odontograma legado', () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../domain/odontogram/authorizationContract.js'),
      'utf8',
    );
    const specifiers = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    expect(specifiers).toEqual(['./schemaContract.js']);
    expect(source).not.toMatch(/\b(react|indexedDB|localStorage|supabase|three)\b/i);
    expect(source).not.toMatch(/budget|finance|contractService|legacyOdontogram/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
