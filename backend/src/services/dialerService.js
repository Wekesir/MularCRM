const pool = require('../db/pool');
const { getSystemConfig } = require('./systemConfigService');
const {
  getVoiceConfig,
  isAfricasTalkingConfigured,
  initiateOutboundCall: initiateAtOutboundCall,
  normalizePhone,
  getVoiceCallById,
  callAtVoiceApi,
  assertVoiceConfigured,
} = require('./africasTalkingVoiceService');
const {
  isYeastarConfigured,
  initiateOutboundCall: initiateYeastarOutboundCall,
  getYeastarConfig,
  getAccessToken,
  resolveAgentExtension,
  fetchYeastarJson,
} = require('./yeastarVoiceService');

const PROVIDERS = new Set(['yeastar', 'africastalking']);

const PROVIDER_LABELS = {
  yeastar: 'Yeastar',
  africastalking: "Africa's Talking",
};

function resolveActiveProvider(voice) {
  const active = String(voice.activeProvider || voice.provider || '').trim();
  return PROVIDERS.has(active) ? active : '';
}

function providerConfigured(name, config) {
  if (name === 'yeastar') return isYeastarConfigured(config);
  if (name === 'africastalking') return isAfricasTalkingConfigured(getVoiceConfig(config));
  return false;
}

async function getActiveDialerStatus() {
  const config = await getSystemConfig({ mask: false });
  const voice = getVoiceConfig(config);
  const activeProvider = resolveActiveProvider(voice);
  return {
    activeProvider: activeProvider || null,
    label: activeProvider ? PROVIDER_LABELS[activeProvider] : 'None',
    yeastarConfigured: isYeastarConfigured(config),
    africastalkingConfigured: isAfricasTalkingConfigured(voice),
    ready: Boolean(activeProvider && providerConfigured(activeProvider, config)),
  };
}

/**
 * Start an outbound portfolio call using the system-wide active dialer.
 * Same provider for every call center — call_centers.voice_provider is ignored.
 */
async function startOutboundCall(user, { debtor, simCardId = null } = {}) {
  const config = await getSystemConfig({ mask: false });
  const voice = getVoiceConfig(config);
  const provider = resolveActiveProvider(voice);

  if (!provider) {
    const err = new Error(
      'No active voice dialer is selected. A system admin must choose Yeastar or Africa\'s Talking under System Configurations → Communication (applies to all call centers).'
    );
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  if (!providerConfigured(provider, config)) {
    const label = PROVIDER_LABELS[provider];
    const err = new Error(
      `${label} is the active dialer but credentials are incomplete. Configure them under System Configurations → Communication.`
    );
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  if (provider === 'yeastar') {
    const result = await initiateYeastarOutboundCall(user, { debtor });
    return {
      ...result,
      dialerProvider: 'yeastar',
      dialerLabel: PROVIDER_LABELS.yeastar,
      usedFallback: false,
    };
  }

  const result = await initiateAtOutboundCall(user, { debtor, simCardId });
  return {
    ...result,
    dialerProvider: 'africastalking',
    dialerLabel: PROVIDER_LABELS.africastalking,
    usedFallback: false,
  };
}

/**
 * Admin test call through the active dialer (or an explicit provider override).
 */
async function testOutboundCall(user, payload = {}) {
  const config = await getSystemConfig({ mask: false });
  const voice = getVoiceConfig(config);
  const requested = String(payload.provider || '').trim();
  const provider = PROVIDERS.has(requested) ? requested : resolveActiveProvider(voice);

  if (!provider) {
    const err = new Error('Select an active dialer before testing a call.');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  if (!providerConfigured(provider, config)) {
    const err = new Error(
      `${PROVIDER_LABELS[provider]} credentials are incomplete. Save credentials first, then test.`
    );
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const toPhone = normalizePhone(payload.to || payload.toPhone || payload.callee);
  if (!toPhone) {
    const err = new Error('Enter a destination phone number to call.');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  if (provider === 'yeastar') {
    return testYeastarCall(user, config, toPhone, payload.callerExtension);
  }
  return testAfricasTalkingCall(user, voice, toPhone, payload.agentPhone);
}

async function testYeastarCall(user, config, toPhone, callerExtension) {
  const y = getYeastarConfig(config);
  const extension =
    String(callerExtension || '').trim() || (await resolveAgentExtension(user));
  if (!extension) {
    const err = new Error(
      'Enter a Yeastar extension to place the test call from (or set one on your user profile).'
    );
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const callee = toPhone.replace(/^\+/, '');
  const clientRequestId = `ys-test-${user.id}-${Date.now()}`;

  const [insert] = await pool.query(
    `INSERT INTO voice_calls
      (debtor_id, agent_id, sim_card_id, direction, provider, client_request_id,
       from_number, to_number, agent_number, debtor_number, status, started_at)
     VALUES (NULL, ?, NULL, 'outbound', 'yeastar', ?, ?, ?, ?, ?, 'queued', CURRENT_TIMESTAMP)`,
    [user.id, clientRequestId, extension, callee, extension, toPhone]
  );
  const callId = insert.insertId;

  try {
    const accessToken = await getAccessToken(config);
    const data = await fetchYeastarJson(y, 'call/dial', {
      method: 'POST',
      accessToken,
      body: { caller: extension, callee },
    });

    if (data?.errcode !== 0) {
      const err = new Error(data?.errmsg || 'Yeastar test dial failed');
      err.code = 'SEND_FAILED';
      err.status = 502;
      err.detail = data;
      throw err;
    }

    await pool.query(
      `UPDATE voice_calls SET provider_session_id = ?, status = 'initiated' WHERE id = ?`,
      [data.call_id || null, callId]
    );

    return {
      ok: true,
      dialerProvider: 'yeastar',
      dialerLabel: PROVIDER_LABELS.yeastar,
      call: await getVoiceCallById(callId),
      next: `Test call started via Yeastar. Answer extension ${extension} — you will be connected to ${toPhone}.`,
    };
  } catch (error) {
    await pool.query(
      `UPDATE voice_calls SET status = 'failed', ended_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [callId]
    );
    throw error;
  }
}

async function testAfricasTalkingCall(user, voice, toPhone, agentPhoneRaw) {
  assertVoiceConfigured(voice);

  let agentPhone = normalizePhone(agentPhoneRaw);
  if (!agentPhone) {
    const [simRows] = await pool.query(
      `SELECT phone_number FROM agent_sim_cards
       WHERE user_id = ? AND is_active = 1 AND supports_outbound = 1
       ORDER BY is_default DESC, id ASC LIMIT 1`,
      [user.id]
    );
    agentPhone = normalizePhone(simRows[0]?.phone_number);
  }
  if (!agentPhone) {
    const err = new Error(
      'Enter an agent phone number to ring first (or register an outbound SIM on your profile).'
    );
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const clientRequestId = `at-test-${user.id}-${Date.now()}`;
  const [insert] = await pool.query(
    `INSERT INTO voice_calls
      (debtor_id, agent_id, sim_card_id, direction, provider, client_request_id,
       from_number, to_number, agent_number, debtor_number, status, started_at)
     VALUES (NULL, ?, NULL, 'outbound', 'africastalking', ?, ?, ?, ?, ?, 'queued', CURRENT_TIMESTAMP)`,
    [user.id, clientRequestId, voice.voiceNumber, agentPhone, agentPhone, toPhone]
  );
  const callId = insert.insertId;

  try {
    const atResponse = await callAtVoiceApi(voice, {
      callTo: agentPhone,
      callFrom: voice.voiceNumber,
      clientRequestId,
    });

    const entry = Array.isArray(atResponse?.entries) ? atResponse.entries[0] : null;
    await pool.query(
      `UPDATE voice_calls SET provider_session_id = ?, status = ? WHERE id = ?`,
      [entry?.sessionId || null, String(entry?.status || 'Queued').toLowerCase(), callId]
    );

    return {
      ok: true,
      dialerProvider: 'africastalking',
      dialerLabel: PROVIDER_LABELS.africastalking,
      call: await getVoiceCallById(callId),
      next: `Test call started via Africa's Talking. Answer ${agentPhone} — you will be connected to ${toPhone}.`,
    };
  } catch (error) {
    await pool.query(
      `UPDATE voice_calls SET status = 'failed', ended_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [callId]
    );
    throw error;
  }
}

module.exports = {
  startOutboundCall,
  testOutboundCall,
  getActiveDialerStatus,
  resolveActiveProvider,
  PROVIDERS,
  PROVIDER_LABELS,
};
