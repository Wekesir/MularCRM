/**
 * Celcom Africa Bulk SMS API constants.
 * @see https://celcomafrica.com/developers-center
 */
const CELCOM_AFRICA_SMS = {
  PROVIDER_ID: 'celcom_africa',
  PROVIDER_NAME: 'Celcom Africa',
  DOCS_URL: 'https://celcomafrica.com/developers-center',

  ENDPOINTS: {
    SEND_SMS: 'https://isms.celcomafrica.com/api/services/sendsms/',
    GET_DLR: 'https://isms.celcomafrica.com/api/services/getdlr/',
    GET_BALANCE: 'https://isms.celcomafrica.com/api/services/getbalance/',
  },

  /** JSON body field names (POST) */
  REQUEST_FIELDS: { 
    API_KEY: 'apikey',
    PARTNER_ID: 'partnerID',
    MOBILE: 'mobile',
    MESSAGE: 'message',
    SHORTCODE: 'shortcode',
    PASS_TYPE: 'pass_type',
    TIME_TO_SEND: 'timeToSend',
    MESSAGE_ID: 'messageID',
  },

  PASS_TYPES: {
    PLAIN: 'plain',
    BM5: 'bm5',
  },

  DEFAULT_PASS_TYPE: 'plain',

  /** Stored in system_config.config.sms */
  CONFIG_KEYS: {
    PROVIDER: 'provider',
    API_KEY: 'apiKey',
    PARTNER_ID: 'partnerId',
    SENDER_ID: 'senderId',
    API_URL: 'apiUrl',
    PASS_TYPE: 'passType',
  },

  RESPONSE_CODES: {
    200: 'Successful request',
    1001: 'Invalid sender id',
    1002: 'Network not allowed',
    1003: 'Invalid mobile number',
    1004: 'Low bulk credits',
    1005: 'Failed — system error',
    1006: 'Invalid credentials',
    1007: 'Failed — system error',
    1008: 'No delivery report',
    1009: 'Unsupported data type',
    1010: 'Unsupported request type',
    4090: 'Internal error — retry after 5 minutes',
    4091: 'No partner ID is set',
    4092: 'No API key provided',
    4093: 'Details not found',
  },
};

module.exports = { CELCOM_AFRICA_SMS };
