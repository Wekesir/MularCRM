const { sendEmail } = require('./emailService');
const { sendSms } = require('./smsService');
const { getEmailTemplateById, getSmsTemplateById } = require('./templateService');
const { renderTemplate } = require('./templateVariableService');
const { getSystemConfig } = require('./systemConfigService');
const { createNotification } = require('./notificationService');
const { recordActivityEvent } = require('./activityService');

// Best-effort: notify an agent (email + SMS + in-app notification) about an
// assignment action performed on a case file. Never throws — failures are
// swallowed so the core assignment transaction stays intact.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function actionLabel(action) {
  switch (action) {
    case 'assigned':
      return { verb: 'assigned to you', title: 'New case file assigned' };
    case 'reallocated':
      return { verb: 'reallocated to you', title: 'Case file reallocated to you' };
    case 'unallocated':
      return { verb: 'unallocated from you', title: 'Case file unallocated' };
    default:
      return { verb: 'updated', title: 'Case file assignment updated' };
  }
}

// Minimal HTML → plain-text fallback (used when a template has no plain text).
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildRenderValues({ agent, action, file, caseCount, performedBy, businessName }) {
  const { verb } = actionLabel(action);
  const fileName = file?.file_name || `File #${file?.id ?? ''}`;
  const firstName = agent.name ? agent.name.split(' ')[0] : 'there';
  return {
    name: agent.name,
    first_name: firstName,
    agent_name: agent.name,
    business_name: businessName,
    email: agent.email || '',
    case_file_name: fileName,
    case_count: caseCount,
    performer_name: performedBy?.name || 'A supervisor',
    action_label: verb,
  };
}

function buildFallbackEmail({ agent, action, file, caseCount, performedBy, businessName }) {
  const { verb, title } = actionLabel(action);
  const fileName = file?.file_name || `File #${file?.id ?? ''}`;
  const performer = performedBy?.name || 'A supervisor';
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937; max-width: 560px;">
      <h2 style="margin-bottom: 8px;">${escapeHtml(title)}</h2>
      <p style="margin: 0 0 12px;">Hi ${escapeHtml(agent.name)},</p>
      <p style="margin: 0 0 12px;">${escapeHtml(fileName)} has been ${escapeHtml(verb)}. ${caseCount} case(s) are affected.</p>
      <p style="margin: 12px 0; font-size: 14px; color: #6b7280;">Action by ${escapeHtml(performer)}. Please log in to ${escapeHtml(businessName)} to review.</p>
    </div>
  `;
  const text = `${title}\n\nHi ${agent.name},\n\n${fileName} has been ${verb}. ${caseCount} case(s) affected.\nAction by ${performer}.\n\nPlease log in to ${businessName} to review your case files.`;
  return { subject: `${businessName}: ${fileName} ${verb}`, html, text };
}

function buildFallbackSms({ agent, action, file, caseCount, performedBy, businessName }) {
  const { verb } = actionLabel(action);
  const fileName = file?.file_name || `File #${file?.id ?? ''}`;
  const firstName = agent.name ? agent.name.split(' ')[0] : 'there';
  return `Hi ${firstName}, ${fileName} has been ${verb}. ${caseCount} case(s) affected. Action by ${performedBy?.name || 'a supervisor'}. Log in to ${businessName} to review.`;
}

async function notifyAgentOfAssignment({ agent, action, file, caseCount, performedBy }) {
  if (!agent || !agent.id) return;

  const config = await getSystemConfig({ mask: false }).catch(() => null);
  const businessName = config?.business?.name || 'OMNICRM';
  const emailTemplateId = config?.notifications?.caseAssignmentEmailTemplateId || null;
  const smsTemplateId = config?.notifications?.caseAssignmentSmsTemplateId || null;

  const values = buildRenderValues({ agent, action, file, caseCount, performedBy, businessName });
  const { title } = actionLabel(action);
  const notificationType = action === 'unallocated' ? 'warning' : 'info';
  const fileName = file?.file_name || `File #${file?.id ?? ''}`;

  // In-app notification (best-effort).
  try {
    await createNotification({
      userId: agent.id,
      title,
      message: `${fileName} — ${caseCount} case(s) ${actionLabel(action).verb}.`,
      type: notificationType,
    });
  } catch (_) { /* swallow */ }

  // Email (best-effort). Render the chosen template, else use the built-in fallback.
  if (agent.email) {
    try {
      let { subject, html, text } = buildFallbackEmail({ agent, action, file, caseCount, performedBy, businessName });
      if (emailTemplateId) {
        try {
          const template = await getEmailTemplateById(emailTemplateId);
          if (template && template.body) {
            subject = renderTemplate(template.subject || subject, values);
            html = renderTemplate(template.body, values);
            text = stripHtml(html);
          }
        } catch (err) {
          console.warn('[caseAssignment] Failed to load email template:', err.message);
        }
      }
      await sendEmail({
        to: agent.email,
        subject,
        html,
        text,
        category: 'case_assignment',
        userId: agent.id,
        metadata: { action, fileId: file?.id, caseCount },
      });
    } catch (_) { /* swallow */ }
  }

  // SMS (best-effort). Render the chosen template, else use the built-in fallback.
  if (agent.phone) {
    try {
      let message = buildFallbackSms({ agent, action, file, caseCount, performedBy, businessName });
      if (smsTemplateId) {
        try {
          const template = await getSmsTemplateById(smsTemplateId);
          if (template && template.body) {
            message = renderTemplate(template.body, values);
          }
        } catch (err) {
          console.warn('[caseAssignment] Failed to load SMS template:', err.message);
        }
      }
      await sendSms({
        to: agent.phone,
        message,
        category: 'case_assignment',
        userId: agent.id,
      });
    } catch (_) { /* swallow */ }
  }

  // Activity log (best-effort).
  try {
    recordActivityEvent({
      userId: performedBy?.id,
      userName: performedBy?.name,
      actionType: `case.${action}`,
      title,
      subject: fileName,
      entityType: 'case_file',
      entityId: file?.id ? String(file.id) : null,
      metadata: { agentId: agent.id, agentName: agent.name, caseCount },
    }).catch(() => {});
  } catch (_) { /* swallow */ }
}

module.exports = {
  notifyAgentOfAssignment,
  buildRenderValues,
  buildFallbackEmail,
  buildFallbackSms,
};