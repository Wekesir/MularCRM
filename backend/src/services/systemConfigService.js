const pool = require('../db/pool');
const { DEFAULT_SYSTEM_CONFIG } = require('../config/defaultSystemConfig');

/** Dot-path secret fields relative to the root config object. */
const SECRET_FIELD_PATHS = [
  ['email', 'resendApiKey'],
  ['email', 'smtpPassword'],
  ['sms', 'apiKey'],
  ['voice', 'apiKey'],
  ['voice', 'yeastar', 'clientSecret'],
  ['voice', 'yeastar', 'integrationApiKey'],
  ['backup', 'googleDrive', 'serviceAccountKey'],
];

function getAtPath(obj, path) {
  return path.reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setAtPath(obj, path, value) {
  let cursor = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
}

function deepMerge(base, updates) {
  const result = { ...base };

  for (const key of Object.keys(updates)) {
    if (
      updates[key] &&
      typeof updates[key] === 'object' &&
      !Array.isArray(updates[key]) &&
      base[key]
    ) {
      result[key] = deepMerge(base[key], updates[key]);
    } else {
      result[key] = updates[key];
    }
  }

  return result;
}

/** Mask apiKey on each livePayments.clients[] entry; preserve by clientId on save. */
function maskLivePaymentsClientSecrets(masked) {
  const clients = masked?.integrations?.livePayments?.clients;
  if (!Array.isArray(clients)) return;

  masked.integrations.livePayments.clients = clients.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const next = { ...entry };
    if (next.apiKey) {
      next.apiKey = '';
      next.apiKeySet = true;
    } else {
      next.apiKeySet = Boolean(next.apiKeySet);
    }
    return next;
  });
}

function preserveLivePaymentsClientSecrets(existing, incoming, merged) {
  const incomingClients = incoming?.integrations?.livePayments?.clients;
  if (!Array.isArray(incomingClients)) return;

  const existingByClientId = new Map();
  for (const entry of existing?.integrations?.livePayments?.clients || []) {
    if (entry?.clientId != null) {
      existingByClientId.set(Number(entry.clientId), entry);
    }
  }

  const mergedClients = merged?.integrations?.livePayments?.clients;
  if (!Array.isArray(mergedClients)) return;

  merged.integrations.livePayments.clients = mergedClients.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const next = { ...entry };
    const prev = existingByClientId.get(Number(next.clientId));
    if (!next.apiKey && prev?.apiKey) {
      next.apiKey = prev.apiKey;
    }
    delete next.apiKeySet;
    return next;
  });
}

function maskSecrets(config) {
  const masked = JSON.parse(JSON.stringify(config));

  for (const path of SECRET_FIELD_PATHS) {
    const parentPath = path.slice(0, -1);
    const field = path[path.length - 1];
    const parent = getAtPath(masked, parentPath);
    if (!parent || typeof parent !== 'object') continue;

    if (parent[field]) {
      parent[field] = '';
      parent[`${field}Set`] = true;
    } else {
      parent[`${field}Set`] = false;
    }
  }

  maskLivePaymentsClientSecrets(masked);
  return masked;
}

function preserveSecrets(existing, incoming) {
  const merged = deepMerge(existing, incoming);

  for (const path of SECRET_FIELD_PATHS) {
    const incomingValue = getAtPath(incoming, path);
    const existingValue = getAtPath(existing, path);
    if (!incomingValue && existingValue) {
      setAtPath(merged, path, existingValue);
    }
  }

  // Arrays replace wholesale in deepMerge — re-apply client apiKeys by clientId.
  if (incoming?.integrations?.livePayments?.clients) {
    if (!merged.integrations) merged.integrations = {};
    if (!merged.integrations.livePayments) {
      merged.integrations.livePayments = {
        ...(existing.integrations?.livePayments || {}),
      };
    }
    merged.integrations.livePayments.clients = incoming.integrations.livePayments.clients;
    preserveLivePaymentsClientSecrets(existing, incoming, merged);
  }

  return merged;
}

async function getSystemConfig({ mask = true } = {}) {
  const [rows] = await pool.query('SELECT config FROM system_config WHERE id = 1');

  if (rows.length === 0) {
    return mask ? maskSecrets(DEFAULT_SYSTEM_CONFIG) : DEFAULT_SYSTEM_CONFIG;
  }

  const config =
    typeof rows[0].config === 'string'
      ? JSON.parse(rows[0].config)
      : rows[0].config;

  const merged = deepMerge(DEFAULT_SYSTEM_CONFIG, config);
  return mask ? maskSecrets(merged) : merged;
}

async function updateSystemConfig(updates) {
  const existing = await getSystemConfig({ mask: false });
  const merged = preserveSecrets(existing, updates);
  const serialized = JSON.stringify(merged);

  // Upsert so the config is always persisted even if the seed row is missing.
  await pool.query(
    'INSERT INTO system_config (id, config) VALUES (1, ?) ON DUPLICATE KEY UPDATE config = VALUES(config)',
    [serialized]
  );

  return maskSecrets(merged);
}

module.exports = { getSystemConfig, updateSystemConfig, maskSecrets };
