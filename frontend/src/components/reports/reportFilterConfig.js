/** Snapshot reports hide the main date range. */
export const SNAPSHOT_SLUGS = new Set([
  'debtor-summary',
  'aging-report',
  'portfolio-performance',
  'dispute-management',
]);

/** Shared advanced debtor-book filters. */
export const DEBTOR_BOOK_FIELDS = [
  'callCenterId',
  'fileId',
  'bucket',
  'contactStatusId',
  'assignmentStatus',
  'caseClosed',
  'ptp',
  'discounted',
  'dpdMin',
  'dpdMax',
  'balanceMin',
  'balanceMax',
  'lastContactedFrom',
  'lastContactedTo',
  'nextActionFrom',
  'nextActionTo',
];

/**
 * Per-report advanced filter field lists.
 * Core fields (client, agent, search, dates) are always shown where applicable.
 */
export const REPORT_ADVANCED_FIELDS = {
  'debtor-summary': DEBTOR_BOOK_FIELDS,
  'aging-report': DEBTOR_BOOK_FIELDS,
  'portfolio-performance': DEBTOR_BOOK_FIELDS,
  'recovery-rate': DEBTOR_BOOK_FIELDS,
  'dispute-management': [
    'callCenterId',
    'fileId',
    'disputeCode',
    'caseClosed',
    'balanceMin',
    'balanceMax',
    'lastContactedFrom',
    'lastContactedTo',
    'nextActionFrom',
    'nextActionTo',
  ],
  'payment-performance': [
    'callCenterId',
    'source',
    'status',
    'confirmed',
    'amountMin',
    'amountMax',
  ],
  'promise-to-pay': [
    'callCenterId',
    'status',
    'channel',
    'remindersDue',
    'amountMin',
    'amountMax',
  ],
  'collector-performance': ['callCenterId'],
  'goip-calls-report': [
    'callCenterId',
    'direction',
    'status',
    'provider',
    'hasRecording',
    'amountMin',
    'amountMax',
  ],
  'sms-report': ['callCenterId', 'status', 'category', 'provider'],
  'debtor-notes': ['callCenterId', 'fileId', 'channel', 'contactStatusId'],
  'contact-attempt': [
    'callCenterId',
    'fileId',
    'channel',
    'contactStatusId',
    'ptp',
    'hasNotes',
  ],
};

export const ALL_ADVANCED_KEYS = [
  ...new Set([
    ...DEBTOR_BOOK_FIELDS,
    'source',
    'status',
    'confirmed',
    'amountMin',
    'amountMax',
    'channel',
    'remindersDue',
    'direction',
    'provider',
    'hasRecording',
    'category',
    'disputeCode',
    'hasNotes',
  ]),
];

export function getAdvancedFields(slug) {
  return REPORT_ADVANCED_FIELDS[slug] || DEBTOR_BOOK_FIELDS;
}

export function showDateRangeFor(slug) {
  return !SNAPSHOT_SLUGS.has(slug);
}

export function showClientFor(slug) {
  return slug !== 'sms-report' && slug !== 'collector-performance';
}

export function showAgentFor(slug) {
  return slug !== 'collector-performance';
}
