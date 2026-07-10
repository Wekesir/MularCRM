/**
 * Live Payments API integration
 * ─────────────────────────────────────────────────────────────────────────────
 * OMNICRM POSTs `{ "date": "YYYY-MM-DD" }` to each configured client's endpoint
 * and imports the JSON response using the SAME field contract as the debtor CSV
 * bulk-upload template (31 snake_case headers — see debtorImportShared.COLUMNS).
 *
 * Case file (CFID) behaviour for API pulls:
 *   • One debtor_files row per client per calendar day (batch_date).
 *   • If none exists for that day, create it; otherwise append to it.
 *   • New loan_ids get that day's file_id / cfid.
 *   • Existing (client_id, loan_id) rows are updated in place and KEEP their
 *     original cfid/file_id (same upsert rules as CSV re-upload).
 *
 * Expected response shapes:
 *   { "date": "…", "debtors": [ { "full_name": "…", "loan_id": "…", … } ] }
 *   or a bare JSON array of debtor objects.
 *
 * Auth: Authorization: Bearer <apiKey> (header name configurable per client).
 *
 * Poll frequency (integrations.livePayments.frequency): every_1_min | every_5_min |
 * every_15_min | every_30_min | hourly | daily — shorter intervals approximate
 * near-realtime payment visibility for collection agents.
 */
const { getSystemConfig } = require('./systemConfigService');
const {
  findOrCreateDebtorFileForClientDay,
} = require('./debtorService');
const { importDebtorRows, COLUMNS, MAX_DATA_ROWS } = require('./debtorImportShared');

let lastStatus = {
  running: false,
  ok: null,
  startedAt: null,
  finishedAt: null,
  triggeredBy: null,
  message: null,
  results: [],
};

function getLastLivePaymentsStatus() {
  return { ...lastStatus, results: [...(lastStatus.results || [])] };
}

function setStatus(patch) {
  lastStatus = { ...lastStatus, ...patch };
}

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function todayInTimezone(timezone = 'Africa/Nairobi') {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function normalizeDate(value) {
  if (!value) return null;
  const s = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function extractDebtorRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.debtors)) return payload.debtors;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.rows)) return payload.rows;
  }
  return null;
}

function getLivePaymentsConfig(config) {
  return config?.integrations?.livePayments || { enabled: false, frequency: 'daily', clients: [] };
}

function listEnabledClientConfigs(livePayments, { clientId = null } = {}) {
  const clients = Array.isArray(livePayments.clients) ? livePayments.clients : [];
  return clients.filter((c) => {
    if (!c || !c.enabled) return false;
    if (!c.endpointUrl) return false;
    if (clientId != null && Number(c.clientId) !== Number(clientId)) return false;
    return true;
  });
}

async function fetchDebtorsFromEndpoint(clientConfig, date) {
  const url = String(clientConfig.endpointUrl || '').trim();
  if (!url) throw httpError('Endpoint URL is required', 400);

  const apiKey = String(clientConfig.apiKey || '').trim();
  const headerName = String(clientConfig.authHeader || 'Authorization').trim() || 'Authorization';
  const timeoutMs = Number(clientConfig.timeoutMs) || 30000;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey) {
    headers[headerName] =
      headerName.toLowerCase() === 'authorization' && !/^bearer\s/i.test(apiKey)
        ? `Bearer ${apiKey}`
        : apiKey;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ date }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw httpError(`Request timed out after ${timeoutMs}ms`, 504);
    }
    throw httpError(`Failed to reach endpoint: ${err.message}`, 502);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw httpError(
      `Endpoint returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`,
      502
    );
  }

  if (!response.ok) {
    const msg =
      json?.message || json?.error || `Endpoint returned HTTP ${response.status}`;
    throw httpError(msg, 502);
  }

  const rows = extractDebtorRows(json);
  if (!rows) {
    throw httpError(
      'Endpoint response must be a JSON array of debtors or an object with a debtors/data/rows array',
      502
    );
  }

  return rows;
}

/**
 * Pull live payments for one client config and import into the day's CFID.
 */
async function pullLivePaymentsForClient(clientConfig, {
  date,
  userId = null,
  triggeredBy = 'manual',
} = {}) {
  const batchDate = normalizeDate(date);
  if (!batchDate) throw httpError('date must be YYYY-MM-DD', 400);

  const clientId = Number(clientConfig.clientId);
  if (!Number.isFinite(clientId)) throw httpError('clientId is required', 400);

  const rows = await fetchDebtorsFromEndpoint(clientConfig, batchDate);

  const { id: fileId, cfid, created: fileCreated } = await findOrCreateDebtorFileForClientDay({
    clientId,
    batchDate,
    debtCategoryId: clientConfig.debtCategoryId ?? null,
    debtTypeId: clientConfig.debtTypeId ?? null,
    currencyId: clientConfig.currencyId ?? null,
    uploadedBy: userId,
    source: 'api',
  });

  const importResult = await importDebtorRows(rows, {
    clientId,
    debtCategoryId: clientConfig.debtCategoryId != null ? Number(clientConfig.debtCategoryId) || null : null,
    debtTypeId: clientConfig.debtTypeId != null ? Number(clientConfig.debtTypeId) || null : null,
    currencyId: clientConfig.currencyId != null ? Number(clientConfig.currencyId) || null : null,
    userId,
    fileId,
    cfid,
    maxRows: MAX_DATA_ROWS,
    replaceStats: fileCreated,
  });

  return {
    clientId,
    date: batchDate,
    fileId,
    cfid,
    fileCreated,
    triggeredBy,
    rowCount: rows.length,
    ...importResult,
  };
}

async function runLivePaymentsPull({
  clientId = null,
  date = null,
  userId = null,
  triggeredBy = 'manual',
} = {}) {
  if (lastStatus.running) {
    throw httpError('A live payments pull is already running', 409);
  }

  const timezone = process.env.AUTH_SESSION_TIMEZONE || 'Africa/Nairobi';
  const batchDate = normalizeDate(date) || todayInTimezone(timezone);

  setStatus({
    running: true,
    ok: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    triggeredBy,
    message: 'Pulling live payments…',
    results: [],
  });

  try {
    const config = await getSystemConfig({ mask: false });
    const livePayments = getLivePaymentsConfig(config);
    const targets = listEnabledClientConfigs(livePayments, { clientId });

    if (targets.length === 0) {
      throw httpError(
        clientId != null
          ? 'No enabled live-payments config found for that client'
          : 'No enabled live-payments client configs found',
        400
      );
    }

    const results = [];
    for (const entry of targets) {
      try {
        const result = await pullLivePaymentsForClient(entry, {
          date: batchDate,
          userId,
          triggeredBy,
        });
        results.push({ ok: true, ...result });
      } catch (err) {
        results.push({
          ok: false,
          clientId: Number(entry.clientId),
          date: batchDate,
          message: err.message,
        });
      }
    }

    const allOk = results.every((r) => r.ok);
    const anyOk = results.some((r) => r.ok);
    setStatus({
      running: false,
      ok: allOk,
      finishedAt: new Date().toISOString(),
      message: allOk
        ? `Pulled ${results.length} client(s) for ${batchDate}`
        : anyOk
          ? `Completed with errors for ${batchDate}`
          : `All pulls failed for ${batchDate}`,
      results,
    });

    return {
      date: batchDate,
      ok: allOk,
      results,
      message: lastStatus.message,
    };
  } catch (err) {
    setStatus({
      running: false,
      ok: false,
      finishedAt: new Date().toISOString(),
      message: err.message,
      results: [],
    });
    throw err;
  }
}

async function testLivePaymentsConnection(clientConfig) {
  const date = todayInTimezone();
  const rows = await fetchDebtorsFromEndpoint(clientConfig, date);
  return {
    ok: true,
    date,
    rowCount: rows.length,
    sampleKeys: rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]).slice(0, 12) : [],
    expectedHeaders: COLUMNS.map((c) => c.header),
    message: `Reached endpoint; received ${rows.length} debtor row(s) for ${date}`,
  };
}

module.exports = {
  runLivePaymentsPull,
  pullLivePaymentsForClient,
  testLivePaymentsConnection,
  getLastLivePaymentsStatus,
  getLivePaymentsConfig,
  listEnabledClientConfigs,
  todayInTimezone,
  normalizeDate,
  COLUMNS,
};
