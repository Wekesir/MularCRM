// Single source of truth for the business types accepted during client
// onboarding. Mirrors the frontend list in
// frontend/src/pages/management/clientConstants.js so the Excel template
// dropdown and the row validator stay in sync with the Add Client form.

const BUSINESS_TYPES = [
  { value: 'bank', label: 'Bank' },
  { value: 'microfinance', label: 'Microfinance Institution (MFI)' },
  { value: 'sacco', label: 'SACCO' },
  { value: 'nbfc', label: 'Non-Bank Financial Institution (NBFI)' },
  { value: 'digital_lender', label: 'Digital / Online Lender' },
  { value: 'telco_credit', label: 'Telco / Mobile Credit Provider' },
  { value: 'asset_finance', label: 'Asset Finance Company' },
  { value: 'hire_purchase', label: 'Retail / Hire Purchase' },
  { value: 'cooperative', label: 'Cooperative Society' },
  { value: 'credit_union', label: 'Credit Union' },
  { value: 'other', label: 'Other' },
];

const LABEL_BY_VALUE = Object.fromEntries(
  BUSINESS_TYPES.map((t) => [t.value, t.label]),
);

const VALUE_BY_LABEL = Object.fromEntries(
  BUSINESS_TYPES.map((t) => [t.label.toLowerCase(), t.value]),
);

const VALID_VALUES = BUSINESS_TYPES.map((t) => t.value);

function resolveBusinessTypeValue(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Accept either the stored value (e.g. "microfinance") or the display label
  // (e.g. "Microfinance Institution (MFI)"), case-insensitively.
  if (VALID_VALUES.includes(trimmed.toLowerCase())) return trimmed.toLowerCase();
  const byLabel = VALUE_BY_LABEL[trimmed.toLowerCase()];
  if (byLabel) return byLabel;
  return null;
}

module.exports = {
  BUSINESS_TYPES,
  LABEL_BY_VALUE,
  VALID_VALUES,
  resolveBusinessTypeValue,
};
