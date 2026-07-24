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
    /**
     * System-wide active dialer for all outbound portfolio calls.
     * yeastar | africastalking | '' (none). No auto-failover — admin switches manually.
     */
    activeProvider: '',
    /** @deprecated Prefer activeProvider; kept for older saved configs */
    provider: '',
    username: '',
    apiKey: '',
    /** Platform AT virtual number used as callFrom for outbound bridges */
    voiceNumber: '',
    /** Public base URL for AT voice webhooks (e.g. https://api.example.com) */
    callbackBaseUrl: '',
    recordCalls: true,
    /** Public app URL for Yeastar call-popup deep links */
    appBaseUrl: '',
    yeastar: {
      enabled: false,
      baseUrl: '',
      apiPath: 'openapi/v1.0',
      clientId: '',
      clientSecret: '',
      /** Bearer key Yeastar PBX uses when calling OMNICRM Custom CRM APIs */
      integrationApiKey: '',
    },
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
      ownerEmail: '',
      serviceAccountKey: '',
      // OAuth app credentials (Web client) used to auto-accept ownership as the Gmail owner.
      oauthClientId: '',
      oauthClientSecret: '',
      oauthRefreshToken: '',
      oauthConnectedEmail: '',
    },
    // Persisted across restarts so "Complete upload" can stream into the empty stub.
    pendingUpload: null,
  },
  integrations: {
    livePayments: {
      enabled: false,
      frequency: 'daily',
      clients: [],
    },
  },
  fieldEscalation: {
    enabled: true,
    refusalStatusCodes: ['RTP', 'N-C', 'HU'],
    minRefusalContacts: 3,
    lookbackDays: 30,
    waitPeriodDays: 14,
    requirePaymentGap: true,
  },
};

module.exports = { DEFAULT_SYSTEM_CONFIG };
