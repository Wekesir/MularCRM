export const moduleMeta = {
  dashboard: {
    title: 'Dashboard',
    description: 'Your collection performance, KPIs, and recent activity.',
  },

  users: {
    title: 'Users',
    description: 'Manage system users, roles, and access. Soft-deleted users can be restored.',
  },

  client_management: {
    title: 'Client Management',
    description: 'Maintain client profiles, contracts, and account details.',
  },
  debtor_management: {
    title: 'Debtor Management',
    description: 'Maintain debtor profiles, financial details, and interaction history.',
  },
  file_management: {
    title: 'File Management',
    description: 'Track and manage active case files and their documents.',
  },
  closed_files: {
    title: 'Closed Files',
    description: 'Review files that have been closed or resolved.',
  },
  agent_management: {
    title: 'Agent Management',
    description: 'Manage collection agents, roles, and performance.',
  },
  call_centers: {
    title: 'Call Centers',
    description: 'Create call centers, view staff, and add or transfer supervisors and agents.',
  },

  case_management: {
    title: 'Case Management',
    description:
      'Review client portfolios and assign cases to collection agents.',
  },
  all_cases: {
    title: 'All Cases',
    description:
      'Review client portfolios and assign cases to collection agents.',
  },
  my_portfolio: {
    title: 'My Portfolio',
    description:
      'Work the debtors assigned to you — call, SMS, email, and log responses.',
  },
  unassigned_files: {
    title: 'Unassigned Files',
    description:
      'Batch files with debtors still waiting to be assigned to an agent.',
  },

  bulk_sms: {
    title: 'Bulk SMS',
    description: 'Send SMS messages to multiple debtors or clients at once.',
  },
  bulk_emails: {
    title: 'Bulk Emails',
    description: 'Send email messages to multiple debtors or clients at once.',
  },
  communication_channels: {
    title: 'Communication Channels',
    description: 'Configure the channels used to contact debtors and clients.',
  },
  discounts_and_waivers: {
    title: 'Discounts and Waivers',
    description: 'Manage discount offers and fee waivers extended to debtors.',
  },

  contact_upload: {
    title: 'Contact Upload',
    description: 'Bulk import debtor and client contact information.',
  },

  payments: {
    title: 'Payments',
    description: 'Payments detected from daily debtor portfolio uploads.',
  },
  commissions: {
    title: 'Commissions',
    description: 'Commission earned from clients on collected amounts.',
  },
  ptp: {
    title: 'PTP (Promise to Pay)',
    description: 'Manage promise-to-pay arrangements made with debtors.',
  },
  restructured_loans: {
    title: 'Restructured Loans',
    description: 'Review and approve agent-proposed loan repayment plans.',
  },
  non_confirmed_payments: {
    title: 'Non-confirmed Payments',
    description: 'Review payments awaiting confirmation or reconciliation.',
  },

  debtor_summary: {
    title: 'Debtor Summary',
    description: 'Summary report of debtor accounts and balances.',
  },
  payment_performance: {
    title: 'Payment Performance',
    description: 'Analyze payment trends and collection performance over time.',
  },
  collector_performance: {
    title: 'Collector Performance',
    description: 'Compare collection performance across agents.',
  },
  portfolio_performance: {
    title: 'Portfolio Performance',
    description: 'Overview of portfolio health and recovery performance.',
  },
  promise_to_pay: {
    title: 'Promise To Pay',
    description: 'Report on promise-to-pay arrangements and their outcomes.',
  },
  aging_report: {
    title: 'Aging Report',
    description: 'Break down outstanding balances by age bucket.',
  },
  dispute_management: {
    title: 'Dispute Management',
    description: 'Report on disputed accounts and their resolution status.',
  },
  recovery_rate: {
    title: 'Recovery Rate',
    description: 'Track the percentage of debt successfully recovered.',
  },
  goip_calls_report: {
    title: 'GOIP Calls Report',
    description: 'Review call activity and outcomes made through GOIP lines.',
  },
  sms_report: {
    title: 'SMS Report',
    description: 'Review SMS delivery activity and outcomes.',
  },
  debtor_notes: {
    title: 'Debtor Notes',
    description: 'Review notes logged against debtor accounts.',
  },
  contact_attempt: {
    title: 'Contact Attempt',
    description: 'Review the history of contact attempts made with debtors.',
  },

  commission_rates: {
    title: 'Commission Rates',
    description: 'Set the commission rate negotiated with each client per debt category.',
  },
  debt_type: {
    title: 'Debt Type',
    description: 'Configure the debt types used to classify cases.',
  },
  debt_category: {
    title: 'Debt Category',
    description: 'Configure the debt categories used to group cases.',
  },
  client_type: {
    title: 'Client Type',
    description: 'Configure the client types used to classify accounts.',
  },
  debtor_upload_rules: {
    title: 'Debtor Upload Rules',
    description: 'Configure validation rules applied to debtor data uploads.',
  },
  currency: {
    title: 'Currency',
    description: 'Configure the currencies supported across the platform.',
  },
  payment_channels: {
    title: 'Payment Channels',
    description: 'Configure the payment channels accepted for repayments.',
  },
  closure_reason: {
    title: 'Closure Reason',
    description: 'Configure the reasons available when closing a file.',
  },
  template_variables: {
    title: 'Template Variables',
    description: 'Configure placeholder variables available in message templates.',
  },
  case_priority: {
    title: 'Case Priority',
    description: 'Configure the priority levels used to triage cases.',
  },
  agent_experience: {
    title: 'Agent Experience',
    description: 'Configure experience levels used to classify agents.',
  },
  agent_expertise: {
    title: 'Agent Expertise',
    description: 'Configure areas of expertise used to route cases to agents.',
  },
  client_agents: {
    title: 'Client Call Centers',
    description:
      'Assign each client to a call center once. New batches then auto-appear for that center.',
  },
  workload_parameters: {
    title: 'Workload Parameters',
    description: 'Configure limits and rules for agent case load distribution.',
  },
  contactability: {
    title: 'Contactability',
    description: 'Configure contactability scoring rules for debtors.',
  },
  contact_type: {
    title: 'Contact Type',
    description: 'Configure the types of contact methods available.',
  },
  contact_status: {
    title: 'Contact Status',
    description: 'Configure the statuses used to track contact outcomes.',
  },

  system_configurations: {
    title: 'System Configurations',
    description:
      'Manage business branding, communication channels, integrations, and user access levels for this deployment.',
  },
  profile: {
    title: 'My Profile',
    description: 'Update your account details, password, and device unlock settings.',
  },
};

export const pathToModuleKey = {
  '/dashboard': 'dashboard',
  '/users': 'users',

  '/management/client-management': 'client_management',
  '/management/debtor-management': 'debtor_management',
  '/management/file-management': 'file_management',
  '/management/closed-files': 'closed_files',
  '/management/agent-management': 'agent_management',
  '/management/call-centers': 'call_centers',

  '/case-management': 'all_cases',
  '/case-management/my-portfolio': 'my_portfolio',
  '/case-management/unassigned-files': 'unassigned_files',

  '/communication/bulk-sms': 'bulk_sms',
  '/communication/bulk-emails': 'bulk_emails',
  '/communication/communication-channels': 'communication_channels',
  '/communication/discounts-and-waivers': 'discounts_and_waivers',

  '/contact-upload': 'contact_upload',

  '/payments/payments': 'payments',
  '/payments/commissions': 'commissions',
  '/payments/ptp': 'ptp',
  '/payments/restructured-loans': 'restructured_loans',
  '/payments/non-confirmed-payments': 'non_confirmed_payments',

  '/reports/debtor-summary': 'debtor_summary',
  '/reports/payment-performance': 'payment_performance',
  '/reports/collector-performance': 'collector_performance',
  '/reports/portfolio-performance': 'portfolio_performance',
  '/reports/promise-to-pay': 'promise_to_pay',
  '/reports/aging-report': 'aging_report',
  '/reports/dispute-management': 'dispute_management',
  '/reports/recovery-rate': 'recovery_rate',
  '/reports/goip-calls-report': 'goip_calls_report',
  '/reports/sms-report': 'sms_report',
  '/reports/debtor-notes': 'debtor_notes',
  '/reports/contact-attempt': 'contact_attempt',

  '/settings/commission-rates': 'commission_rates',
  '/settings/debt-type': 'debt_type',
  '/settings/debt-category': 'debt_category',
  '/settings/client-type': 'client_type',
  '/settings/debtor-upload-rules': 'debtor_upload_rules',
  '/settings/currency': 'currency',
  '/settings/payment-channels': 'payment_channels',
  '/settings/closure-reason': 'closure_reason',
  '/settings/template-variables': 'template_variables',
  '/settings/case-priority': 'case_priority',
  '/settings/agent-experience': 'agent_experience',
  '/settings/agent-expertise': 'agent_expertise',
  '/settings/client-agents': 'client_agents',
  '/settings/workload-parameters': 'workload_parameters',
  '/settings/contactability': 'contactability',
  '/settings/contact-type': 'contact_type',
  '/settings/contact-status': 'contact_status',

  '/profile': 'profile',
  '/profile/password': 'profile',
  '/profile/passkeys': 'profile',

  '/system-configurations': 'system_configurations',
  '/system-configurations/business': 'system_configurations',
  '/system-configurations/communication': 'system_configurations',
  '/system-configurations/integrations': 'system_configurations',
  '/system-configurations/database-backup': 'system_configurations',
  '/system-configurations/access-levels': 'system_configurations',
  '/system-configurations/report-access': 'system_configurations',
  '/system-configurations/audit-logs': 'system_configurations',
};

/**
 * Maps sidebar / route paths to the nested permission registry keys.
 * Shape: { module: string, sub?: string }
 * - Leaf modules use { module } only (e.g. dashboard, unassigned_files).
 * - Nested modules use { module, sub } (e.g. management.client_management).
 * - Parent-only links (system_configurations) omit `sub` and grant access if
 *   any submodule under that parent is readable.
 * Paths with no entry (e.g. /users) are admin-only via isSystemAdmin.
 */
export const pathToPermission = {
  '/dashboard': { module: 'dashboard' },

  '/management/client-management': { module: 'management', sub: 'client_management' },
  '/management/debtor-management': { module: 'management', sub: 'debtor_management' },
  '/management/file-management': { module: 'management', sub: 'file_management' },
  '/management/closed-files': { module: 'management', sub: 'closed_files' },
  '/management/agent-management': { module: 'management', sub: 'agent_management' },
  '/management/call-centers': { module: 'management', sub: 'call_centers' },

  '/case-management': { module: 'case_management', sub: 'all_cases' },
  '/case-management/my-portfolio': { module: 'case_management', sub: 'my_portfolio' },
  '/case-management/unassigned-files': { module: 'unassigned_files' },

  '/communication/bulk-sms': { module: 'communication', sub: 'bulk_sms' },
  '/communication/bulk-emails': { module: 'communication', sub: 'bulk_emails' },
  '/communication/communication-channels': {
    module: 'communication',
    sub: 'communication_channels',
  },
  '/communication/discounts-and-waivers': {
    module: 'communication',
    sub: 'discounts_and_waivers',
  },

  '/contact-upload': { module: 'contact_upload' },

  '/payments/payments': { module: 'payments', sub: 'payments' },
  '/payments/commissions': { module: 'payments', sub: 'commissions' },
  '/payments/ptp': { module: 'payments', sub: 'ptp' },
  '/payments/restructured-loans': { module: 'payments', sub: 'restructured_loans' },
  '/payments/non-confirmed-payments': {
    module: 'payments',
    sub: 'non_confirmed_payments',
  },

  '/reports/debtor-summary': { module: 'reports', sub: 'debtor_summary' },
  '/reports/payment-performance': { module: 'reports', sub: 'payment_performance' },
  '/reports/collector-performance': { module: 'reports', sub: 'collector_performance' },
  '/reports/portfolio-performance': { module: 'reports', sub: 'portfolio_performance' },
  '/reports/promise-to-pay': { module: 'reports', sub: 'promise_to_pay' },
  '/reports/aging-report': { module: 'reports', sub: 'aging_report' },
  '/reports/dispute-management': { module: 'reports', sub: 'dispute_management' },
  '/reports/recovery-rate': { module: 'reports', sub: 'recovery_rate' },
  '/reports/goip-calls-report': { module: 'reports', sub: 'goip_calls_report' },
  '/reports/sms-report': { module: 'reports', sub: 'sms_report' },
  '/reports/debtor-notes': { module: 'reports', sub: 'debtor_notes' },
  '/reports/contact-attempt': { module: 'reports', sub: 'contact_attempt' },

  '/settings/commission-rates': { module: 'settings', sub: 'commission_rates' },
  '/settings/debt-type': { module: 'settings', sub: 'debt_type' },
  '/settings/debt-category': { module: 'settings', sub: 'debt_category' },
  '/settings/client-type': { module: 'settings', sub: 'client_type' },
  '/settings/debtor-upload-rules': { module: 'settings', sub: 'debtor_upload_rules' },
  '/settings/currency': { module: 'settings', sub: 'currency' },
  '/settings/payment-channels': { module: 'settings', sub: 'payment_channels' },
  '/settings/closure-reason': { module: 'settings', sub: 'closure_reason' },
  '/settings/template-variables': { module: 'settings', sub: 'template_variables' },
  '/settings/case-priority': { module: 'settings', sub: 'case_priority' },
  '/settings/agent-experience': { module: 'settings', sub: 'agent_experience' },
  '/settings/agent-expertise': { module: 'settings', sub: 'agent_expertise' },
  '/settings/client-agents': { module: 'settings', sub: 'client_agents' },
  '/settings/workload-parameters': { module: 'settings', sub: 'workload_parameters' },
  '/settings/contactability': { module: 'settings', sub: 'contactability' },
  '/settings/contact-type': { module: 'settings', sub: 'contact_type' },
  '/settings/contact-status': { module: 'settings', sub: 'contact_status' },

  '/system-configurations': { module: 'system_configurations' },
  '/system-configurations/business': {
    module: 'system_configurations',
    sub: 'business',
  },
  '/system-configurations/communication': {
    module: 'system_configurations',
    sub: 'communication',
  },
  '/system-configurations/integrations': {
    module: 'system_configurations',
    sub: 'integrations',
  },
  '/system-configurations/access-levels': {
    module: 'system_configurations',
    sub: 'access_levels',
  },
  '/system-configurations/report-access': {
    module: 'system_configurations',
    sub: 'report_access',
  },
};

export function getModuleMeta(pathname) {
  if (pathToModuleKey[pathname]) {
    return moduleMeta[pathToModuleKey[pathname]];
  }

  if (pathname.startsWith('/system-configurations')) {
    return moduleMeta.system_configurations;
  }

  if (pathname.startsWith('/case-management/unassigned-files')) {
    return moduleMeta.unassigned_files;
  }

  if (pathname.startsWith('/case-management/my-portfolio')) {
    return moduleMeta.my_portfolio;
  }

  if (pathname.startsWith('/case-management')) {
    return moduleMeta.all_cases;
  }

  if (pathname.startsWith('/communication/communication-channels')) {
    return moduleMeta.communication_channels;
  }

  return { title: 'OMNICRM', description: '' };
}
