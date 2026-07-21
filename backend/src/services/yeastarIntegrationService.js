const crypto = require('crypto');
const pool = require('../db/pool');
const { getSystemConfig } = require('./systemConfigService');
const { getVoiceConfig, getVoiceCallById, normalizePhone } = require('./africasTalkingVoiceService');
const { getYeastarConfig } = require('./yeastarVoiceService');
const { AGENT_ROLE_NAMES } = require('../config/orgRoles');

function timingSafeEqualString(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function assertYeastarIsActiveDialer(config) {
  const voice = getVoiceConfig(config);
  const active = String(voice.activeProvider || voice.provider || '').trim();
  if (active !== 'yeastar') {
    const err = new Error(
      active
        ? 'Yeastar is not the active system dialer. Inbound and CRM call features use the dialer selected under System Configurations → Communication.'
        : 'No active voice dialer is selected. A system admin must choose Yeastar under System Configurations → Communication.'
    );
    err.code = 'BAD_REQUEST';
    err.status = 503;
    throw err;
  }
}

async function assertIntegrationAuth(req) {
  const config = await getSystemConfig({ mask: false });
  const y = getYeastarConfig(config);
  const expected = y.integrationApiKey;
  if (!expected) {
    const err = new Error('Yeastar integration API key is not configured');
    err.code = 'UNAUTHORIZED';
    err.status = 401;
    throw err;
  }

  const header = String(req.headers.authorization || '');
  let token = '';
  if (header.startsWith('Bearer ')) token = header.slice(7).trim();
  else if (req.headers['x-api-key']) token = String(req.headers['x-api-key']).trim();
  else if (req.query?.apiKey) token = String(req.query.apiKey).trim();

  if (!token || !timingSafeEqualString(token, expected)) {
    const err = new Error('Invalid integration API key');
    err.code = 'UNAUTHORIZED';
    err.status = 401;
    throw err;
  }
  return config;
}

function phoneMatchVariants(phone) {
  const normalized = normalizePhone(phone) || String(phone || '').trim();
  if (!normalized) return [];
  const digits = normalized.replace(/\D/g, '');
  const last9 = digits.slice(-9);
  return [normalized, digits, last9].filter(Boolean);
}

async function searchContacts(phone, config) {
  assertYeastarIsActiveDialer(config);
  const voice = getVoiceConfig(config);
  const variants = phoneMatchVariants(phone);
  if (!variants.length) {
    return { contacts: [], total: 0 };
  }

  const [rows] = await pool.query(
    `SELECT d.id, d.name, d.phone, d.secondary_phone_number, d.email, d.account_number,
            d.loan_id, d.assigned_agent, d.client_id, c.name AS client_name
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     WHERE d.deleted_at IS NULL AND d.is_closed = 0
       AND (
         d.phone = ? OR d.phone = ? OR d.secondary_phone_number = ?
         OR REPLACE(REPLACE(COALESCE(d.phone, ''), '+', ''), ' ', '') = ?
         OR RIGHT(REPLACE(REPLACE(COALESCE(d.phone, ''), '+', ''), ' ', ''), 9) = ?
         OR RIGHT(REPLACE(REPLACE(COALESCE(d.secondary_phone_number, ''), '+', ''), ' ', ''), 9) = ?
       )
     ORDER BY d.updated_at DESC
     LIMIT 25`,
    [
      variants[0],
      variants[1] || variants[0],
      variants[0],
      variants[1] || variants[0],
      variants[2] || variants[1] || variants[0],
      variants[2] || variants[1] || variants[0],
    ]
  );

  const appBase = voice.appBaseUrl || '';
  const contacts = rows.map((row) => {
    const contactUrl = appBase
      ? `${appBase}/case-management/my-portfolio?openDebtor=${row.id}`
      : `/case-management/my-portfolio?openDebtor=${row.id}`;
    return {
      id: row.id,
      ContactId: String(row.id),
      firstName: String(row.name || '').split(' ')[0] || row.name,
      lastName: String(row.name || '').split(' ').slice(1).join(' ') || '',
      name: row.name,
      phone: row.phone,
      secondaryPhone: row.secondary_phone_number,
      email: row.email,
      accountNumber: row.account_number,
      loanId: row.loan_id,
      clientName: row.client_name,
      assignedAgent: row.assigned_agent,
      contactUrl,
      ContactUrl: contactUrl,
    };
  });

  return { contacts, data: contacts, total: contacts.length };
}

async function listIntegrationUsers(config) {
  if (config) assertYeastarIsActiveDialer(config);
  else {
    assertYeastarIsActiveDialer(await getSystemConfig({ mask: false }));
  }
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.yeastar_extension, u.is_active, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL AND u.is_active = 1
       AND r.name IN (?)
     ORDER BY u.name ASC`,
    [AGENT_ROLE_NAMES]
  );

  const users = rows.map((row) => {
    const parts = String(row.name || '').trim().split(/\s+/);
    return {
      id: row.id,
      UserUniqueId: String(row.id),
      firstName: parts[0] || row.name,
      lastName: parts.slice(1).join(' ') || '',
      First_Name: parts[0] || row.name,
      Last_Name: parts.slice(1).join(' ') || '',
      email: row.email,
      Email: row.email,
      name: row.name,
      yeastarExtension: row.yeastar_extension || null,
      roleName: row.role_name,
    };
  });

  return { users, data: users, total: users.length };
}

async function findAgentByExtension(extension) {
  const ext = String(extension || '').trim();
  if (!ext) return null;
  const [rows] = await pool.query(
    `SELECT u.*, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL AND u.yeastar_extension = ?
     LIMIT 1`,
    [ext]
  );
  return rows[0] || null;
}

async function findDebtorByPhone(phone) {
  const variants = phoneMatchVariants(phone);
  if (!variants.length) return null;
  const [rows] = await pool.query(
    `SELECT id, name, phone, assigned_agent
     FROM debtors
     WHERE deleted_at IS NULL AND is_closed = 0
       AND (
         phone = ? OR secondary_phone_number = ?
         OR RIGHT(REPLACE(REPLACE(COALESCE(phone, ''), '+', ''), ' ', ''), 9) = ?
       )
     ORDER BY updated_at DESC
     LIMIT 1`,
    [variants[0], variants[0], variants[2] || variants[1] || variants[0]]
  );
  return rows[0] || null;
}

/**
 * Upsert a voice_calls CDR from Yeastar call journal payload.
 * Accepts both our flat schema and common Yeastar template variables.
 */
async function journalCall(payload = {}, config = null) {
  assertYeastarIsActiveDialer(config || (await getSystemConfig({ mask: false })));

  const sessionId = String(
    payload.callId ||
      payload.call_id ||
      payload.providerSessionId ||
      payload.CallId ||
      ''
  ).trim() || null;

  const directionRaw = String(
    payload.direction || payload.Call_Type || payload.callType || 'outbound'
  ).toLowerCase();
  const direction = directionRaw.includes('in') ? 'inbound' : 'outbound';

  const extension = String(
    payload.extension || payload.Extension || payload.Owner || payload.agentExtension || ''
  ).trim();
  const agentPhone = normalizePhone(payload.agentNumber || payload.agent_number) || extension || null;
  const otherNumber =
    normalizePhone(
      payload.phone ||
        payload.Phone ||
        payload.callee ||
        payload.caller ||
        payload.debtorNumber ||
        payload.Remote_Number
    ) || String(payload.phone || payload.Phone || '').trim() || null;

  const durationSeconds =
    payload.durationSeconds != null
      ? Number(payload.durationSeconds)
      : payload.Talk_Duration_Sec != null
        ? Number(payload.Talk_Duration_Sec)
        : payload.Call_Duration != null
          ? Number(payload.Call_Duration)
          : null;

  const status = String(
    payload.status || payload.Call_Result || payload.Call_Log_Status || 'completed'
  )
    .trim()
    .toLowerCase() || 'completed';

  const recordingUrl =
    payload.recordingUrl ||
    payload.RecordPath ||
    payload.Voice_Recording__s ||
    payload.recording_url ||
    null;

  const agent = extension ? await findAgentByExtension(extension) : null;
  let agentId = agent?.id || null;
  if (!agentId && payload.agentId) agentId = Number(payload.agentId) || null;

  let debtor = otherNumber ? await findDebtorByPhone(otherNumber) : null;
  if (!debtor && (payload.debtorId || payload.ContactId)) {
    const [byId] = await pool.query(
      'SELECT id, name, phone FROM debtors WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [Number(payload.debtorId || payload.ContactId)]
    );
    debtor = byId[0] || null;
  }

  const debtorId = debtor?.id || null;
  const debtorNumber = normalizePhone(debtor?.phone) || otherNumber;
  const fromNumber = direction === 'inbound' ? debtorNumber : agentPhone;
  const toNumber = direction === 'inbound' ? agentPhone : debtorNumber;

  if (sessionId) {
    const [existing] = await pool.query(
      `SELECT id FROM voice_calls WHERE provider = 'yeastar' AND provider_session_id = ? LIMIT 1`,
      [sessionId]
    );
    if (existing[0]) {
      await pool.query(
        `UPDATE voice_calls SET
           status = ?,
           duration_seconds = COALESCE(?, duration_seconds),
           recording_url = COALESCE(?, recording_url),
           agent_id = COALESCE(?, agent_id),
           debtor_id = COALESCE(?, debtor_id),
           agent_number = COALESCE(?, agent_number),
           debtor_number = COALESCE(?, debtor_number),
           ended_at = CASE WHEN ? IN ('completed','failed','busy','no-answer','cancelled') THEN CURRENT_TIMESTAMP ELSE ended_at END
         WHERE id = ?`,
        [
          status,
          Number.isFinite(durationSeconds) ? durationSeconds : null,
          recordingUrl,
          agentId,
          debtorId,
          agentPhone,
          debtorNumber,
          status,
          existing[0].id,
        ]
      );
      return getVoiceCallById(existing[0].id);
    }
  }

  const [insert] = await pool.query(
    `INSERT INTO voice_calls
      (debtor_id, agent_id, sim_card_id, direction, provider, provider_session_id, client_request_id,
       from_number, to_number, agent_number, debtor_number, status, duration_seconds, recording_url,
       started_at, ended_at)
     VALUES (?, ?, NULL, ?, 'yeastar', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      debtorId,
      agentId,
      direction,
      sessionId,
      sessionId ? `ys-journal-${sessionId}` : `ys-journal-${Date.now()}`,
      fromNumber,
      toNumber,
      agentPhone,
      debtorNumber,
      status,
      Number.isFinite(durationSeconds) ? durationSeconds : null,
      recordingUrl,
    ]
  );

  return getVoiceCallById(insert.insertId);
}

module.exports = {
  assertIntegrationAuth,
  searchContacts,
  listIntegrationUsers,
  journalCall,
};
