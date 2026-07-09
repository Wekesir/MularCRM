const pool = require('../db/pool');

function normalizeLevel(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code || null,
    description: row.description || null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listAgentExperienceLevels({ includeInactive = true } = {}) {
  const sql = includeInactive
    ? 'SELECT * FROM agent_experience_levels ORDER BY name ASC'
    : 'SELECT * FROM agent_experience_levels WHERE is_active = 1 ORDER BY name ASC';
  const [rows] = await pool.query(sql);
  return rows.map(normalizeLevel);
}

async function getAgentExperienceLevelById(id) {
  const [rows] = await pool.query('SELECT * FROM agent_experience_levels WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? normalizeLevel(rows[0]) : null;
}

async function getAgentExperienceLevelByName(name) {
  const [rows] = await pool.query('SELECT * FROM agent_experience_levels WHERE name = ? LIMIT 1', [name]);
  return rows[0] ? normalizeLevel(rows[0]) : null;
}

function validateInput(data, { partial = false } = {}) {
  const errors = [];
  if (!partial || data.name !== undefined) {
    if (!data.name || !String(data.name).trim()) errors.push('Name is required');
    else if (String(data.name).trim().length > 120) errors.push('Name must be 120 characters or fewer');
  }
  if (data.code !== undefined && data.code && String(data.code).length > 48) {
    errors.push('Code must be 48 characters or fewer');
  }
  if (data.description !== undefined && data.description && String(data.description).length > 255) {
    errors.push('Description must be 255 characters or fewer');
  }
  return errors;
}

async function createAgentExperienceLevel(data) {
  const errors = validateInput(data);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const name = String(data.name).trim();
  const existing = await getAgentExperienceLevelByName(name);
  if (existing) {
    const err = new Error(`Experience level "${name}" already exists`);
    err.code = 'DUPLICATE';
    throw err;
  }

  const [result] = await pool.query(
    'INSERT INTO agent_experience_levels (name, code, description, is_active) VALUES (?, ?, ?, ?)',
    [
      name,
      data.code ? String(data.code).trim() : null,
      data.description ? String(data.description).trim() : null,
      data.isActive === false ? 0 : 1,
    ]
  );

  return getAgentExperienceLevelById(result.insertId);
}

async function updateAgentExperienceLevel(id, data) {
  const existing = await getAgentExperienceLevelById(id);
  if (!existing) return null;

  const errors = validateInput(data, { partial: true });
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  let name = existing.name;
  if (data.name !== undefined && String(data.name).trim() !== existing.name) {
    name = String(data.name).trim();
    const clash = await getAgentExperienceLevelByName(name);
    if (clash && clash.id !== Number(id)) {
      const err = new Error(`Experience level "${name}" already exists`);
      err.code = 'DUPLICATE';
      throw err;
    }
  }

  await pool.query(
    'UPDATE agent_experience_levels SET name = ?, code = ?, description = ?, is_active = ? WHERE id = ?',
    [
      name,
      data.code !== undefined ? (data.code ? String(data.code).trim() : null) : existing.code,
      data.description !== undefined ? (data.description ? String(data.description).trim() : null) : existing.description,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      id,
    ]
  );

  return getAgentExperienceLevelById(id);
}

async function deleteAgentExperienceLevel(id) {
  const existing = await getAgentExperienceLevelById(id);
  if (!existing) return { deleted: false };
  await pool.query('DELETE FROM agent_experience_levels WHERE id = ?', [id]);
  return { deleted: true, id: Number(id) };
}

module.exports = {
  listAgentExperienceLevels,
  getAgentExperienceLevelById,
  getAgentExperienceLevelByName,
  createAgentExperienceLevel,
  updateAgentExperienceLevel,
  deleteAgentExperienceLevel,
};
