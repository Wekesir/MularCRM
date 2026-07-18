const { CELCOM_AFRICA_SMS } = require('./celcomAfricaSms');

const DEFAULT_SYSTEM_CONFIG = {
  business: {
    name: 'OMNICRM',
    address: '',
    phone: '',
    email: '',
    logo: '',
    currency: {
      code: 'KES',
      symbol: 'KSh',
    },
  },
  theme: {
    color: '#3b82f6',
  },
  email: {
    provider: 'resend',
    fromAddress: '',
    resendApiKey: '',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassword: '',
    secure: false,
  },
  sms: {
    provider: '',
    apiKey: '',
    partnerId: '',
    senderId: '',
    apiUrl: CELCOM_AFRICA_SMS.ENDPOINTS.SEND_SMS,
    passType: CELCOM_AFRICA_SMS.DEFAULT_PASS_TYPE,
  },
  voice: {
    provider: '',
    username: '',
    apiKey: '',
    /** Platform AT virtual number used as callFrom for outbound bridges */
    voiceNumber: '',
    /** Public base URL for AT voice webhooks (e.g. https://api.example.com) */
    callbackBaseUrl: '',
    recordCalls: true,
  },
  auth: {
    otpOnLogin: true,
  },
  notifications: {
    accountDeletedEmailTemplateId: null,
    accountDeletedSmsTemplateId: null,
    caseAssignmentEmailTemplateId: null,
    caseAssignmentSmsTemplateId: null,
  },
  commissions: {
    defaultRate: 0.1,
    defaultCurrencyId: null,
  },
  backup: {
    enabled: false,
    frequency: 'daily',
    googleDrive: {
      folderId: '',
      serviceAccountEmail: '',
      serviceAccountKey: '',
    },
  },
  integrations: {
    livePayments: {
      enabled: false,
      frequency: 'daily',
      clients: [],
    },
  },
};

module.exports = { DEFAULT_SYSTEM_CONFIG };
