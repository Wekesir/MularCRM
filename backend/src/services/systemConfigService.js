const pool = require('../db/pool');
const { DEFAULT_SYSTEM_CONFIG } = require('../config/defaultSystemConfig');

const SECRET_FIELDS = {
  email: ['resendApiKey', 'smtpPassword'],
  sms: ['apiKey'],
};

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

function maskSecrets(config) {
  const masked = JSON.parse(JSON.stringify(config));

  for (const [section, fields] of Object.entries(SECRET_FIELDS)) {
    for (const field of fields) {
      if (masked[section]?.[field]) {
        masked[section][field] = '';
        masked[section][`${field}Set`] = true;
      } else if (masked[section]) {
        masked[section][`${field}Set`] = false;
      }
    }
  }

  return masked;
}

function preserveSecrets(existing, incoming) {
  const merged = deepMerge(existing, incoming);

  for (const [section, fields] of Object.entries(SECRET_FIELDS)) {
    for (const field of fields) {
      if (!incoming[section]?.[field] && existing[section]?.[field]) {
        merged[section][field] = existing[section][field];
      }
    }
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
