const { getSystemConfig } = require('./systemConfigService');
const { sendClientOnboardingEmail } = require('./emailService');
const { sendClientOnboardingSms } = require('./smsService');

const SMS_FAILURE_LABELS = {
  not_configured: 'SMS provider is not configured',
  no_phone: 'No phone number on file',
  invalid_phone: 'Invalid phone number',
  unsupported_provider: 'Unsupported SMS provider',
  provider_error: 'SMS provider rejected the message',
  error: 'SMS delivery error',
};

function normalizeSmsResult(result) {
  if (result?.sent) return { sent: true, messageId: result.messageId };
  const reason = result?.reason;
  const message = result?.detail || SMS_FAILURE_LABELS[reason] || 'SMS delivery failed';
  return { sent: false, message, reason };
}

// Sends both channels concurrently and independently — each call fetches its
// own config and handles its own errors, so a failure in one never delays or
// skips the other. Results are normalized to a consistent { sent, message }
// shape so callers can always surface an accurate reason on failure.
async function sendOnboardingNotifications(client, userId) {
  const config = await getSystemConfig({ mask: false }).catch(() => null);
  const platformName = config?.business?.name || 'OMNICRM';
  const supportPhone = config?.business?.phone || '';
  const supportEmail = config?.business?.email || '';

  const [emailResult, smsResult] = await Promise.allSettled([
    sendClientOnboardingEmail({ to: client.email, clientName: client.name, userId }),
    sendClientOnboardingSms({
      to: client.phone,
      clientName: client.name,
      platformName,
      supportPhone,
      supportEmail,
      userId,
    }),
  ]);

  const email = emailResult.status === 'fulfilled'
    ? { sent: true }
    : { sent: false, message: emailResult.reason?.message || 'Email delivery failed' };
  const sms = smsResult.status === 'fulfilled'
    ? normalizeSmsResult(smsResult.value)
    : { sent: false, message: smsResult.reason?.message || 'SMS delivery failed' };

  console.info(
    `[onboarding] client=${client.id} email=${email.sent ? 'sent' : `failed (${email.message})`} sms=${sms.sent ? 'sent' : `failed (${sms.message})`}`,
  );

  return { email, sms };
}

module.exports = {
  sendOnboardingNotifications,
  normalizeSmsResult,
};
