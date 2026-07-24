const pool = require('../db/pool');
const { isAgentRole } = require('./agentService');
const { sendSms } = require('./smsService');
const { sendEmail } = require('./emailService');
const { renderTemplate } = require('./templateVariableService');
const { getSmsTemplateById, getEmailTemplateById } = require('./templateService');
const { recordActivityEvent } = require('./activityService');
const { createPtpArrangement } = require('./ptpService');
const {
  listVoiceCallsForDebtor,
} = require('./africasTalkingVoiceService');
const { startOutboundCall } = require('./dialerService');
const {
  getEffectivePortfolioAgentIds,
  assertAgentCanAccessDebtor,
} = require('./agentCoverageService');

const CHANNELS = new Set(['call', 'sms', 'email']);

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function requireAgentUser(user) {
  if (!user?.id || !isAgentRole(user)) {
    const err = new Error('Only agents can access their portfolio');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
  if (!user.name) {
    const err = new Error('Agent profile is missing a display name');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
}

function normalizePortfolioRow(row) {
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    clientName: row.client_name || null,
    cfid: row.cfid,
    fileId: row.file_id || null,
    fileName: row.file_name || null,
    phone: row.phone || null,
    email: row.email || null,
    accountNumber: row.account_number || null,
    loanId: row.loan_id || null,
    assignedAgent: row.assigned_agent || null,
    assignedAgentUserId:
      row.assigned_agent_user_id != null ? Number(row.assigned_agent_user_id) : null,
    coveringForAgentName: row.covering_for_agent_name || null,
    coveringForAgentUserId:
      row.covering_for_agent_user_id != null
        ? Number(row.covering_for_agent_user_id)
        : null,
    loanAmount: toNumber(row.loan_amount),
    totalPaid: toNumber(row.total_paid),
    outstandingBalance: toNumber(row.outstanding_balance),
    overdueDays: Number(row.overdue_days) || 0,
    bucket: row.bucket || null,
    installmentAmount: row.installment_amount != null ? toNumber(row.installment_amount) : null,
    contactStatusId: row.contact_status_id || null,
    contactStatusName: row.contact_status_name || null,
    contactStatusCode: row.contact_status_code || null,
    lastContactedAt: row.last_contacted_at || null,
    lastContactChannel: row.last_contact_channel || null,
    nextActionDate: toDate(row.next_action_date),
    currencySymbol: row.currency_symbol || null,
    hasCall: Number(row.has_call) > 0,
    hasSms: Number(row.has_sms) > 0,
    hasEmail: Number(row.has_email) > 0,
    attemptCount: Number(row.attempt_count) || 0,
    isContacted: Boolean(row.last_contacted_at) || Number(row.attempt_count) > 0,
  };
}

function buildPortfolioOwnerClause(user, effectiveIds) {
  const ids = (effectiveIds || []).map(Number).filter(Boolean);
  if (!ids.length) {
    return { clause: '1=0', params: [] };
  }
  const placeholders = ids.map(() => '?').join(', ');
  // Prefer user-id ownership; fall back to legacy name stamp for self only.
  return {
    clause: `(
      d.assigned_agent_user_id IN (${placeholders})
      OR (d.assigned_agent_user_id IS NULL AND d.assigned_agent = ?)
    )`,
    params: [...ids, String(user.name || '').trim()],
  };
}

function buildPortfolioFilters(user, filters = {}, effectiveIds = []) {
  const owner = buildPortfolioOwnerClause(user, effectiveIds);
  const clauses = [
    'd.deleted_at IS NULL',
    'd.is_closed = 0',
    owner.clause,
  ];
  const params = [...owner.params];

  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push(
      '(d.name LIKE ? OR d.phone LIKE ? OR d.email LIKE ? OR d.account_number LIKE ? OR d.loan_id LIKE ? OR d.cfid LIKE ?)'
    );
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like);
  }

  if (filters.clientId) {
    clauses.push('d.client_id = ?');
    params.push(Number(filters.clientId));
  }

  if (filters.contactStatusId) {
    clauses.push('d.contact_status_id = ?');
    params.push(Number(filters.contactStatusId));
  }

  if (filters.bucket) {
    clauses.push('d.bucket = ?');
    params.push(String(filters.bucket));
  }

  if (filters.contacted === '1' || filters.contacted === true) {
    clauses.push('(d.last_contacted_at IS NOT NULL OR EXISTS (SELECT 1 FROM contact_attempts ca0 WHERE ca0.debtor_id = d.id))');
  } else if (filters.contacted === '0' || filters.contacted === false) {
    clauses.push('d.last_contacted_at IS NULL AND NOT EXISTS (SELECT 1 FROM contact_attempts ca0 WHERE ca0.debtor_id = d.id)');
  }

  if (filters.channel && CHANNELS.has(String(filters.channel))) {
    const channel = String(filters.channel);
    clauses.push(
      `(d.last_contact_channel = ? OR EXISTS (SELECT 1 FROM contact_attempts ca_ch WHERE ca_ch.debtor_id = d.id AND ca_ch.channel = ?))`
    );
    params.push(channel, channel);
  }

  if (filters.ptp === '1' || filters.ptp === true) {
    clauses.push('d.contact_status_id IN (SELECT id FROM contact_statuses WHERE code = ?)');
    params.push('PTP');
  } else if (filters.ptp === '0' || filters.ptp === false) {
    clauses.push(
      '(d.contact_status_id IS NULL OR d.contact_status_id NOT IN (SELECT id FROM contact_statuses WHERE code = ?))'
    );
    params.push('PTP');
  }

  if (filters.nextActionFrom) {
    clauses.push('d.next_action_date >= ?');
    params.push(toDate(filters.nextActionFrom));
  }
  if (filters.nextActionTo) {
    clauses.push('d.next_action_date <= ?');
    params.push(toDate(filters.nextActionTo));
  }

  const reminderDue = String(filters.reminderDue || '').toLowerCase();
  if (reminderDue === 'today') {
    clauses.push('d.next_action_date = CURDATE()');
  } else if (reminderDue === 'overdue') {
    clauses.push('d.next_action_date IS NOT NULL AND d.next_action_date < CURDATE()');
  } else if (reminderDue === 'upcoming') {
    clauses.push('d.next_action_date IS NOT NULL AND d.next_action_date > CURDATE()');
  } else if (reminderDue === 'due') {
    clauses.push('d.next_action_date IS NOT NULL AND d.next_action_date <= CURDATE()');
  }

  if (filters.overdueDaysMin != null && filters.overdueDaysMin !== '') {
    clauses.push('d.overdue_days >= ?');
    params.push(Number(filters.overdueDaysMin));
  }
  if (filters.overdueDaysMax != null && filters.overdueDaysMax !== '') {
    clauses.push('d.overdue_days <= ?');
    params.push(Number(filters.overdueDaysMax));
  }

  if (filters.balanceMin != null && filters.balanceMin !== '') {
    clauses.push('d.outstanding_balance >= ?');
    params.push(Number(filters.balanceMin));
  }
  if (filters.balanceMax != null && filters.balanceMax !== '') {
    clauses.push('d.outstanding_balance <= ?');
    params.push(Number(filters.balanceMax));
  }

  if (filters.lastContactedFrom) {
    clauses.push('d.last_contacted_at >= ?');
    params.push(toDate(filters.lastContactedFrom));
  }
  if (filters.lastContactedTo) {
    clauses.push('DATE(d.last_contacted_at) <= ?');
    params.push(toDate(filters.lastContactedTo));
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

const FROM_SQL = `
  FROM debtors d
  LEFT JOIN clients c ON c.id = d.client_id
  LEFT JOIN debtor_files df ON df.id = d.file_id
  LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
  LEFT JOIN currencies cur ON cur.id = d.currency_id
  LEFT JOIN (
    SELECT debtor_id,
           COUNT(*) AS attempt_count,
           SUM(channel = 'call') AS has_call,
           SUM(channel = 'sms') AS has_sms,
           SUM(channel = 'email') AS has_email
    FROM contact_attempts
    GROUP BY debtor_id
  ) ca ON ca.debtor_id = d.id
`;

async function listPortfolioBuckets(user) {
  requireAgentUser(user);
  const effectiveIds = await getEffectivePortfolioAgentIds(user);
  const owner = buildPortfolioOwnerClause(user, effectiveIds);
  const [rows] = await pool.query(
    `SELECT DISTINCT d.bucket AS bucket
     FROM debtors d
     WHERE d.deleted_at IS NULL
       AND d.is_closed = 0
       AND ${owner.clause}
       AND d.bucket IS NOT NULL
       AND d.bucket <> ''
     ORDER BY d.bucket ASC`,
    owner.params
  );
  return rows.map((r) => r.bucket).filter(Boolean);
}

async function listPortfolioClients(user) {
  requireAgentUser(user);
  const effectiveIds = await getEffectivePortfolioAgentIds(user);
  const owner = buildPortfolioOwnerClause(user, effectiveIds);
  const [rows] = await pool.query(
    `SELECT DISTINCT c.id, c.name
     FROM debtors d
     INNER JOIN clients c ON c.id = d.client_id AND c.deleted_at IS NULL
     WHERE d.deleted_at IS NULL
       AND d.is_closed = 0
       AND ${owner.clause}
     ORDER BY c.name ASC`,
    owner.params
  );
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function listPortfolio(user, filters = {}) {
  requireAgentUser(user);
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));
  const offset = (page - 1) * pageSize;
  const effectiveIds = await getEffectivePortfolioAgentIds(user);
  const selfId = Number(user.id);

  const { where, params } = buildPortfolioFilters(user, filters, effectiveIds);

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total ${FROM_SQL} ${where}`,
    params
  );
  const total = Number(countRows[0]?.total) || 0;

  const [rows] = await pool.query(
    `SELECT d.*,
            c.name AS client_name,
            df.file_name AS file_name,
            cs.name AS contact_status_name,
            cs.code AS contact_status_code,
            cur.symbol AS currency_symbol,
            COALESCE(ca.attempt_count, 0) AS attempt_count,
            COALESCE(ca.has_call, 0) AS has_call,
            COALESCE(ca.has_sms, 0) AS has_sms,
            COALESCE(ca.has_email, 0) AS has_email,
            CASE
              WHEN d.assigned_agent_user_id IS NOT NULL AND d.assigned_agent_user_id <> ?
              THEN COALESCE(owner_u.name, d.assigned_agent)
              ELSE NULL
            END AS covering_for_agent_name,
            CASE
              WHEN d.assigned_agent_user_id IS NOT NULL AND d.assigned_agent_user_id <> ?
              THEN d.assigned_agent_user_id
              ELSE NULL
            END AS covering_for_agent_user_id
     ${FROM_SQL}
     LEFT JOIN users owner_u ON owner_u.id = d.assigned_agent_user_id
     ${where}
     ORDER BY
       CASE WHEN d.next_action_date IS NOT NULL AND d.next_action_date <= CURDATE() THEN 0 ELSE 1 END,
       d.next_action_date ASC,
       d.overdue_days DESC,
       d.name ASC
     LIMIT ? OFFSET ?`,
    [selfId, selfId, ...params, pageSize, offset]
  );

  return {
    items: rows.map(normalizePortfolioRow),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  };
}

async function getPortfolioTotals(user, filters = {}) {
  requireAgentUser(user);
  const effectiveIds = await getEffectivePortfolioAgentIds(user);
  const { where, params } = buildPortfolioFilters(user, filters, effectiveIds);

  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(d.outstanding_balance), 0) AS outstanding,
       SUM(CASE WHEN d.last_contacted_at IS NOT NULL OR ca.attempt_count > 0 THEN 1 ELSE 0 END) AS contacted,
       SUM(CASE WHEN d.last_contacted_at IS NULL AND (ca.attempt_count IS NULL OR ca.attempt_count = 0) THEN 1 ELSE 0 END) AS not_contacted,
       SUM(CASE WHEN d.next_action_date IS NOT NULL AND d.next_action_date <= CURDATE() THEN 1 ELSE 0 END) AS reminders_due,
       SUM(CASE WHEN cs.code = 'PTP' THEN 1 ELSE 0 END) AS ptp_count
     ${FROM_SQL}
     ${where}`,
    params
  );

  const row = rows[0] || {};
  return {
    total: Number(row.total) || 0,
    outstanding: toNumber(row.outstanding),
    contacted: Number(row.contacted) || 0,
    notContacted: Number(row.not_contacted) || 0,
    remindersDue: Number(row.reminders_due) || 0,
    ptpCount: Number(row.ptp_count) || 0,
  };
}

async function getAssignedDebtorOrThrow(user, debtorId) {
  requireAgentUser(user);
  const [rows] = await pool.query(
    `SELECT d.*, c.name AS client_name, cs.code AS contact_status_code, cs.name AS contact_status_name
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
     WHERE d.id = ? AND d.deleted_at IS NULL
     LIMIT 1`,
    [Number(debtorId)]
  );
  const debtor = rows[0];
  if (!debtor) {
    const err = new Error('Debtor not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  const access = await assertAgentCanAccessDebtor(user, debtor);
  debtor._portfolioAccess = access;
  return debtor;
}

/** Actor = covering agent; portfolio_owner = absent agent when working under leave coverage. */
function coverageAuditMeta(user, debtor) {
  const access = debtor?._portfolioAccess;
  if (!access || access.mode !== 'coverage') return {};
  return {
    actingAsCoverage: true,
    actorUserId: user?.id || null,
    actorUserName: user?.name || null,
    portfolioOwnerUserId: access.portfolioOwnerUserId || null,
    portfolioOwnerName: access.portfolioOwnerName || debtor.assigned_agent || null,
  };
}

function buildTemplateValues(debtor, agent) {
  return {
    name: debtor.name,
    first_name: String(debtor.name || '').split(' ')[0] || debtor.name,
    amount: debtor.outstanding_balance,
    account_number: debtor.account_number,
    due_date: debtor.loan_due_date,
    business_name: 'OMNICRM',
    agent_name: agent.name,
    phone: debtor.phone,
    email: debtor.email,
    client_name: debtor.client_name,
  };
}

const MIN_INTERACTION_NOTES_LENGTH = 5;

function requireInteractionNotes(rawNotes) {
  const notes = rawNotes != null ? String(rawNotes).trim() : '';
  if (notes.length < MIN_INTERACTION_NOTES_LENGTH) {
    const err = new Error(
      `Interaction notes are required (at least ${MIN_INTERACTION_NOTES_LENGTH} characters describing how the interaction went)`
    );
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
  return notes;
}

async function insertContactAttempt({
  debtorId,
  agentId,
  channel,
  contactStatusId = null,
  notes = null,
  messageBody = null,
}) {
  const [result] = await pool.query(
    `INSERT INTO contact_attempts
      (debtor_id, agent_id, channel, contact_status_id, notes, message_body)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [debtorId, agentId, channel, contactStatusId, notes, messageBody]
  );
  return result.insertId;
}

async function touchDebtorContact(debtorId, { channel, contactStatusId = undefined, nextActionDate = undefined }) {
  const sets = ['last_contacted_at = CURRENT_TIMESTAMP', 'last_contact_channel = ?'];
  const params = [channel];

  if (contactStatusId !== undefined) {
    sets.push('contact_status_id = ?');
    params.push(contactStatusId);
  }
  if (nextActionDate !== undefined) {
    sets.push('next_action_date = ?');
    params.push(nextActionDate);
  }

  params.push(debtorId);
  await pool.query(`UPDATE debtors SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function sendPortfolioSms(user, debtorId, payload = {}) {
  const debtor = await getAssignedDebtorOrThrow(user, debtorId);
  if (!debtor.phone) {
    const err = new Error('Debtor has no phone number on file');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  let message = String(payload.message || '').trim();
  const templateId = payload.templateId ? Number(payload.templateId) : null;
  const values = buildTemplateValues(debtor, user);

  if (templateId) {
    const template = await getSmsTemplateById(templateId);
    if (!template?.body) {
      const err = new Error('SMS template not found');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }
    message = renderTemplate(template.body, { ...values, ...(payload.values || {}) });
  }

  if (!message) {
    const err = new Error('SMS message is required');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const notes = requireInteractionNotes(payload.notes);

  const result = await sendSms({
    to: debtor.phone,
    message,
    category: 'debtor_outreach',
    userId: user.id,
  });

  if (!result.sent && result.reason !== 'not_configured') {
    const err = new Error(result.detail || 'Failed to send SMS');
    err.code = 'SEND_FAILED';
    err.status = 502;
    throw err;
  }

  const attemptId = await insertContactAttempt({
    debtorId: debtor.id,
    agentId: user.id,
    channel: 'sms',
    notes,
    messageBody: message,
  });
  await touchDebtorContact(debtor.id, { channel: 'sms' });

  recordActivityEvent({
    userId: user.id,
    userName: user.name,
    actionType: 'contact.sms',
    title: 'SMS Sent to Debtor',
    subject: debtor.name,
    entityType: 'debtor',
    entityId: String(debtor.id),
    metadata: {
      attemptId,
      channel: 'sms',
      sent: Boolean(result.sent),
      notes,
      templateId: templateId || null,
      ...coverageAuditMeta(user, debtor),
    },
  }).catch(() => {});

  return { attemptId, sent: Boolean(result.sent), reason: result.reason || null, message };
}

async function sendPortfolioEmail(user, debtorId, payload = {}) {
  const debtor = await getAssignedDebtorOrThrow(user, debtorId);
  if (!debtor.email) {
    const err = new Error('Debtor has no email address on file');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  let subject = String(payload.subject || '').trim();
  let body = String(payload.body || payload.message || '').trim();
  const templateId = payload.templateId ? Number(payload.templateId) : null;
  const values = buildTemplateValues(debtor, user);

  if (templateId) {
    const template = await getEmailTemplateById(templateId);
    if (!template) {
      const err = new Error('Email template not found');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }
    subject = renderTemplate(template.subject || '', { ...values, ...(payload.values || {}) });
    body = renderTemplate(template.body || '', { ...values, ...(payload.values || {}) });
  }

  if (!subject || !body) {
    const err = new Error('Email subject and body are required');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const notes = requireInteractionNotes(payload.notes);

  await sendEmail({
    to: debtor.email,
    subject,
    html: body.includes('<') ? body : `<p>${body.replace(/\n/g, '<br/>')}</p>`,
    text: body.replace(/<[^>]+>/g, ''),
    category: 'debtor_outreach',
    userId: user.id,
    metadata: { debtorId: debtor.id },
  });

  const attemptId = await insertContactAttempt({
    debtorId: debtor.id,
    agentId: user.id,
    channel: 'email',
    notes,
    messageBody: `${subject}\n\n${body}`,
  });
  await touchDebtorContact(debtor.id, { channel: 'email' });

  recordActivityEvent({
    userId: user.id,
    userName: user.name,
    actionType: 'contact.email',
    title: 'Email Sent to Debtor',
    subject: debtor.name,
    entityType: 'debtor',
    entityId: String(debtor.id),
    metadata: {
      attemptId,
      channel: 'email',
      notes,
      templateId: templateId || null,
      subject,
      ...coverageAuditMeta(user, debtor),
    },
  }).catch(() => {});

  return { attemptId, sent: true, subject, body };
}

async function logPortfolioResponse(user, debtorId, payload = {}) {
  const debtor = await getAssignedDebtorOrThrow(user, debtorId);
  const channel = String(payload.channel || '').toLowerCase();
  if (!CHANNELS.has(channel)) {
    const err = new Error('channel must be call, sms, or email');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const contactStatusId = payload.contactStatusId ? Number(payload.contactStatusId) : null;
  if (!contactStatusId) {
    const err = new Error('contactStatusId is required');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const [statusRows] = await pool.query(
    'SELECT id, code, name FROM contact_statuses WHERE id = ? AND is_active = 1 LIMIT 1',
    [contactStatusId]
  );
  const status = statusRows[0];
  if (!status) {
    const err = new Error('Contact status not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const notes = requireInteractionNotes(payload.notes);
  const isPtp = String(status.code || '').toUpperCase() === 'PTP' || Boolean(payload.ptp);
  const previousContactStatusId = debtor.contact_status_id || null;
  const previousContactStatusCode = debtor.contact_status_code || null;
  const previousContactStatusName = debtor.contact_status_name || null;

  let reminderDate = null;
  let ptpPayload = null;
  if (isPtp) {
    ptpPayload = payload.ptp || {};
    reminderDate = toDate(ptpPayload.reminderDate);
    if (!reminderDate) {
      const err = new Error('PTP reminderDate is required');
      err.code = 'BAD_REQUEST';
      err.status = 400;
      throw err;
    }
  } else if (payload.nextActionDate) {
    reminderDate = toDate(payload.nextActionDate);
  }

  const attemptId = await insertContactAttempt({
    debtorId: debtor.id,
    agentId: user.id,
    channel,
    contactStatusId: status.id,
    notes,
    messageBody: null,
  });

  await touchDebtorContact(debtor.id, {
    channel,
    contactStatusId: status.id,
    nextActionDate: reminderDate,
  });

  let ptp = null;
  if (isPtp) {
    ptp = await createPtpArrangement({
      debtorId: debtor.id,
      agentId: user.id,
      contactAttemptId: attemptId,
      promisedAmount: ptpPayload.promisedAmount,
      promiseDate: ptpPayload.promiseDate,
      reminderDate,
      channel,
      notes: ptpPayload.notes || notes,
    });
  }

  recordActivityEvent({
    userId: user.id,
    userName: user.name,
    actionType: isPtp ? 'contact.ptp' : channel === 'call' ? 'contact.call' : 'contact.response',
    title: isPtp ? 'PTP Recorded' : channel === 'call' ? 'Call Logged' : 'Contact Response Logged',
    subject: debtor.name,
    entityType: 'debtor',
    entityId: String(debtor.id),
    metadata: {
      attemptId,
      channel,
      contactStatusId: status.id,
      contactStatusCode: status.code,
      contactStatusName: status.name,
      previousContactStatusId,
      previousContactStatusCode,
      previousContactStatusName,
      notes,
      nextActionDate: reminderDate,
      ...coverageAuditMeta(user, debtor),
      promisedAmount: ptp?.promisedAmount ?? null,
      promiseDate: ptp?.promiseDate ?? null,
      reminderDate: ptp?.reminderDate ?? reminderDate,
      ptpId: ptp?.id || null,
    },
  }).catch(() => {});

  return {
    attemptId,
    contactStatus: { id: status.id, code: status.code, name: status.name },
    channel,
    nextActionDate: reminderDate,
    ptp,
  };
}

/**
 * Unified SMS / email / call activity for a portfolio debtor.
 * channel filter: all | call | sms | email
 */
async function getPortfolioActivity(user, debtorId, { channel = 'all', limit = 100 } = {}) {
  const debtor = await getAssignedDebtorOrThrow(user, debtorId);
  const channelFilter = String(channel || 'all').toLowerCase();
  const items = [];

  if (channelFilter === 'all' || channelFilter === 'sms' || channelFilter === 'email' || channelFilter === 'call') {
    const attemptChannels =
      channelFilter === 'all'
        ? ['call', 'sms', 'email']
        : [channelFilter];

    const placeholders = attemptChannels.map(() => '?').join(',');
    const [attempts] = await pool.query(
      `SELECT ca.*, cs.name AS contact_status_name, cs.code AS contact_status_code,
              u.name AS agent_name
       FROM contact_attempts ca
       LEFT JOIN contact_statuses cs ON cs.id = ca.contact_status_id
       LEFT JOIN users u ON u.id = ca.agent_id
       WHERE ca.debtor_id = ? AND ca.channel IN (${placeholders})
       ORDER BY ca.created_at DESC
       LIMIT ?`,
      [debtor.id, ...attemptChannels, Math.min(200, Math.max(1, Number(limit) || 100))]
    );

    for (const row of attempts) {
      // Voice legs come from voice_calls; keep SMS/email sends and call wrap-ups here.
      if (row.channel === 'call' && !row.contact_status_id && !row.notes) {
        continue;
      }

      let preview = row.message_body || row.notes || null;
      let subject = null;
      if (row.channel === 'email' && row.message_body) {
        const parts = String(row.message_body).split('\n\n');
        subject = parts[0] || null;
        preview = parts.slice(1).join('\n\n') || row.message_body;
      }

      items.push({
        id: `attempt-${row.id}`,
        kind: row.channel === 'call' ? 'call_log' : row.channel,
        channel: row.channel,
        direction: row.channel === 'call' ? 'outbound' : 'outbound',
        status: row.contact_status_name || (row.channel === 'sms' || row.channel === 'email' ? 'sent' : null),
        statusCode: row.contact_status_code || null,
        subject,
        preview: preview ? String(preview).slice(0, 400) : null,
        notes: row.notes || null,
        agentName: row.agent_name || null,
        durationSeconds: null,
        recordingUrl: null,
        createdAt: row.created_at,
        meta: { attemptId: row.id },
      });
    }
  }

  if (channelFilter === 'all' || channelFilter === 'call') {
    const calls = await listVoiceCallsForDebtor(debtor.id, { limit });
    for (const call of calls) {
      items.push({
        id: `voice-${call.id}`,
        kind: 'call',
        channel: 'call',
        direction: call.direction,
        status: call.status,
        statusCode: null,
        subject: null,
        preview:
          call.direction === 'inbound'
            ? `Inbound from ${call.fromNumber || call.debtorNumber || 'unknown'}`
            : `Outbound to ${call.debtorNumber || call.toNumber || 'debtor'}`,
        notes: null,
        agentName: user.name,
        durationSeconds: call.durationSeconds,
        recordingUrl: call.recordingUrl,
        createdAt: call.createdAt,
        meta: {
          voiceCallId: call.id,
          simCardId: call.simCardId,
          agentNumber: call.agentNumber,
          debtorNumber: call.debtorNumber,
        },
      });
    }
  }

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    debtor: {
      id: debtor.id,
      name: debtor.name,
      phone: debtor.phone,
      email: debtor.email,
      clientName: debtor.client_name,
      accountNumber: debtor.account_number,
      outstandingBalance: toNumber(debtor.outstanding_balance),
      overdueDays: Number(debtor.overdue_days) || 0,
      bucket: debtor.bucket || null,
      lastContactedAt: debtor.last_contacted_at,
      lastContactChannel: debtor.last_contact_channel,
      nextActionDate: toDate(debtor.next_action_date),
      contactStatusName: debtor.contact_status_name,
      contactStatusCode: debtor.contact_status_code,
    },
    items: items.slice(0, Math.min(200, Math.max(1, Number(limit) || 100))),
  };
}

async function startPortfolioCall(user, debtorId, payload = {}) {
  const debtor = await getAssignedDebtorOrThrow(user, debtorId);
  return startOutboundCall(user, {
    debtor,
    simCardId: payload.simCardId ? Number(payload.simCardId) : null,
  });
}

module.exports = {
  listPortfolio,
  listPortfolioBuckets,
  listPortfolioClients,
  getPortfolioTotals,
  sendPortfolioSms,
  sendPortfolioEmail,
  logPortfolioResponse,
  getPortfolioActivity,
  startPortfolioCall,
  getAssignedDebtorOrThrow,
};
