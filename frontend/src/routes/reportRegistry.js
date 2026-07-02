export const reports = [
  { slug: 'customer-account-statement', label: 'Customer Account Statement' },
  { slug: 'loans-due-report', label: 'Loans Due Report' },
  { slug: 'mpesa-repayments-report', label: 'MPesa Repayments Report' },
  { slug: 'loan-officer-performance', label: 'Loan Officer Performance' },
  { slug: 'non-performing-loans', label: 'Non-performing loans' },
  { slug: 'outstanding-loan-balances-eom', label: 'Outstanding Loan Balances as at EOM' },
  { slug: 'loans-pending-disbursement', label: 'Loans Pending Disbursement' },
  { slug: 'loans-listing', label: 'Loans Listing' },
  { slug: 'outstanding-loan-balances-report', label: 'Outstanding Loan Balances Report' },
  { slug: 'suspense-payments-report', label: 'Suspense Payments Report' },
  { slug: 'trace-mpesa-transaction', label: 'Trace Mpesa Transaction' },
  { slug: 'inactive-customers', label: 'Inactive Customers' },
  { slug: 'loan-arrears-report', label: 'Loan Arrears Report' },
  { slug: 'loans-due-hq-report', label: 'Loans Due HQ Report' },
  { slug: 'duplicate-loans-report', label: 'Duplicate Loans Report' },
  { slug: 'hq-disbursed-loans', label: 'HQ Disbursed Loans' },
  { slug: 'hq-customer-listing', label: 'HQ Customer Listing' },
];

export const DEFAULT_REPORT_SLUG = reports[0].slug;

export function getReportBySlug(slug) {
  return reports.find((report) => report.slug === slug) ?? null;
}

export function getReportPath(slug) {
  return `/reporting-analytics/${slug}`;
}

export function slugToPermissionKey(slug) {
  return slug.replace(/-/g, '_');
}
