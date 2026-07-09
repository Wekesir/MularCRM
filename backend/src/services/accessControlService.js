const pool = require('../db/pool');
const {
  PERMISSION_REGISTRY,
  buildFullPermissions,
  buildEmptyPermissions,
} = require('../config/permissionRegistry');

function parseJson(value, fallback) {
  if (!value) return fallback;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function deepMergePermissions(base, overrides) {
  if (!overrides) return base;
  const result = JSON.parse(JSON.stringify(base));

  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !('create' in value) && result[key]) {
      result[key] = deepMergePermissions(result[key], value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function normalizeRole(row) {
  return {
    id: row.id,
    name: row.name,
    isSystemAdmin: Boolean(row.is_system_admin),
    permissions: parseJson(row.permissions, buildEmptyPermissions()),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getEffectivePermissions(role, overrides = null) {
  if (role.isSystemAdmin) {
    return buildFullPermissions();
  }

  const rolePerms = parseJson(role.permissions, buildEmptyPermissions());
  if (!overrides) return rolePerms;

  return deepMergePermissions(rolePerms, overrides);
}

function getPermissionRegistry() {
  return PERMISSION_REGISTRY;
}

async function listRoles() {
  const [rows] = await pool.query('SELECT * FROM roles ORDER BY name ASC');
  return rows.map(normalizeRole);
}

async function listRolesPaginated({ draw = 1, start = 0, length = 10, search = '' } = {}) {
  const searchValue = search.trim();
  const whereClause = searchValue ? ' WHERE name LIKE ?' : '';
  const searchParams = searchValue ? [`%${searchValue}%`] : [];

  const [countAllRows] = await pool.query('SELECT COUNT(*) AS total FROM roles');
  const countFilteredRows = searchValue
    ? (await pool.query(`SELECT COUNT(*) AS total FROM roles${whereClause}`, searchParams))[0]
    : countAllRows;

  const [rows] = await pool.query(
    `SELECT * FROM roles${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`,
    [...searchParams, Number(length), Number(start)]
  );

  return {
    draw: Number(draw),
    recordsTotal: Number(countAllRows[0]?.total ?? 0),
    recordsFiltered: Number(countFilteredRows[0]?.total ?? 0),
    data: rows.map(normalizeRole),
  };
}

async function getRoleById(id) {
  const [rows] = await pool.query('SELECT * FROM roles WHERE id = ?', [id]);
  return rows.length ? normalizeRole(rows[0]) : null;
}

async function createRole({ name, permissions }) {
  const [result] = await pool.query(
    'INSERT INTO roles (name, is_system_admin, permissions) VALUES (?, FALSE, ?)',
    [name, JSON.stringify(permissions || buildEmptyPermissions())]
  );

  return getRoleById(result.insertId);
}

async function updateRole(id, { name, permissions }) {
  const role = await getRoleById(id);
  if (!role) return null;

  if (role.isSystemAdmin) {
    await pool.query('UPDATE roles SET name = ? WHERE id = ?', [name || role.name, id]);
    return getRoleById(id);
  }

  await pool.query('UPDATE roles SET name = ?, permissions = ? WHERE id = ?', [
    name || role.name,
    JSON.stringify(permissions || role.permissions),
    id,
  ]);

  return getRoleById(id);
}

async function deleteRole(id) {
  const role = await getRoleById(id);
  if (!role) return { error: 'Role not found' };
  if (role.isSystemAdmin) return { error: 'System Admin role cannot be deleted' };

  const [users] = await pool.query('SELECT COUNT(*) AS count FROM users WHERE role_id = ?', [id]);
  if (users[0].count > 0) {
    return { error: 'Role is assigned to users and cannot be deleted' };
  }

  await pool.query('DELETE FROM roles WHERE id = ?', [id]);
  return { success: true };
}

module.exports = {
  getPermissionRegistry,
  listRoles,
  listRolesPaginated,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getEffectivePermissions,
  buildEmptyPermissions,
  buildFullPermissions,
};

