/** Snapshot reports hide the main date range. */
export const SNAPSHOT_SLUGS = new Set([
  'debtor-summary',
  'aging-report',
  'portfolio-performance',
  'dispute-management',
]);

/** Shared advanced debtor-book filters (supervisors / company). */
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

/** Agent-facing book filters — no team/center/assignment controls. */
export const AGENT_DEBTOR_BOOK_FIELDS = [
  'fileId',
  'bucket',
  'contactStatusId',
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
  'aging-report': [...DEBTOR_BOOK_FIELDS, 'detail'],
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

/** Slimmer advanced filters when the viewer is an Agent (self-scoped reports). */
export const AGENT_REPORT_ADVANCED_FIELDS = {
  'debtor-summary': AGENT_DEBTOR_BOOK_FIELDS,
  'aging-report': [...AGENT_DEBTOR_BOOK_FIELDS, 'detail'],
  'recovery-rate': AGENT_DEBTOR_BOOK_FIELDS,
  'payment-performance': ['source', 'status', 'confirmed', 'amountMin', 'amountMax'],
  'promise-to-pay': ['status', 'channel', 'remindersDue', 'amountMin', 'amountMax'],
  'collector-performance': [],
  'goip-calls-report': ['direction', 'status', 'provider', 'hasRecording', 'amountMin', 'amountMax'],
  'sms-report': ['status', 'category', 'provider'],
  'debtor-notes': ['fileId', 'channel', 'contactStatusId'],
  'contact-attempt': ['fileId', 'channel', 'contactStatusId', 'ptp', 'hasNotes'],
};

export const ALL_ADVANCED_KEYS = [
  ...new Set([
    ...DEBTOR_BOOK_FIELDS,
    'detail',
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

export function getAdvancedFields(slug, { isAgent = false } = {}) {
  if (isAgent) {
    return AGENT_REPORT_ADVANCED_FIELDS[slug] || AGENT_DEBTOR_BOOK_FIELDS;
  }
  return REPORT_ADVANCED_FIELDS[slug] || DEBTOR_BOOK_FIELDS;
}

export function showDateRangeFor(slug) {
  return !SNAPSHOT_SLUGS.has(slug);
}

export function showClientFor(slug, { isAgent = false } = {}) {
  if (isAgent && slug === 'collector-performance') return false;
  return slug !== 'sms-report' && slug !== 'collector-performance';
}

export function showAgentFor(slug, { isAgent = false } = {}) {
  if (isAgent) return false;
  return slug !== 'collector-performance';
}
