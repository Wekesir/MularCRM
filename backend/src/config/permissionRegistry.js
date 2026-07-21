const CRUD = { create: true, read: true, update: true, delete: true };
const NONE = { create: false, read: false, update: false, delete: false };

const PERMISSION_REGISTRY = [
  { key: 'dashboard', label: 'Dashboard' },
  {
    key: 'management',
    label: 'Management',
    submodules: [
      { key: 'client_management', label: 'Client Management' },
      { key: 'debtor_management', label: 'Debtor Management' },
      { key: 'file_management', label: 'File Management' },
      { key: 'closed_files', label: 'Closed Files' },
      { key: 'agent_management', label: 'Agent Management' },
      { key: 'call_centers', label: 'Call Centers' },
    ],
  },
  {
    key: 'case_management',
    label: 'Case Management',
    submodules: [
      { key: 'all_cases', label: 'All Cases' },
      { key: 'my_portfolio', label: 'My Portfolio' },
    ],
  },
  { key: 'unassigned_files', label: 'Unassigned Files' },
  {
    key: 'communication',
    label: 'Communication',
    submodules: [
      { key: 'bulk_sms', label: 'Bulk SMS' },
      { key: 'bulk_emails', label: 'Bulk Emails' },
      { key: 'communication_channels', label: 'Communication Channels' },
      { key: 'discounts_and_waivers', label: 'Discounts and Waivers' },
    ],
  },
  { key: 'contact_upload', label: 'Contact Upload' },
  {
    key: 'payments',
    label: 'Payments',
    submodules: [
      { key: 'payments', label: 'Payments' },
      { key: 'commissions', label: 'Commissions' },
      { key: 'ptp', label: 'PTP (Promise to Pay)' },
      { key: 'restructured_loans', label: 'Restructured Loans' },
      { key: 'non_confirmed_payments', label: 'Non-confirmed Payments' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    submodules: [
      { key: 'debtor_summary', label: 'Debtor Summary' },
      { key: 'payment_performance', label: 'Payment Performance' },
      { key: 'collector_performance', label: 'Collector Performance' },
      { key: 'portfolio_performance', label: 'Portfolio Performance' },
      { key: 'promise_to_pay', label: 'Promise To Pay' },
      { key: 'aging_report', label: 'Aging Report' },
      { key: 'dispute_management', label: 'Dispute Management' },
      { key: 'recovery_rate', label: 'Recovery Rate' },
      { key: 'goip_calls_report', label: 'GOIP Calls Report' },
      { key: 'sms_report', label: 'SMS Report' },
      { key: 'debtor_notes', label: 'Debtor Notes' },
      { key: 'contact_attempt', label: 'Contact Attempt' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    submodules: [
      { key: 'commission_rates', label: 'Commission Rates' },
      { key: 'debt_type', label: 'Debt Type' },
      { key: 'debt_category', label: 'Debt Category' },
      { key: 'regions', label: 'Regions' },
      { key: 'client_type', label: 'Client Type' },
      { key: 'debtor_upload_rules', label: 'Debtor Upload Rules' },
      { key: 'currency', label: 'Currency' },
      { key: 'payment_channels', label: 'Payment Channels' },
      { key: 'closure_reason', label: 'Closure Reason' },
      { key: 'template_variables', label: 'Template Variables' },
      { key: 'case_priority', label: 'Case Priority' },
      { key: 'agent_experience', label: 'Agent Experience' },
      { key: 'agent_expertise', label: 'Agent Expertise' },
      { key: 'client_agents', label: 'Client Call Centers' },
      { key: 'workload_parameters', label: 'Workload Parameters' },
      { key: 'contactability', label: 'Contactability' },
      { key: 'contact_type', label: 'Contact Type' },
      { key: 'contact_status', label: 'Contact Status' },
    ],
  },
  {
    key: 'system_configurations',
    label: 'System Configurations',
    submodules: [
      { key: 'business', label: 'Business Configs' },
      { key: 'communication', label: 'Communication Integration' },
      { key: 'integrations', label: 'Integrations' },
      { key: 'access_levels', label: 'Access Levels' },
      { key: 'report_access', label: 'Report Access' },
    ],
  },
];

function buildFullPermissions() {
  const permissions = {};

  for (const mod of PERMISSION_REGISTRY) {
    if (mod.submodules) {
      permissions[mod.key] = {};
      for (const sub of mod.submodules) {
        permissions[mod.key][sub.key] = { ...CRUD };
      }
    } else {
      permissions[mod.key] = { ...CRUD };
    }
  }

  return permissions;
}

function buildEmptyPermissions() {
  const permissions = {};

  for (const mod of PERMISSION_REGISTRY) {
    if (mod.submodules) {
      permissions[mod.key] = {};
      for (const sub of mod.submodules) {
        permissions[mod.key][sub.key] = { ...NONE };
      }
    } else {
      permissions[mod.key] = { ...NONE };
    }
  }

  return permissions;
}

function setCrud(target, path, crud) {
  const parts = path.split('.');
  if (parts.length === 1) {
    target[parts[0]] = { ...crud };
    return;
  }
  const [mod, sub] = parts;
  if (!target[mod] || typeof target[mod] !== 'object') target[mod] = {};
  target[mod][sub] = { ...crud };
}

/** Default matrix for Senior Supervisor (company-wide, no system config). */
function buildSeniorSupervisorPermissions() {
  const p = buildEmptyPermissions();
  const r = { create: true, read: true, update: true, delete: false };
  const ro = { create: false, read: true, update: false, delete: false };

  setCrud(p, 'dashboard', CRUD);
  setCrud(p, 'management.client_management', r);
  // Senior Supervisors upload debtor batches and bind them to call centers.
  setCrud(p, 'management.debtor_management', r);
  setCrud(p, 'management.file_management', ro);
  setCrud(p, 'management.closed_files', ro);
  setCrud(p, 'management.agent_management', r);
  setCrud(p, 'management.call_centers', CRUD);
  setCrud(p, 'case_management.all_cases', r);
  setCrud(p, 'unassigned_files', ro);
  setCrud(p, 'payments.payments', ro);
  setCrud(p, 'payments.ptp', ro);
  setCrud(p, 'payments.restructured_loans', ro);
  setCrud(p, 'settings.client_agents', CRUD);
  setCrud(p, 'settings.agent_experience', ro);
  setCrud(p, 'settings.agent_expertise', ro);
  applyModuleCrud(p, 'reports', RO);
  return p;
}

/** Default matrix for Supervisor (call-center scoped). */
function buildSupervisorPermissions() {
  const p = buildEmptyPermissions();
  const r = { create: true, read: true, update: true, delete: false };
  const ro = { create: false, read: true, update: false, delete: false };

  setCrud(p, 'dashboard', CRUD);
  setCrud(p, 'management.client_management', ro);
  setCrud(p, 'management.debtor_management', ro);
  setCrud(p, 'management.file_management', ro);
  setCrud(p, 'management.closed_files', ro);
  setCrud(p, 'management.agent_management', r);
  setCrud(p, 'case_management.all_cases', r);
  setCrud(p, 'unassigned_files', r);
  setCrud(p, 'payments.payments', ro);
  setCrud(p, 'payments.ptp', r);
  setCrud(p, 'payments.restructured_loans', r);
  setCrud(p, 'communication.bulk_sms', r);
  setCrud(p, 'communication.bulk_emails', r);
  // Center-scoped report suite (backend resolveReportScope → mode: center).
  applyModuleCrud(p, 'reports', RO);
  return p;
}

/**
 * Default matrix for Agents (personal portfolio).
 * Reports are a curated self-scoped set — data handlers force agent mode.
 * Portfolio Performance and Dispute Management stay supervisor+ only.
 */
function buildAgentDefaultPermissions() {
  const p = buildEmptyPermissions();
  const r = { create: true, read: true, update: true, delete: false };
  const ro = { create: false, read: true, update: false, delete: false };

  setCrud(p, 'dashboard', CRUD);
  setCrud(p, 'case_management.my_portfolio', r);
  setCrud(p, 'payments.ptp', r);
  setCrud(p, 'payments.restructured_loans', r);
  setCrud(p, 'payments.payments', ro);

  // Self-scoped operational reports (own book / own activity only).
  setCrud(p, 'reports.debtor_summary', ro);
  setCrud(p, 'reports.aging_report', ro);
  setCrud(p, 'reports.promise_to_pay', ro);
  setCrud(p, 'reports.contact_attempt', ro);
  setCrud(p, 'reports.debtor_notes', ro);
  setCrud(p, 'reports.payment_performance', ro);
  setCrud(p, 'reports.recovery_rate', ro);
  setCrud(p, 'reports.collector_performance', ro);
  setCrud(p, 'reports.goip_calls_report', ro);
  setCrud(p, 'reports.sms_report', ro);
  return p;
}

const RO = { create: false, read: true, update: false, delete: false };
const R = { create: true, read: true, update: true, delete: false };

function applyModuleCrud(target, moduleKey, crud) {
  const mod = PERMISSION_REGISTRY.find((m) => m.key === moduleKey);
  if (!mod) return;
  if (mod.submodules) {
    for (const sub of mod.submodules) {
      setCrud(target, `${moduleKey}.${sub.key}`, crud);
    }
  } else {
    setCrud(target, moduleKey, crud);
  }
}

/** Near-full ops; no system_configurations (reserved for System Admin). */
function buildTenantAdministratorPermissions() {
  const p = buildEmptyPermissions();
  for (const mod of PERMISSION_REGISTRY) {
    if (mod.key === 'system_configurations') continue;
    applyModuleCrud(p, mod.key, CRUD);
  }
  return p;
}

/** Dashboard + all reports read-only. */
function buildExecutivePermissions() {
  const p = buildEmptyPermissions();
  setCrud(p, 'dashboard', RO);
  applyModuleCrud(p, 'reports', RO);
  return p;
}

/** Broad operational read across management, cases, payments, reports. */
function buildGeneralManagerPermissions() {
  const p = buildEmptyPermissions();
  setCrud(p, 'dashboard', CRUD);
  applyModuleCrud(p, 'management', RO);
  applyModuleCrud(p, 'case_management', RO);
  setCrud(p, 'unassigned_files', RO);
  applyModuleCrud(p, 'payments', RO);
  applyModuleCrud(p, 'reports', RO);
  return p;
}

/** Same shape as Senior Supervisor. */
function buildRegionalManagerPermissions() {
  return buildSeniorSupervisorPermissions();
}

/** Collections ops: cases, unassigned, debtors/files, payments/PTP, agents. */
function buildCollectionsManagerPermissions() {
  const p = buildEmptyPermissions();
  setCrud(p, 'dashboard', CRUD);
  setCrud(p, 'management.client_management', RO);
  setCrud(p, 'management.debtor_management', R);
  setCrud(p, 'management.file_management', R);
  setCrud(p, 'management.closed_files', RO);
  setCrud(p, 'management.agent_management', R);
  setCrud(p, 'case_management.all_cases', R);
  setCrud(p, 'unassigned_files', R);
  setCrud(p, 'payments.payments', R);
  setCrud(p, 'payments.ptp', R);
  setCrud(p, 'payments.restructured_loans', R);
  setCrud(p, 'payments.commissions', RO);
  setCrud(p, 'payments.non_confirmed_payments', RO);
  setCrud(p, 'communication.bulk_sms', R);
  setCrud(p, 'communication.bulk_emails', R);
  applyModuleCrud(p, 'reports', RO);
  return p;
}

function buildCallCentreSupervisorPermissions() {
  return buildSupervisorPermissions();
}

function buildInternalAgentPermissions() {
  return buildAgentDefaultPermissions();
}

function buildExternalAgentSupervisorPermissions() {
  return buildSupervisorPermissions();
}

function buildExternalAgentPermissions() {
  return buildAgentDefaultPermissions();
}

/** Debtor RO, communication, contact upload, PTP. */
function buildCustomerServiceOfficerPermissions() {
  const p = buildEmptyPermissions();
  setCrud(p, 'dashboard', CRUD);
  setCrud(p, 'management.debtor_management', RO);
  setCrud(p, 'communication.bulk_sms', R);
  setCrud(p, 'communication.bulk_emails', R);
  setCrud(p, 'contact_upload', R);
  setCrud(p, 'payments.ptp', R);
  setCrud(p, 'payments.restructured_loans', R);
  return p;
}

/** Dashboard, reports RO, debtors/files RO. */
function buildComplianceOfficerPermissions() {
  const p = buildEmptyPermissions();
  setCrud(p, 'dashboard', CRUD);
  setCrud(p, 'management.debtor_management', RO);
  setCrud(p, 'management.file_management', RO);
  setCrud(p, 'management.closed_files', RO);
  applyModuleCrud(p, 'reports', RO);
  return p;
}

/** Dashboard + reports + management read-only; no write. */
function buildAuditorPermissions() {
  const p = buildEmptyPermissions();
  setCrud(p, 'dashboard', RO);
  applyModuleCrud(p, 'management', RO);
  applyModuleCrud(p, 'case_management', RO);
  setCrud(p, 'unassigned_files', RO);
  applyModuleCrud(p, 'payments', RO);
  applyModuleCrud(p, 'reports', RO);
  return p;
}

/** Dashboard RO + all reports RO only. */
function buildReportViewerPermissions() {
  const p = buildEmptyPermissions();
  setCrud(p, 'dashboard', RO);
  applyModuleCrud(p, 'reports', RO);
  return p;
}

/** Roles seeded alongside System Admin / Senior Supervisor / Supervisor / Agent. */
const SEEDED_ORG_ROLES = [
  { name: 'Tenant Administrator', build: buildTenantAdministratorPermissions },
  { name: 'Executive', build: buildExecutivePermissions },
  { name: 'General Manager', build: buildGeneralManagerPermissions },
  { name: 'Regional Manager', build: buildRegionalManagerPermissions },
  { name: 'Collections Manager', build: buildCollectionsManagerPermissions },
  { name: 'Call Centre Supervisor', build: buildCallCentreSupervisorPermissions },
  { name: 'Internal Agent', build: buildInternalAgentPermissions },
  { name: 'External Agent Supervisor', build: buildExternalAgentSupervisorPermissions },
  { name: 'External Agent', build: buildExternalAgentPermissions },
  { name: 'Customer Service Officer', build: buildCustomerServiceOfficerPermissions },
  { name: 'Compliance Officer', build: buildComplianceOfficerPermissions },
  { name: 'Auditor', build: buildAuditorPermissions },
  { name: 'Report Viewer', build: buildReportViewerPermissions },
];

module.exports = {
  PERMISSION_REGISTRY,
  CRUD,
  NONE,
  buildFullPermissions,
  buildEmptyPermissions,
  buildSeniorSupervisorPermissions,
  buildSupervisorPermissions,
  buildAgentDefaultPermissions,
  buildTenantAdministratorPermissions,
  buildExecutivePermissions,
  buildGeneralManagerPermissions,
  buildRegionalManagerPermissions,
  buildCollectionsManagerPermissions,
  buildCallCentreSupervisorPermissions,
  buildInternalAgentPermissions,
  buildExternalAgentSupervisorPermissions,
  buildExternalAgentPermissions,
  buildCustomerServiceOfficerPermissions,
  buildComplianceOfficerPermissions,
  buildAuditorPermissions,
  buildReportViewerPermissions,
  SEEDED_ORG_ROLES,
};
