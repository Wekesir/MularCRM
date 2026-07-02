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
    ],
  },
  { key: 'case_management', label: 'Case Management' },
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
      { key: 'client_type', label: 'Client Type' },
      { key: 'debtor_upload_rules', label: 'Debtor Upload Rules' },
      { key: 'currency', label: 'Currency' },
      { key: 'payment_channels', label: 'Payment Channels' },
      { key: 'closure_reason', label: 'Closure Reason' },
      { key: 'template_variables', label: 'Template Variables' },
      { key: 'case_priority', label: 'Case Priority' },
      { key: 'agent_experience', label: 'Agent Experience' },
      { key: 'agent_expertise', label: 'Agent Expertise' },
      { key: 'client_agents', label: 'Client Agents' },
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

module.exports = {
  PERMISSION_REGISTRY,
  CRUD,
  NONE,
  buildFullPermissions,
  buildEmptyPermissions,
};
