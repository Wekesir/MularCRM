const pool = require('../db/pool');
const { getSystemConfig } = require('./systemConfigService');
const { getVoiceConfig, getVoiceCallById, normalizePhone } = require('./africasTalkingVoiceService');
const { recordActivityEvent } = require('./activityService');

let tokenCache = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
};

function getYeastarConfig(config) {
  const voice = getVoiceConfig(config);
  const y = voice.yeastar || {};
  return {
    enabled: y.enabled !== false && Boolean(String(y.baseUrl || '').trim()),
    baseUrl: String(y.baseUrl || '').replace(/\/$/, ''),
    apiPath: String(y.apiPath || 'openapi/v1.0').replace(/^\/+|\/+$/g, ''),
    clientId: String(y.clientId || '').trim(),
    clientSecret: String(y.clientSecret || '').trim(),
    integrationApiKey: String(y.integrationApiKey || '').trim(),
    appBaseUrl: voice.appBaseUrl || '',
  };
}

function isYeastarConfigured(configOrVoice) {
  const config = configOrVoice?.voice ? configOrVoice : { voice: configOrVoice };
  const y = getYeastarConfig(config);
  return Boolean(y.baseUrl && y.clientId && y.clientSecret);
}

function assertYeastarConfigured(config) {
  if (!isYeastarConfigured(config)) {
    const err = new Error(
      'Yeastar Voice is not configured. Set base URL, Client ID, and Client Secret under System Configurations → Communication.'
    );
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
}

function openApiUrl(y, path, query = {}) {
  const qs = new URLSearchParams(query).toString();
  const base = `${y.baseUrl}/${y.apiPath}/${String(path).replace(/^\//, '')}`;
  return qs ? `${base}?${qs}` : base;
}

async function fetchYeastarJson(y, path, { method = 'GET', body, accessToken } = {}) {
  const url = accessToken
    ? openApiUrl(y, path, { access_token: accessToken })
    : openApiUrl(y, path);
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'OpenAPI',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const err = new Error(data?.errmsg || data?.message || `Yeastar API failed (${response.status})`);
    err.code = 'SEND_FAILED';
    err.status = 502;
    err.detail = data;
    throw err;
  }
  return data;
}

async function getAccessToken(config, { force = false } = {}) {
  const y = getYeastarConfig(config);
  assertYeastarConfigured(config);

  const now = Date.now();
  if (!force && tokenCache.accessToken && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  if (!force && tokenCache.refreshToken && tokenCache.expiresAt > now) {
    try {
      const refreshed = await fetchYeastarJson(y, 'refresh_token', {
        method: 'POST',
        body: { refresh_token: tokenCache.refreshToken },
      });
      if (refreshed?.errcode === 0 && refreshed.access_token) {
        tokenCache = {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token || tokenCache.refreshToken,
          expiresAt: now + (Number(refreshed.access_token_expire_time) || 1800) * 1000,
        };
        return tokenCache.accessToken;
      }
    } catch {
      /* fall through to get_token */
    }
  }

  const data = await fetchYeastarJson(y, 'get_token', {
    method: 'POST',
    body: {
      username: y.clientId,
      password: y.clientSecret,
    },
  });

  if (data?.errcode !== 0 || !data.access_token) {
    const err = new Error(data?.errmsg || 'Failed to obtain Yeastar access token');
    err.code = 'SEND_FAILED';
    err.status = 502;
    err.detail = data;
    throw err;
  }

  tokenCache = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: now + (Number(data.access_token_expire_time) || 1800) * 1000,
  };
  return tokenCache.accessToken;
}

async function resolveAgentExtension(user) {
  if (user?.yeastarExtension) return String(user.yeastarExtension).trim();
  const [rows] = await pool.query(
    'SELECT yeastar_extension FROM users WHERE id = ? LIMIT 1',
    [Number(user.id)]
  );
  return rows[0]?.yeastar_extension ? String(rows[0].yeastar_extension).trim() : '';
}

/**
 * Originate outbound call: ring agent extension, then dial debtor (PBX handles bridge).
 */
async function initiateOutboundCall(user, { debtor }) {
  const config = await getSystemConfig({ mask: false });
  assertYeastarConfigured(config);
  const y = getYeastarConfig(config);

  const extension = await resolveAgentExtension(user);
  if (!extension) {
    const err = new Error(
      'No Yeastar extension assigned. Set Yeastar extension on the user profile under Users.'
    );
    err.code = 'YEASTAR_NO_EXTENSION';
    err.status = 400;
    throw err;
  }

  const debtorPhone = normalizePhone(debtor.phone);
  if (!debtorPhone) {
    const err = new Error('Debtor has no valid phone number on file');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  // Yeastar typically expects national/external digits without +
  const callee = debtorPhone.replace(/^\+/, '');
  const clientRequestId = `ys-out-${user.id}-${debtor.id}-${Date.now()}`;

  const [insert] = await pool.query(
    `INSERT INTO voice_calls
      (debtor_id, agent_id, sim_card_id, direction, provider, client_request_id,
       from_number, to_number, agent_number, debtor_number, status, started_at)
     VALUES (?, ?, NULL, 'outbound', 'yeastar', ?, ?, ?, ?, ?, 'queued', CURRENT_TIMESTAMP)`,
    [
      debtor.id,
      user.id,
      clientRequestId,
      extension,
      callee,
      extension,
      debtorPhone,
    ]
  );
  const callId = insert.insertId;

  try {
    const accessToken = await getAccessToken(config);
    const data = await fetchYeastarJson(y, 'call/dial', {
      method: 'POST',
      accessToken,
      body: {
        caller: extension,
        callee,
      },
    });

    if (data?.errcode !== 0) {
      const err = new Error(data?.errmsg || 'Yeastar dial failed');
      err.code = 'SEND_FAILED';
      err.status = 502;
      err.detail = data;
      throw err;
    }

    const sessionId = data.call_id || null;
    await pool.query(
      `UPDATE voice_calls SET provider_session_id = ?, status = ? WHERE id = ?`,
      [sessionId, 'initiated', callId]
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
        provider: 'yeastar',
        agentNumber: extension,
        debtorNumber: debtorPhone,
        status: 'initiated',
      },
    }).catch(() => {});

    return {
      call: await getVoiceCallById(callId),
      provider: data,
      next: 'Answer your Yeastar / Linkus extension — you will be connected to the debtor.',
      dialerProvider: 'yeastar',
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
  getYeastarConfig,
  isYeastarConfigured,
  assertYeastarConfigured,
  getAccessToken,
  initiateOutboundCall,
  resolveAgentExtension,
  fetchYeastarJson,
};
