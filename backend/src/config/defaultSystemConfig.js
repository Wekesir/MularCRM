const { CELCOM_AFRICA_SMS } = require('./celcomAfricaSms');

const DEFAULT_SYSTEM_CONFIG = {
  business: {
    name: 'OMNICRM',
    address: '',
    phone: '',
    email: '',
    logo: '',
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
};

module.exports = { DEFAULT_SYSTEM_CONFIG };
