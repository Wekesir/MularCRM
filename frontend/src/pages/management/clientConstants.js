export const BUSINESS_TYPES = [
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

export const EMPTY_CLIENT_FORM = {
  name: '',
  businessType: '',
  phone: '',
  email: '',
};
