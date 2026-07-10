import Dashboard from '../pages/Dashboard';

// Users
import UsersPage from '../pages/users/UsersPage';

// Management
import ClientManagementPage from '../pages/management/ClientManagementPage';
import DebtorManagementPage from '../pages/management/DebtorManagementPage';
import FileManagementPage from '../pages/management/FileManagementPage';
import ClosedFilesPage from '../pages/management/ClosedFilesPage';
import AgentManagementPage from '../pages/management/AgentManagementPage';

// Case Management
import CaseManagementPage from '../pages/CaseManagementPage';
import ClientFilesPage from '../pages/ClientFilesPage';
import FileCasesPage from '../pages/case-management/FileCasesPage.jsx';
import UnassignedFilesPage from '../pages/case-management/UnassignedFilesPage.jsx';

// Communication
import BulkSmsPage from '../pages/communication/BulkSmsPage';
import BulkEmailsPage from '../pages/communication/BulkEmailsPage';
import DiscountsWaiversPage from '../pages/communication/DiscountsWaiversPage';

// Contact Upload
import ContactUploadPage from '../pages/ContactUploadPage';

// Payments
import PaymentsPage from '../pages/payments/PaymentsPage';
import CommissionsPage from '../pages/payments/CommissionsPage';
import PtpPage from '../pages/payments/PtpPage';
import NonConfirmedPaymentsPage from '../pages/payments/NonConfirmedPaymentsPage';

// Reports
import DebtorSummaryPage from '../pages/reports/DebtorSummaryPage';
import PaymentPerformancePage from '../pages/reports/PaymentPerformancePage';
import CollectorPerformancePage from '../pages/reports/CollectorPerformancePage';
import PortfolioPerformancePage from '../pages/reports/PortfolioPerformancePage';
import PromiseToPayPage from '../pages/reports/PromiseToPayPage';
import AgingReportPage from '../pages/reports/AgingReportPage';
import DisputeManagementPage from '../pages/reports/DisputeManagementPage';
import RecoveryRatePage from '../pages/reports/RecoveryRatePage';
import GoipCallsReportPage from '../pages/reports/GoipCallsReportPage';
import SmsReportPage from '../pages/reports/SmsReportPage';
import DebtorNotesPage from '../pages/reports/DebtorNotesPage';
import ContactAttemptPage from '../pages/reports/ContactAttemptPage';

// Settings
import CommissionRatesPage from '../pages/settings/CommissionRatesPage';
import DebtTypePage from '../pages/settings/DebtTypePage';
import DebtCategoryPage from '../pages/settings/DebtCategoryPage';
import ClientTypePage from '../pages/settings/ClientTypePage';
import DebtorUploadRulesPage from '../pages/settings/DebtorUploadRulesPage';
import CurrencyPage from '../pages/settings/CurrencyPage';
import PaymentChannelsPage from '../pages/settings/PaymentChannelsPage';
import ClosureReasonPage from '../pages/settings/ClosureReasonPage';
import TemplateVariablesPage from '../pages/settings/TemplateVariablesPage';
import CasePriorityPage from '../pages/settings/CasePriorityPage';
import AgentExperiencePage from '../pages/settings/AgentExperiencePage';
import AgentExpertisePage from '../pages/settings/AgentExpertisePage';
import ClientAgentsPage from '../pages/settings/ClientAgentsPage';
import WorkloadParametersPage from '../pages/settings/WorkloadParametersPage';
import ContactabilityPage from '../pages/settings/ContactabilityPage';
import ContactTypePage from '../pages/settings/ContactTypePage';
import ContactStatusPage from '../pages/settings/ContactStatusPage';

export const modules = [
  { path: '/dashboard', label: 'Dashboard', component: Dashboard },

  { path: '/users', label: 'Users', component: UsersPage },

  { path: '/management/client-management', label: 'Client Management', component: ClientManagementPage },
  { path: '/management/debtor-management', label: 'Debtor Management', component: DebtorManagementPage },
  { path: '/management/file-management', label: 'File Management', component: FileManagementPage },
  { path: '/management/closed-files', label: 'Closed Files', component: ClosedFilesPage },
  { path: '/management/agent-management', label: 'Agent Management', component: AgentManagementPage },

  { path: '/case-management', label: 'Case Management', component: CaseManagementPage },
  {
    path: '/case-management/unassigned-files',
    label: 'Unassigned Files',
    component: UnassignedFilesPage,
  },
  { path: '/case-management/clients/:clientId/files', label: 'Client Files', component: ClientFilesPage, hidden: true },
  { path: '/case-management/clients/:clientId/files/:fileId/cases', label: 'File Cases', component: FileCasesPage, hidden: true },

  { path: '/communication/bulk-sms', label: 'Bulk SMS', component: BulkSmsPage },
  { path: '/communication/bulk-emails', label: 'Bulk Emails', component: BulkEmailsPage },
  { path: '/communication/discounts-and-waivers', label: 'Discounts and Waivers', component: DiscountsWaiversPage },

  { path: '/contact-upload', label: 'Contact Upload', component: ContactUploadPage },

  { path: '/payments/payments', label: 'Payments', component: PaymentsPage },
  { path: '/payments/commissions', label: 'Commissions', component: CommissionsPage },
  { path: '/payments/ptp', label: 'PTP (Promise to Pay)', component: PtpPage },
  { path: '/payments/non-confirmed-payments', label: 'Non-confirmed Payments', component: NonConfirmedPaymentsPage },

  { path: '/reports/debtor-summary', label: 'Debtor Summary', component: DebtorSummaryPage },
  { path: '/reports/payment-performance', label: 'Payment Performance', component: PaymentPerformancePage },
  { path: '/reports/collector-performance', label: 'Collector Performance', component: CollectorPerformancePage },
  { path: '/reports/portfolio-performance', label: 'Portfolio Performance', component: PortfolioPerformancePage },
  { path: '/reports/promise-to-pay', label: 'Promise To Pay', component: PromiseToPayPage },
  { path: '/reports/aging-report', label: 'Aging Report', component: AgingReportPage },
  { path: '/reports/dispute-management', label: 'Dispute Management', component: DisputeManagementPage },
  { path: '/reports/recovery-rate', label: 'Recovery Rate', component: RecoveryRatePage },
  { path: '/reports/goip-calls-report', label: 'GOIP Calls Report', component: GoipCallsReportPage },
  { path: '/reports/sms-report', label: 'SMS Report', component: SmsReportPage },
  { path: '/reports/debtor-notes', label: 'Debtor Notes', component: DebtorNotesPage },
  { path: '/reports/contact-attempt', label: 'Contact Attempt', component: ContactAttemptPage },

  { path: '/settings/commission-rates', label: 'Commission Rates', component: CommissionRatesPage },
  { path: '/settings/debt-type', label: 'Debt Type', component: DebtTypePage },
  { path: '/settings/debt-category', label: 'Debt Category', component: DebtCategoryPage },
  { path: '/settings/client-type', label: 'Client Type', component: ClientTypePage },
  { path: '/settings/debtor-upload-rules', label: 'Debtor Upload Rules', component: DebtorUploadRulesPage },
  { path: '/settings/currency', label: 'Currency', component: CurrencyPage },
  { path: '/settings/payment-channels', label: 'Payment Channels', component: PaymentChannelsPage },
  { path: '/settings/closure-reason', label: 'Closure Reason', component: ClosureReasonPage },
  { path: '/settings/template-variables', label: 'Template Variables', component: TemplateVariablesPage },
  { path: '/settings/case-priority', label: 'Case Priority', component: CasePriorityPage },
  { path: '/settings/agent-experience', label: 'Agent Experience', component: AgentExperiencePage },
  { path: '/settings/agent-expertise', label: 'Agent Expertise', component: AgentExpertisePage },
  { path: '/settings/client-agents', label: 'Client Agents', component: ClientAgentsPage },
  { path: '/settings/workload-parameters', label: 'Workload Parameters', component: WorkloadParametersPage },
  { path: '/settings/contactability', label: 'Contactability', component: ContactabilityPage },
  { path: '/settings/contact-type', label: 'Contact Type', component: ContactTypePage },
  { path: '/settings/contact-status', label: 'Contact Status', component: ContactStatusPage },
];
