/**
 * Celcom Africa Bulk SMS API constants (frontend mirror).
 * @see https://celcomafrica.com/developers-center
 */
export const CELCOM_AFRICA_SMS = {
  PROVIDER_ID: 'celcom_africa',
  PROVIDER_NAME: 'Celcom Africa',
  DOCS_URL: 'https://celcomafrica.com/developers-center',

  ENDPOINTS: {
    SEND_SMS: 'https://isms.celcomafrica.com/api/services/sendsms/',
    GET_DLR: 'https://isms.celcomafrica.com/api/services/getdlr/',
    GET_BALANCE: 'https://isms.celcomafrica.com/api/services/getbalance/',
  },

  PASS_TYPES: {
    PLAIN: 'plain',
    BM5: 'bm5',
  },

  DEFAULT_PASS_TYPE: 'plain',

  DEFAULT_SMS_CONFIG: {
    provider: 'celcom_africa',
    apiKey: '',
    partnerId: '',
    senderId: '',
    apiUrl: 'https://isms.celcomafrica.com/api/services/sendsms/',
    passType: 'plain',
  },
};

export const SMS_PROVIDER_OPTIONS = [
  { value: '', label: 'Not configured' },
  { value: CELCOM_AFRICA_SMS.PROVIDER_ID, label: CELCOM_AFRICA_SMS.PROVIDER_NAME },
];
