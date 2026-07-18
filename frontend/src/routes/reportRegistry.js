/** Live sidebar reports under /reports/* (used by Report Access password admin). */
export const reports = [
  { slug: 'debtor-summary', label: 'Debtor Summary' },
  { slug: 'payment-performance', label: 'Payment Performance' },
  { slug: 'collector-performance', label: 'Collector Performance' },
  { slug: 'portfolio-performance', label: 'Portfolio Performance' },
  { slug: 'promise-to-pay', label: 'Promise To Pay' },
  { slug: 'aging-report', label: 'Aging Report' },
  { slug: 'dispute-management', label: 'Dispute Management' },
  { slug: 'recovery-rate', label: 'Recovery Rate' },
  { slug: 'goip-calls-report', label: 'GOIP Calls Report' },
  { slug: 'sms-report', label: 'SMS Report' },
  { slug: 'debtor-notes', label: 'Debtor Notes' },
  { slug: 'contact-attempt', label: 'Contact Attempt' },
];

export const DEFAULT_REPORT_SLUG = reports[0].slug;

export function getReportBySlug(slug) {
  return reports.find((report) => report.slug === slug) ?? null;
}

export function getReportPath(slug) {
  return `/reports/${slug}`;
}

export function slugToPermissionKey(slug) {
  return slug.replace(/-/g, '_');
}
