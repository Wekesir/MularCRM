const pool = require('../db/pool');
const { getSystemConfig } = require('./systemConfigService');
const {
  getSimCardForUser,
  findActiveSimByPhone,
  normalizePhone,
} = require('./agentSimCardService');
const { recordActivityEvent } = require('./activityService');

function getVoiceConfig(config) {
  const voice = config?.voice || {};
  return {
    provider: String(voice.provider || '').trim(),
    username: String(voice.username || '').trim(),
    apiKey: String(voice.apiKey || '').trim(),
    voiceNumber: normalizePhone(voice.voiceNumber) || String(voice.voiceNumber || '').trim(),
    callbackBaseUrl: String(voice.callbackBaseUrl || '').replace(/\/$/, ''),
    recordCalls: voice.recordCalls !== false,
  };
}

function assertVoiceConfigured(voice) {
  if (voice.provider !== 'africastalking') {
    const err = new Error('Africa\'s Talking Voice is not enabled. Configure it under System Configurations → Communication.');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
  if (!voice.username || !voice.apiKey || !voice.voiceNumber) {
    const err = new Error('Africa\'s Talking Voice credentials are incomplete (username, API key, and voice number required).');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildDialXml(phoneNumber, { record = true } = {}) {
  const recordAttr = record ? 'true' : 'false';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="${recordAttr}" sequential="true" phoneNumbers="${escapeXml(phoneNumber)}"/>
</Response>`;
}

function buildRejectXml(message = 'Unable to connect your call.') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Reject/>
  <Say>${escapeXml(message)}</Say>
</Response>`;
}

async function callAtVoiceApi(voice, { callTo, callFrom, clientRequestId }) {
  const body = new URLSearchParams();
  body.set('username', voice.username);
  body.set('to', callTo);
  body.set('from', callFrom);
  if (clientRequestId) body.set('clientRequestId', clientRequestId);

  const response = await fetch('https://voice.africastalking.com/call', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      apiKey: voice.apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const err = new Error(data?.errorMessage || data?.message || `Africa's Talking call failed (${response.status})`);
    err.code = 'SEND_FAILED';
    err.status = 502;
    err.detail = data;
    throw err;
  }

  return data;
}

function mapVoiceCall(row) {
  if (!row) return null;
  return {
    id: row.id,
    debtorId: row.debtor_id,
    agentId: row.agent_id,
    simCardId: row.sim_card_id,
    direction: row.direction,
    provider: row.provider,
    providerSessionId: row.provider_session_id,
    clientRequestId: row.client_request_id,
    fromNumber: row.from_number,
    toNumber: row.to_number,
    agentNumber: row.agent_number,
    debtorNumber: row.debtor_number,
    status: row.status,
    durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    recordingUrl: row.recording_url,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getVoiceCallById(id) {
  const [rows] = await pool.query(`SELECT * FROM voice_calls WHERE id = ? LIMIT 1`, [Number(id)]);
  return mapVoiceCall(rows[0]);
}

async function initiateOutboundCall(user, { debtor, simCardId }) {
  const config = await getSystemConfig();
  const voice = getVoiceConfig(config);
  assertVoiceConfigured(voice);

  const debtorPhone = normalizePhone(debtor.phone);
  if (!debtorPhone) {
    const err = new Error('Debtor has no valid phone number on file');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  let sim = null;
  if (simCardId) {
    sim = await getSimCardForUser(user.id, simCardId);
  } else {
    const [simRows] = await pool.query(
      `SELECT * FROM agent_sim_cards
       WHERE user_id = ? AND is_active = 1 AND supports_outbound = 1
       ORDER BY is_default DESC, id ASC LIMIT 1`,
      [user.id]
    );
    sim = simRows[0]
      ? {
          id: simRows[0].id,
          phoneNumber: simRows[0].phone_number,
          supportsOutbound: Boolean(simRows[0].supports_outbound),
          isActive: Boolean(simRows[0].is_active),
        }
      : null;
  }

  if (!sim || !sim.isActive || !sim.supportsOutbound) {
    const err = new Error('Add an active outbound SIM card under Profile → SIM Cards before placing calls.');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const agentNumber = normalizePhone(sim.phoneNumber);
  if (!agentNumber) {
    const err = new Error('Selected SIM has an invalid phone number');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const clientRequestId = `out-${user.id}-${debtor.id}-${Date.now()}`;

  const [insert] = await pool.query(
    `INSERT INTO voice_calls
      (debtor_id, agent_id, sim_card_id, direction, provider, client_request_id,
       from_number, to_number, agent_number, debtor_number, status, started_at)
     VALUES (?, ?, ?, 'outbound', 'africastalking', ?, ?, ?, ?, ?, 'queued', CURRENT_TIMESTAMP)`,
    [
      debtor.id,
      user.id,
      sim.id,
      clientRequestId,
      voice.voiceNumber,
      agentNumber,
      agentNumber,
      debtorPhone,
    ]
  );

  const callId = insert.insertId;

  try {
    // Ring agent SIM first; session callback will Dial the debtor.
    const atResponse = await callAtVoiceApi(voice, {
      callTo: agentNumber,
      callFrom: voice.voiceNumber,
      clientRequestId,
    });

    const entry = Array.isArray(atResponse?.entries) ? atResponse.entries[0] : null;
    const sessionId = entry?.sessionId || entry?.session_id || null;
    const status = String(entry?.status || 'Queued').toLowerCase();

    await pool.query(
      `UPDATE voice_calls SET provider_session_id = ?, status = ? WHERE id = ?`,
      [sessionId, status || 'queued', callId]
    );

    recordActivityEvent({
      userId: user.id,
      userName: user.name,
      actionType: 'contact.call.outbound',
      title: 'Outbound Call Started',
      subject: debtor.name,
      entityType: 'debtor',
      entityId: String(debtor.id),
      metadata: {
        voiceCallId: callId,
        direction: 'outbound',
        agentNumber,
        debtorNumber: debtorPhone,
        simCardId: sim.id,
        status: status || 'queued',
      },
    }).catch(() => {});

    return {
      call: await getVoiceCallById(callId),
      provider: atResponse,
      next: 'Answer your phone — you will be connected to the debtor.',
    };
  } catch (error) {
    await pool.query(`UPDATE voice_calls SET status = 'failed', ended_at = CURRENT_TIMESTAMP WHERE id = ?`, [
      callId,
    ]);
    throw error;
  }
}

/**
 * AT voice session callback — when agent answers outbound leg, Dial the debtor.
 * For inbound, Dial the agent's SIM (already ringing via AT) / confirm connect.
 */
async function handleVoiceSessionCallback(body = {}) {
  const config = await getSystemConfig();
  const voice = getVoiceConfig(config);
  const record = voice.recordCalls !== false;

  const clientRequestId = String(body.clientRequestId || body.clientRequestID || '').trim();
  const sessionId = String(body.sessionId || body.sessionID || '').trim() || null;
  const callerNumber = normalizePhone(body.callerNumber || body.callerNumber) || String(body.callerNumber || '').trim();
  const destinationNumber =
    normalizePhone(body.destinationNumber || body.calledNumber) ||
    String(body.destinationNumber || body.calledNumber || '').trim();
  const directionHint = String(body.direction || '').toLowerCase();
  const isActive = String(body.isActive || body.is_active || '1') === '1';

  if (!isActive) {
    return { xml: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>', call: null };
  }

  // Outbound bridge: lookup by clientRequestId stored when we initiated the call
  if (clientRequestId.startsWith('out-')) {
    const [rows] = await pool.query(
      `SELECT * FROM voice_calls WHERE client_request_id = ? LIMIT 1`,
      [clientRequestId]
    );
    const call = rows[0];
    if (!call) return { xml: buildRejectXml('Call session not found.'), call: null };

    if (sessionId) {
      await pool.query(
        `UPDATE voice_calls SET provider_session_id = COALESCE(provider_session_id, ?), status = 'bridging' WHERE id = ?`,
        [sessionId, call.id]
      );
    }

    return {
      xml: buildDialXml(call.debtor_number, { record }),
      call: mapVoiceCall(call),
    };
  }

  // Inbound: match called SIM → agent; match caller → debtor
  const called =
    destinationNumber ||
    normalizePhone(body.serviceCode) ||
    normalizePhone(voice.voiceNumber);

  const sim = called ? await findActiveSimByPhone(called) : null;
  if (!sim || !sim.supportsInbound) {
    // Also try matching by AT voice number → any inbound SIM is not enough; reject
    return { xml: buildRejectXml('This number is not configured for inbound calls.'), call: null };
  }

  let debtorId = null;
  let debtorNumber = callerNumber || null;
  if (callerNumber) {
    const [debtors] = await pool.query(
      `SELECT id, phone, assigned_agent FROM debtors
       WHERE deleted_at IS NULL AND is_closed = 0
         AND (
           phone = ? OR phone = ? OR REPLACE(phone, '+', '') = REPLACE(?, '+', '')
           OR RIGHT(REPLACE(phone, '+', ''), 9) = RIGHT(REPLACE(?, '+', ''), 9)
         )
       ORDER BY CASE WHEN assigned_agent = ? THEN 0 ELSE 1 END
       LIMIT 1`,
      [callerNumber, callerNumber.replace(/^\+/, ''), callerNumber, callerNumber, sim.agentName]
    );
    if (debtors[0]) {
      debtorId = debtors[0].id;
      debtorNumber = normalizePhone(debtors[0].phone) || callerNumber;
    }
  }

  const inboundClientReq = `in-${sim.userId}-${Date.now()}`;
  const [insert] = await pool.query(
    `INSERT INTO voice_calls
      (debtor_id, agent_id, sim_card_id, direction, provider, provider_session_id, client_request_id,
       from_number, to_number, agent_number, debtor_number, status, started_at)
     VALUES (?, ?, ?, 'inbound', 'africastalking', ?, ?, ?, ?, ?, ?, 'ringing', CURRENT_TIMESTAMP)`,
    [
      debtorId,
      sim.userId,
      sim.id,
      sessionId,
      inboundClientReq,
      callerNumber,
      called,
      sim.phoneNumber,
      debtorNumber,
    ]
  );

  recordActivityEvent({
    userId: sim.userId,
    userName: sim.agentName,
    actionType: 'contact.call.inbound',
    title: debtorId ? 'Inbound Call' : 'Inbound Call (Unknown Caller)',
    subject: callerNumber || 'Unknown',
    entityType: debtorId ? 'debtor' : 'voice_call',
    entityId: String(debtorId || insert.insertId),
    metadata: {
      voiceCallId: insert.insertId,
      direction: 'inbound',
      callerNumber,
      calledNumber: called,
      debtorId,
      simCardId: sim.id,
    },
  }).catch(() => {});

  // Bridge/keep the call on the agent's SIM (already the destination of the inbound AT number mapping).
  // If AT is calling our callback as the controller for the virtual number, Dial the agent SIM.
  return {
    xml: buildDialXml(sim.phoneNumber, { record }),
    call: await getVoiceCallById(insert.insertId),
    inbound: {
      agentId: sim.userId,
      debtorId,
      voiceCallId: insert.insertId,
    },
  };
}

async function handleVoiceEventCallback(body = {}) {
  const sessionId = String(body.sessionId || body.sessionID || '').trim();
  const clientRequestId = String(body.clientRequestId || body.clientRequestID || '').trim();
  const status = String(body.callSessionState || body.status || body.callStatus || '').toLowerCase() || null;
  const duration = body.durationInSeconds != null ? Number(body.durationInSeconds) : null;
  const recordingUrl = body.recordingUrl || body.recordingURL || null;

  let call = null;
  if (clientRequestId) {
    const [rows] = await pool.query(
      `SELECT * FROM voice_calls WHERE client_request_id = ? LIMIT 1`,
      [clientRequestId]
    );
    call = rows[0];
  }
  if (!call && sessionId) {
    const [rows] = await pool.query(
      `SELECT * FROM voice_calls WHERE provider_session_id = ? LIMIT 1`,
      [sessionId]
    );
    call = rows[0];
  }
  if (!call) return { updated: false };

  const sets = [];
  const params = [];
  if (sessionId) {
    sets.push('provider_session_id = COALESCE(provider_session_id, ?)');
    params.push(sessionId);
  }
  if (status) {
    sets.push('status = ?');
    params.push(status);
  }
  if (Number.isFinite(duration)) {
    sets.push('duration_seconds = ?');
    params.push(duration);
  }
  if (recordingUrl) {
    sets.push('recording_url = ?');
    params.push(String(recordingUrl));
  }
  if (status && ['completed', 'failed', 'noanswer', 'busy', 'closed'].some((s) => status.includes(s))) {
    sets.push('ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP)');
  }

  if (sets.length === 0) return { updated: false, call: mapVoiceCall(call) };

  params.push(call.id);
  await pool.query(`UPDATE voice_calls SET ${sets.join(', ')} WHERE id = ?`, params);
  return { updated: true, call: await getVoiceCallById(call.id) };
}

async function listVoiceCallsForDebtor(debtorId, { limit = 100 } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM voice_calls
     WHERE debtor_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [Number(debtorId), Math.min(200, Math.max(1, Number(limit) || 100))]
  );
  return rows.map(mapVoiceCall);
}

module.exports = {
  getVoiceConfig,
  assertVoiceConfigured,
  initiateOutboundCall,
  handleVoiceSessionCallback,
  handleVoiceEventCallback,
  listVoiceCallsForDebtor,
  getVoiceCallById,
  buildDialXml,
  buildRejectXml,
};
