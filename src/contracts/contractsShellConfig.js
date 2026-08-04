import {
  LayoutDashboard,
  Clock,
  CheckCircle2,
  FileText,
  ScrollText,
  PenLine,
  Settings,
  Layers,
} from 'lucide-react';

export const contractsShellNavItems = [
  { id: 'dashboard', label: 'Dashboard', route: '/gestao/contratos', icon: LayoutDashboard, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  { id: 'pendentes', label: 'Pendentes', route: '/gestao/contratos/pendentes', icon: Clock, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  { id: 'assinados', label: 'Assinados', route: '/gestao/contratos/assinados', icon: CheckCircle2, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  { id: 'modelos', label: 'Modelos', route: '/gestao/contratos/modelos', icon: FileText, rolesAllowed: ['admin', 'gerente'] },
  {
    id: 'modelos-v2',
    label: 'Modelos v2',
    route: '/gestao/contratos/modelos-v2',
    icon: Layers,
    rolesAllowed: ['admin', 'gerente'],
    /** Alinhado ao mount: domain + templates (default false; piloto staging por tenant). */
    featureFlagsAll: [
      'contracts_domain_v2_enabled',
      'contract_templates_v2_enabled',
    ],
  },
  {
    id: 'instancias-v2',
    label: 'Instâncias v2',
    route: '/gestao/contratos/instancias-v2',
    icon: FileText,
    rolesAllowed: ['admin', 'gerente'],
    /** Exige domain + module + versioning (todas false por padrão). */
    featureFlagsAll: [
      'contracts_domain_v2_enabled',
      'contracts_module_v2_enabled',
      'contract_versioning_enabled',
    ],
  },
  { id: 'termos', label: 'Termos', route: '/gestao/contratos/termos', icon: ScrollText, rolesAllowed: ['admin', 'gerente'] },
  { id: 'assinaturas', label: 'Assinaturas', route: '/gestao/contratos/assinaturas', icon: PenLine, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  {
    id: 'assinaturas-v2',
    label: 'Assinaturas v2',
    route: '/gestao/contratos/assinaturas-v2',
    icon: PenLine,
    rolesAllowed: ['admin', 'gerente'],
    /** Exige domain + module + versioning + internal signature (todas false por padrão). */
    featureFlagsAll: [
      'contracts_domain_v2_enabled',
      'contracts_module_v2_enabled',
      'contract_versioning_enabled',
      'contract_internal_signature_v2_enabled',
    ],
  },
  {
    id: 'documentos-v2',
    label: 'Documentos v2',
    route: '/gestao/contratos/documentos-v2',
    icon: FileText,
    rolesAllowed: ['admin', 'gerente'],
    /** Exige domain + module + versioning + pdf + storage (todas false por padrão). */
    featureFlagsAll: [
      'contracts_domain_v2_enabled',
      'contracts_module_v2_enabled',
      'contract_versioning_enabled',
      'contract_pdf_v2_enabled',
      'contract_storage_v2_enabled',
    ],
  },
  {
    id: 'conclusao-v2',
    label: 'Conclusão v2',
    route: '/gestao/contratos/conclusao-v2',
    icon: CheckCircle2,
    rolesAllowed: ['admin', 'gerente'],
    /** Exige domain + module + versioning + signature + pdf + storage + ledger (todas false). */
    featureFlagsAll: [
      'contracts_domain_v2_enabled',
      'contracts_module_v2_enabled',
      'contract_versioning_enabled',
      'contract_internal_signature_v2_enabled',
      'contract_pdf_v2_enabled',
      'contract_storage_v2_enabled',
      'contract_audit_ledger_enabled',
    ],
  },
  {
    id: 'entregas-v2',
    label: 'Entregas v2',
    route: '/gestao/contratos/entregas-v2',
    icon: PenLine,
    rolesAllowed: ['admin', 'gerente'],
    /** Exige flags de assinatura pública v2 (§18 — todas false por padrão). */
    featureFlagsAll: [
      'contracts_domain_v2_enabled',
      'contracts_module_v2_enabled',
      'contract_versioning_enabled',
      'contract_internal_signature_v2_enabled',
      'contract_pdf_v2_enabled',
      'contract_storage_v2_enabled',
      'contract_audit_ledger_enabled',
      'contract_patient_portal_enabled',
    ],
  },
  { id: 'config', label: 'Configurações', route: '/gestao/contratos/configuracoes', icon: Settings, rolesAllowed: ['admin', 'gerente'] },
];
