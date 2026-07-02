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

function normalizeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    roleId: row.role_id,
    roleName: row.role_name,
    isSystemAdmin: Boolean(row.is_system_admin),
    permissionOverrides: parseJson(row.permission_overrides, null),
    isActive: Boolean(row.is_active),
    mustResetPassword: Boolean(row.must_reset_password),
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

async function listUsers() {
  const [rows] = await pool.query(`
    SELECT u.*, r.name AS role_name, r.is_system_admin
    FROM users u
    JOIN roles r ON u.role_id = r.id
    ORDER BY u.name ASC
  `);

  return rows.map(normalizeUser);
}

async function listUsersPaginated({ draw = 1, start = 0, length = 10, search = '' } = {}) {
  const searchValue = search.trim();
  const baseFrom = `
    FROM users u
    JOIN roles r ON u.role_id = r.id
  `;
  const whereClause = searchValue
    ? ' WHERE u.name LIKE ? OR u.email LIKE ? OR r.name LIKE ?'
    : '';
  const searchParams = searchValue
    ? [`%${searchValue}%`, `%${searchValue}%`, `%${searchValue}%`]
    : [];

  const [countAllRows] = await pool.query(`SELECT COUNT(*) AS total ${baseFrom}`);
  const countFilteredRows = searchValue
    ? (
        await pool.query(`SELECT COUNT(*) AS total ${baseFrom}${whereClause}`, searchParams)
      )[0]
    : countAllRows;

  const [rows] = await pool.query(
    `SELECT u.*, r.name AS role_name, r.is_system_admin ${baseFrom}${whereClause} ORDER BY u.name ASC LIMIT ? OFFSET ?`,
    [...searchParams, Number(length), Number(start)]
  );

  return {
    draw: Number(draw),
    recordsTotal: Number(countAllRows[0]?.total ?? 0),
    recordsFiltered: Number(countFilteredRows[0]?.total ?? 0),
    data: rows.map(normalizeUser),
  };
}

async function getUserById(id) {
  const [rows] = await pool.query(`
    SELECT u.*, r.name AS role_name, r.is_system_admin
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = ?
  `, [id]);

  return rows.length ? normalizeUser(rows[0]) : null;
}

async function getUserByEmail(email) {
  const [rows] = await pool.query(
    `
    SELECT u.*, r.name AS role_name, r.is_system_admin
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.email = ?
    LIMIT 1
  `,
    [email]
  );

  return rows.length ? normalizeUser(rows[0]) : null;
}

async function createUser({
  name,
  email,
  roleId,
  permissionOverrides,
  isActive = true,
  phone = null,
  password = null,
}) {
  const { hashPassword } = require('./passwordService');
  const passwordHash = password ? hashPassword(password) : null;
  const mustResetPassword = Boolean(password);

  const [result] = await pool.query(
    `INSERT INTO users (name, email, role_id, permission_overrides, is_active, phone, password_hash, must_reset_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      email,
      roleId,
      permissionOverrides ? JSON.stringify(permissionOverrides) : null,
      isActive,
      phone || null,
      passwordHash,
      mustResetPassword,
    ]
  );

  return getUserById(result.insertId);
}

async function updateUser(
  id,
  { name, email, roleId, permissionOverrides, isActive, phone, password }
) {
  const user = await getUserById(id);
  if (!user) return null;

  const { hashPassword } = require('./passwordService');
  let passwordHash = undefined;
  let mustResetPassword = undefined;

  if (password) {
    passwordHash = hashPassword(password);
    mustResetPassword = true;
  }

  await pool.query(
    `UPDATE users SET
      name = ?,
      email = ?,
      role_id = ?,
      permission_overrides = ?,
      is_active = ?,
      phone = ?,
      password_hash = COALESCE(?, password_hash),
      must_reset_password = COALESCE(?, must_reset_password)
     WHERE id = ?`,
    [
      name ?? user.name,
      email ?? user.email,
      roleId ?? user.roleId,
      permissionOverrides !== undefined
        ? permissionOverrides
          ? JSON.stringify(permissionOverrides)
          : null
        : user.permissionOverrides
          ? JSON.stringify(user.permissionOverrides)
          : null,
      isActive ?? user.isActive,
      phone !== undefined ? phone || null : user.phone,
      passwordHash ?? null,
      mustResetPassword ?? null,
      id,
    ]
  );

  return getUserById(id);
}

async function deleteUser(id) {
  const user = await getUserById(id);
  if (!user) return { error: 'User not found' };

  await pool.query('DELETE FROM users WHERE id = ?', [id]);
  return { success: true };
}

async function getUserEffectivePermissions(userId) {
  const user = await getUserById(userId);
  if (!user) return null;

  const role = await getRoleById(user.roleId);
  return getEffectivePermissions(
    { isSystemAdmin: role.isSystemAdmin, permissions: role.permissions },
    user.permissionOverrides
  );
}

module.exports = {
  getPermissionRegistry,
  listRoles,
  listRolesPaginated,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  listUsers,
  listUsersPaginated,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  getEffectivePermissions,
  getUserEffectivePermissions,
  buildEmptyPermissions,
  buildFullPermissions,
};
