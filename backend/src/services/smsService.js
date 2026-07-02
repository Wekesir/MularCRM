const { getSystemConfig } = require('./systemConfigService');
const { CELCOM_AFRICA_SMS } = require('../config/celcomAfricaSms');
const { recordSmsEvent } = require('./auditService');

function normalizeMobileNumber(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.startsWith('7')) return `254${digits}`;

  return digits;
}

function getResponseCode(item) {
  const raw =
    item['response-code'] ??
    item['respose-code'] ??
    item.responseCode ??
    item.code;
  const code = Number(raw);
  return Number.isFinite(code) ? code : null;
}

function getResponseDescription(item) {
  return item['response-description'] ?? item.description ?? '';
}

function parseCelcomResponse(payload) {
  const responses = payload?.responses;
  if (!Array.isArray(responses) || responses.length === 0) {
    return { ok: false, code: null, description: 'Empty provider response' };
  }

  const first = responses[0];
  const code = getResponseCode(first);
  const description = getResponseDescription(first);

  return {
    ok: code === 200,
    code,
    description,
    messageId: first.messageid ?? first.messageId ?? null,
  };
}

async function sendCelcomSms(sms, { to, message }) {
  const { REQUEST_FIELDS, ENDPOINTS } = CELCOM_AFRICA_SMS;
  const mobile = normalizeMobileNumber(to);

  if (!sms.apiKey || !sms.partnerId || !sms.senderId) {
    return { sent: false, reason: 'not_configured' };
  }

  if (!mobile) {
    return { sent: false, reason: 'invalid_phone' };
  }

  const url = sms.apiUrl || ENDPOINTS.SEND_SMS;
  const body = {
    [REQUEST_FIELDS.PARTNER_ID]: sms.partnerId,
    [REQUEST_FIELDS.API_KEY]: sms.apiKey,
    [REQUEST_FIELDS.MOBILE]: mobile,
    [REQUEST_FIELDS.MESSAGE]: message,
    [REQUEST_FIELDS.SHORTCODE]: sms.senderId,
    [REQUEST_FIELDS.PASS_TYPE]: sms.passType || CELCOM_AFRICA_SMS.DEFAULT_PASS_TYPE,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    console.warn('[smsService] Celcom Africa invalid JSON:', raw);
    return { sent: false, reason: 'provider_error' };
  }

  const parsed = parseCelcomResponse(payload);
  if (!parsed.ok) {
    const codeLabel = CELCOM_AFRICA_SMS.RESPONSE_CODES[parsed.code] || parsed.description;
    console.warn('[smsService] Celcom Africa send failed:', parsed.code, codeLabel);
    return { sent: false, reason: 'provider_error', code: parsed.code, detail: codeLabel };
  }

  return { sent: true, messageId: parsed.messageId };
}

function extractBalanceFromPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Invalid balance response' };
  }

  const responseItem = Array.isArray(payload.responses) ? payload.responses[0] : payload;
  const code = getResponseCode(responseItem);
  const description = getResponseDescription(responseItem);

  const balanceRaw =
    responseItem.balance ??
    responseItem.credit ??
    responseItem.credits ??
    responseItem.amount ??
    payload.balance ??
    payload.credit ??
    payload.credits ??
    null;

  if (code && code !== 200) {
    const label = CELCOM_AFRICA_SMS.RESPONSE_CODES[code] || description || 'Balance request failed';
    return { ok: false, code, error: label };
  }

  if (balanceRaw === null || balanceRaw === undefined || balanceRaw === '') {
    return {
      ok: false,
      error: description || 'Balance not available in provider response',
      raw: payload,
    };
  }

  const balance = Number(String(balanceRaw).replace(/,/g, ''));
  return {
    ok: true,
    balance: Number.isFinite(balance) ? balance : balanceRaw,
    currency: payload.currency || 'SMS credits',
    description: description || null,
  };
}

async function getCelcomBalance(sms) {
  const { REQUEST_FIELDS, ENDPOINTS } = CELCOM_AFRICA_SMS;

  if (!sms.apiKey || !sms.partnerId) {
    return { ok: false, error: 'Partner ID and API key are required' };
  }

  const response = await fetch(ENDPOINTS.GET_BALANCE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      [REQUEST_FIELDS.PARTNER_ID]: sms.partnerId,
      [REQUEST_FIELDS.API_KEY]: sms.apiKey,
    }),
  });

  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid balance response from provider' };
  }

  return extractBalanceFromPayload(payload);
}

async function getSmsBalance() {
  const config = await getSystemConfig({ mask: false });
  const sms = config.sms || {};

  if (!sms.provider) {
    return { ok: false, error: 'SMS provider is not configured' };
  }

  if (sms.provider !== CELCOM_AFRICA_SMS.PROVIDER_ID) {
    return { ok: false, error: 'Balance check is only supported for Celcom Africa' };
  }

  try {
    return await getCelcomBalance(sms);
  } catch (error) {
    return { ok: false, error: error.message || 'Failed to fetch SMS balance' };
  }
}

async function sendTestSms({ to, message }) {
  const config = await getSystemConfig({ mask: false });
  const businessName = config.business?.name || 'OMNICRM';
  const text =
    message?.trim() ||
    `This is a test SMS from ${businessName}. If you received this, your SMS integration is working.`;

  const result = await sendSms({ to, message: text, category: 'test' });
  if (!result.sent) {
    const error = new Error(
      result.detail ||
        {
          not_configured: 'SMS is not fully configured. Save Partner ID, API key, and Sender ID.',
          invalid_phone: 'Enter a valid mobile number.',
          unsupported_provider: 'Unsupported SMS provider.',
          provider_error: 'Provider rejected the message.',
          no_phone: 'Mobile number is required.',
        }[result.reason] ||
        'Failed to send test SMS'
    );
    error.status = 400;
    error.code = result.code;
    throw error;
  }

  return {
    message: 'Test SMS sent successfully',
    messageId: result.messageId,
    mobile: normalizeMobileNumber(to),
  };
}

const SMS_REASON_LABELS = {
  not_configured: 'SMS provider is not configured',
  no_phone: 'No mobile number provided',
  invalid_phone: 'Invalid mobile number',
  unsupported_provider: 'Unsupported SMS provider',
  provider_error: 'Provider rejected the message',
  error: 'SMS delivery error',
};

async function logSmsAttempt({ sms, to, message, category, userId, result }) {
  // Pure skips that never reached a provider are not logged as failures.
  if (result.reason === 'not_configured' || result.reason === 'no_phone') {
    return;
  }

  await recordSmsEvent({
    userId,
    recipient: normalizeMobileNumber(to) || String(to || ''),
    senderId: sms?.senderId || null,
    message,
    category,
    provider: sms?.provider || null,
    status: result.sent ? 'sent' : 'failed',
    providerMessageId: result.messageId || null,
    providerCode: result.code ?? null,
    errorMessage: result.sent ? null : result.detail || SMS_REASON_LABELS[result.reason] || 'Failed to send SMS',
  });
}

async function sendSms({ to, message, category = 'general', userId = null }) {
  const config = await getSystemConfig({ mask: false });
  const sms = config.sms || {};

  if (!sms.provider) {
    console.info('[smsService] SMS not configured — skipping delivery');
    return { sent: false, reason: 'not_configured' };
  }

  if (!to) {
    console.info('[smsService] No phone number — skipping delivery');
    return { sent: false, reason: 'no_phone' };
  }

  let result;
  try {
    if (sms.provider === CELCOM_AFRICA_SMS.PROVIDER_ID) {
      result = await sendCelcomSms(sms, { to, message });
    } else {
      console.warn('[smsService] Unsupported SMS provider:', sms.provider);
      result = { sent: false, reason: 'unsupported_provider' };
    }
  } catch (error) {
    console.warn('[smsService] SMS delivery error:', error.message);
    result = { sent: false, reason: 'error', detail: error.message };
  }

  await logSmsAttempt({ sms, to, message, category, userId, result });
  return result;
}

async function sendOtpSms({ to, code, businessName = 'OMNICRM', userId = null }) {
  return sendSms({
    to,
    message: `Your ${businessName} login code is ${code}. It expires in 10 minutes.`,
    category: 'otp',
    userId,
  });
}

async function sendWelcomeSms({ to, businessName = 'OMNICRM', userId = null }) {
  return sendSms({
    to,
    message: `Welcome to ${businessName}. We have sent an email with your login details and temporary password. Please check your inbox to access the portal.`,
    category: 'welcome',
    userId,
  });
}

async function sendClientOnboardingSms({ to, clientName, platformName = 'OMNICRM', supportPhone = '', supportEmail = '', userId = null }) {
  const supportLine = supportPhone ? ` Call us on ${supportPhone}.` : (supportEmail ? ` Email ${supportEmail}.` : '');
  const message =
    `Hi ${clientName || 'there'}, welcome to ${platformName}! ` +
    `Your onboarding is complete and your account is active.${supportLine} ` +
    `We're glad to have you on board.`;
  return sendSms({ to, message, category: 'client_onboarding', userId });
}

module.exports = {
  sendSms,
  sendOtpSms,
  sendWelcomeSms,
  sendClientOnboardingSms,
  sendTestSms,
  getSmsBalance,
  normalizeMobileNumber,
};
