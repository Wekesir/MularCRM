const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const { getSystemConfig } = require('./systemConfigService');
const { recordEmailEvent } = require('./auditService');

// Hostinger's standard outgoing mail settings. Only host/port/secure are fixed;
// the user supplies the account username + password so they can switch accounts.
const HOSTINGER_SMTP_DEFAULTS = {
  smtpHost: 'smtp.hostinger.com',
  smtpPort: 465,
  secure: true,
};

// Providers that ultimately deliver over SMTP via nodemailer.
const SMTP_PROVIDERS = new Set(['smtp', 'hostinger']);

function resolveEmailSettings(config) {
  const email = { ...(config.email || {}) };

  if (!email.resendApiKey && process.env.RESEND_API_KEY) {
    email.resendApiKey = process.env.RESEND_API_KEY;
  }
  if (!email.fromAddress && process.env.RESEND_FROM) {
    email.fromAddress = process.env.RESEND_FROM;
  }
  if (!email.provider && email.resendApiKey) {
    email.provider = 'resend';
  }

  // Apply Hostinger defaults for any field the user has not explicitly overridden.
  if (email.provider === 'hostinger') {
    email.smtpHost = email.smtpHost || HOSTINGER_SMTP_DEFAULTS.smtpHost;
    email.smtpPort = email.smtpPort || HOSTINGER_SMTP_DEFAULTS.smtpPort;
    if (email.secure === undefined || email.secure === null) {
      email.secure = HOSTINGER_SMTP_DEFAULTS.secure;
    }
  }

  return email;
}

function getFromAddress(config) {
  const email = resolveEmailSettings(config);
  const address = email.fromAddress || config.business?.email || 'noreply@omnicrm.com';

  // If a display name is already embedded (e.g. "Name <addr>"), use it as-is.
  if (/<[^>]+>/.test(address)) return address;

  // Otherwise show the business name as the sender's display name.
  const displayName = (config.business?.name || '').trim();
  if (displayName) {
    const safeName = displayName.replace(/"/g, '\\"');
    return `"${safeName}" <${address}>`;
  }

  return address;
}

function isEmailConfigured(config) {
  const email = resolveEmailSettings(config);
  if (email.provider === 'resend') {
    return Boolean(email.resendApiKey && getFromAddress(config));
  }
  if (SMTP_PROVIDERS.has(email.provider)) {
    return Boolean(email.smtpHost && email.smtpUser && email.smtpPassword && getFromAddress(config));
  }
  return false;
}

async function createTransport(config) {
  const email = resolveEmailSettings(config);

  if (email.provider === 'resend') {
    if (!email.resendApiKey) {
      throw new Error('Resend API key is not configured');
    }
    return { type: 'resend', client: new Resend(email.resendApiKey) };
  }

  if (SMTP_PROVIDERS.has(email.provider)) {
    if (!email.smtpHost) {
      throw new Error('SMTP host is not configured');
    }
    const transport = nodemailer.createTransport({
      host: email.smtpHost,
      port: Number(email.smtpPort) || 587,
      secure: Boolean(email.secure),
      auth: {
        user: email.smtpUser,
        pass: email.smtpPassword,
      },
    });
    return { type: 'smtp', client: transport };
  }

  throw new Error('Email provider is not configured');
}

async function sendEmail({ to, subject, html, text, category = 'general', userId = null, metadata = null }) {
  const config = await getSystemConfig({ mask: false });

  if (!isEmailConfigured(config)) {
    await recordEmailEvent({
      userId,
      recipient: to,
      subject,
      body: html || text || null,
      category,
      status: 'failed',
      errorMessage: 'Email delivery is not configured',
      metadata,
    });
    throw new Error('Email delivery is not configured. Contact your administrator.');
  }

  const from = getFromAddress(config);
  const provider = resolveEmailSettings(config).provider || null;
  const body = html || text || null;

  try {
    const transport = await createTransport(config);
    let providerMessageId = null;

    if (transport.type === 'resend') {
      const result = await transport.client.emails.send({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      });
      if (result.error) {
        throw new Error(result.error.message || 'Failed to send email via Resend');
      }
      providerMessageId = result.data?.id || result.id || null;
    } else {
      const info = await transport.client.sendMail({
        from,
        to,
        subject,
        html,
        text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      });
      providerMessageId = info?.messageId || null;
    }

    await recordEmailEvent({
      userId,
      recipient: to,
      sender: from,
      subject,
      body,
      category,
      provider,
      status: 'sent',
      providerMessageId,
      metadata,
    });

    return { providerMessageId };
  } catch (error) {
    await recordEmailEvent({
      userId,
      recipient: to,
      sender: from,
      subject,
      body,
      category,
      provider,
      status: 'failed',
      errorMessage: error.message,
      metadata,
    });
    throw error;
  }
}

function buildOtpEmailHtml({ businessName, code, expiresMinutes }) {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">Your ${businessName} login code</h2>
      <p>Use this one-time code to complete your sign-in:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.25em; color: #2563eb;">${code}</p>
      <p style="color: #666;">This code expires in ${expiresMinutes} minutes.</p>
      <p style="color: #666; font-size: 13px;">If you did not attempt to sign in, you can ignore this email.</p>
    </div>
  `;
}

function buildResetEmailHtml({ businessName, resetUrl }) {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">Reset your ${businessName} password</h2>
      <p>We received a request to reset your password. Click the link below to choose a new password:</p>
      <p><a href="${resetUrl}" style="color: #2563eb;">Reset password</a></p>
      <p style="color: #666; font-size: 13px;">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
    </div>
  `;
}

function buildWelcomeEmailHtml({ businessName, name, email, temporaryPassword, loginUrl }) {
  const greetingName = name ? name.split(' ')[0] : 'there';
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 520px; margin: 0 auto; color: #111;">
      <h2 style="color: #111;">Welcome to ${businessName}, ${greetingName}!</h2>
      <p>An account has been created for you on the ${businessName} portal. Use the temporary credentials below to sign in.</p>
      <div style="background: #f5f6f8; border: 1px solid #e3e6ea; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
        <p style="margin: 0 0 8px; font-size: 13px; color: #666;">Email</p>
        <p style="margin: 0 0 16px; font-size: 15px; font-weight: 600;">${email}</p>
        <p style="margin: 0 0 8px; font-size: 13px; color: #666;">Temporary password</p>
        <p style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.05em; font-family: monospace; color: #2563eb;">${temporaryPassword}</p>
      </div>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${loginUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600;">Log in to the portal</a>
      </p>
      <p style="color: #b45309; font-size: 14px; background: #fef3c7; border-radius: 8px; padding: 12px 16px;">
        For your security, you will be asked to set a new password the first time you log in. Please do not share these credentials with anyone.
      </p>
      <p style="color: #666; font-size: 13px;">If you were not expecting this email, please contact your administrator.</p>
    </div>
  `;
}

async function sendWelcomeEmail({ to, name, temporaryPassword, userId = null }) {
  const config = await getSystemConfig({ mask: false });
  const businessName = config.business?.name || 'OMNICRM';
  const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const loginUrl = `${baseUrl}/login`;

  return sendEmail({
    to,
    subject: `Your ${businessName} account is ready`,
    html: buildWelcomeEmailHtml({
      businessName,
      name,
      email: to,
      temporaryPassword,
      loginUrl,
    }),
    text:
      `Welcome to ${businessName}!\n\n` +
      `An account has been created for you.\n` +
      `Email: ${to}\n` +
      `Temporary password: ${temporaryPassword}\n\n` +
      `Log in at ${loginUrl} and set a new password when prompted.`,
    category: 'welcome',
    userId,
  });
}

async function sendOtpEmail({ to, code, expiresMinutes = 10, userId = null }) {
  const config = await getSystemConfig({ mask: false });
  const businessName = config.business?.name || 'OMNICRM';
  return sendEmail({
    to,
    subject: `Your ${businessName} login code`,
    html: buildOtpEmailHtml({ businessName, code, expiresMinutes }),
    text: `Your ${businessName} login code is ${code}. It expires in ${expiresMinutes} minutes.`,
    category: 'otp',
    userId,
  });
}

async function sendPasswordResetEmail({ to, token, userId = null }) {
  const config = await getSystemConfig({ mask: false });
  const businessName = config.business?.name || 'OMNICRM';
  const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: `Reset your ${businessName} password`,
    html: buildResetEmailHtml({ businessName, resetUrl }),
    text: `Reset your password: ${resetUrl}`,
    category: 'password_reset',
    userId,
  });
}

function buildClientOnboardingEmailHtml({ platformName, clientName, supportEmail, supportPhone, themeColor }) {
  const accent = themeColor || '#3b82f6';

  // Derive a slightly darker shade for borders/dividers from the accent.
  const accentLight = `${accent}1a`; // 10% opacity for backgrounds

  const name = clientName || 'there';
  const year = new Date().getFullYear();
  const supportBlock = supportPhone
    ? `
      <tr>
        <td style="padding:0 0 0 0;border-bottom:1px solid #e2e8f0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:16px 24px;width:36%;vertical-align:top;">
                <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Phone</p>
              </td>
              <td style="padding:16px 24px 16px 0;vertical-align:top;">
                <p style="margin:0;font-size:14px;color:#1e293b;font-weight:500;">${supportPhone}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Welcome to ${platformName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;-webkit-font-smoothing:antialiased;">

<!-- Outer wrapper -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
  style="background-color:#f0f4f8;padding:40px 16px;">
  <tr>
    <td align="center">

      <!-- Card -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="580"
        style="max-width:580px;width:100%;background:#ffffff;border-radius:4px;
               border:1px solid #dde3ec;">

        <!-- Top accent bar -->
        <tr>
          <td height="4" style="background-color:${accent};font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Header -->
        <tr>
          <td style="padding:36px 40px 28px;">
            <p style="margin:0 0 28px;font-size:13px;font-weight:700;letter-spacing:0.12em;
                      text-transform:uppercase;color:${accent};">${platformName}</p>
            <h1 style="margin:0;font-size:26px;font-weight:700;line-height:1.25;
                       color:#0f172a;font-family:Georgia,'Times New Roman',serif;">
              Your onboarding is complete.
            </h1>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr><td height="1" style="background:#e2e8f0;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- Body copy -->
        <tr>
          <td style="padding:28px 40px 0;">
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
              Dear <strong style="color:#0f172a;">${name}</strong>,
            </p>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
              We are pleased to confirm that your organisation has been successfully onboarded
              to <strong style="color:#0f172a;">${platformName}</strong>. Your account is now
              fully active and our collections team has been briefed to begin managing your
              portfolio.
            </p>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
              Going forward, you will receive statements, payment reminders and case updates
              through the communication channels you have authorised. Our team will reach out
              promptly whenever action is required on your end.
            </p>
            <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">
              Should you have any questions or require assistance at any point, our support
              team is available via the contact details below.
            </p>
          </td>
        </tr>

        <!-- Support section header -->
        <tr>
          <td style="padding:32px 40px 0;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.1em;
                      text-transform:uppercase;color:#94a3b8;">Customer Support</p>
          </td>
        </tr>

        <!-- Support contact table -->
        <tr>
          <td style="padding:0 40px 36px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
              style="border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;">

              <tr>
                <td style="border-bottom:1px solid #e2e8f0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:16px 24px;width:36%;vertical-align:top;
                                 background:${accentLight};">
                        <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.08em;
                                  text-transform:uppercase;color:#64748b;">Email</p>
                      </td>
                      <td style="padding:16px 24px 16px 0;vertical-align:top;">
                        <a href="mailto:${supportEmail}"
                           style="margin:0;font-size:14px;color:${accent};font-weight:500;
                                  text-decoration:none;">${supportEmail}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              ${supportBlock}

            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr><td height="1" style="background:#e2e8f0;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px 32px;">
            <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#94a3b8;">
              This is an automated notification sent by <strong>${platformName}</strong>.
              Please do not reply directly to this email.
            </p>
            <p style="margin:0;font-size:12px;color:#cbd5e1;">
              &copy; ${year} ${platformName}. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
      <!-- /Card -->

    </td>
  </tr>
</table>
<!-- /Outer wrapper -->

</body>
</html>`;
}

async function sendClientOnboardingEmail({ to, clientName, userId = null }) {
  const config = await getSystemConfig({ mask: false });
  const platformName = config.business?.name || 'OMNICRM';
  const supportEmail = config.business?.email || 'support@omnicrm.com';
  const supportPhone = config.business?.phone || '';
  const themeColor = config.theme?.color || '#3b82f6';

  const subject = `Welcome to ${platformName}, ${clientName || 'there'} — your onboarding is complete`;
  const text =
    `Hi ${clientName || 'there'},\n\n` +
    `You have successfully been onboarded to ${platformName}. Your account is now active.\n\n` +
    `Customer Support\n` +
    `Email: ${supportEmail}\n` +
    `Phone: ${supportPhone || '—'}\n\n` +
    `This is an automated message from ${platformName}.`;

  return sendEmail({
    to,
    subject,
    html: buildClientOnboardingEmailHtml({ platformName, clientName, supportEmail, supportPhone, themeColor }),
    text,
    category: 'client_onboarding',
    userId,
  });
}

module.exports = {
  sendEmail,
  sendOtpEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendClientOnboardingEmail,
  isEmailConfigured,
};
