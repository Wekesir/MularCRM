const pool = require('../db/pool');
const {
  getRoleById,
  getEffectivePermissions,
} = require('./accessControlService');

function parseJson(value, fallback) {
  if (!value) return fallback;
  return typeof value === 'string' ? JSON.parse(value) : value;
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
    deletedAt: row.deleted_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listUsers() {
  const [rows] = await pool.query(`
    SELECT u.*, r.name AS role_name, r.is_system_admin
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.deleted_at IS NULL
    ORDER BY u.name ASC
  `);

  return rows.map(normalizeUser);
}

async function listUsersPaginated({ draw = 1, start = 0, length = 10, search = '' } = {}) {
  const searchValue = search.trim();
  const baseFrom = `
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.deleted_at IS NULL
  `;
  const searchClause = searchValue
    ? ' AND (u.name LIKE ? OR u.email LIKE ? OR r.name LIKE ?)'
    : '';
  const searchParams = searchValue
    ? [`%${searchValue}%`, `%${searchValue}%`, `%${searchValue}%`]
    : [];

  const [countAllRows] = await pool.query(`SELECT COUNT(*) AS total ${baseFrom}`);
  const countFilteredRows = searchValue
    ? (
        await pool.query(`SELECT COUNT(*) AS total ${baseFrom}${searchClause}`, searchParams)
      )[0]
    : countAllRows;

  const [rows] = await pool.query(
    `SELECT u.*, r.name AS role_name, r.is_system_admin ${baseFrom}${searchClause} ORDER BY u.name ASC LIMIT ? OFFSET ?`,
    [...searchParams, Number(length), Number(start)]
  );

  return {
    draw: Number(draw),
    recordsTotal: Number(countAllRows[0]?.total ?? 0),
    recordsFiltered: Number(countFilteredRows[0]?.total ?? 0),
    data: rows.map(normalizeUser),
  };
}

async function listDeletedUsers() {
  const [rows] = await pool.query(`
    SELECT u.*, r.name AS role_name, r.is_system_admin
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.deleted_at IS NOT NULL
    ORDER BY u.deleted_at DESC
  `);

  return rows.map(normalizeUser);
}

async function listDeletedUsersPaginated({
  draw = 1,
  start = 0,
  length = 10,
  search = '',
} = {}) {
  const searchValue = search.trim();
  const baseFrom = `
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.deleted_at IS NOT NULL
  `;
  const searchClause = searchValue
    ? ' AND (u.name LIKE ? OR u.email LIKE ? OR r.name LIKE ?)'
    : '';
  const searchParams = searchValue
    ? [`%${searchValue}%`, `%${searchValue}%`, `%${searchValue}%`]
    : [];

  const [countAllRows] = await pool.query(`SELECT COUNT(*) AS total ${baseFrom}`);
  const countFilteredRows = searchValue
    ? (
        await pool.query(`SELECT COUNT(*) AS total ${baseFrom}${searchClause}`, searchParams)
      )[0]
    : countAllRows;

  const [rows] = await pool.query(
    `SELECT u.*, r.name AS role_name, r.is_system_admin ${baseFrom}${searchClause} ORDER BY u.deleted_at DESC LIMIT ? OFFSET ?`,
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
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    if (existing.deletedAt) {
      return {
        error: 'This email belongs to a deleted user. Restore them instead.',
        code: 'USER_DELETED',
        deletedUserId: existing.id,
        deletedName: existing.name,
        email: existing.email,
      };
    }
    return {
      error: 'A user with this email already exists.',
      code: 'USER_EXISTS',
      email: existing.email,
    };
  }

  const { hashPassword } = require('./passwordService');
  const passwordHash = password ? hashPassword(password) : null;
  const mustResetPassword = Boolean(password);

  const [result] = await pool.query(
    `INSERT INTO users (name, email, role_id, permission_overrides, is_active, phone, password_hash, must_reset_password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      normalizedEmail,
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
  if (user.deletedAt) return { error: 'User is already deleted' };

  await pool.query(
    'UPDATE users SET is_active = FALSE, deleted_at = NOW() WHERE id = ?',
    [id]
  );
  return {
    success: true,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
  };
}

async function restoreUser(id) {
  const user = await getUserById(id);
  if (!user) return { error: 'User not found' };
  if (!user.deletedAt) return { error: 'User is not deleted' };

  await pool.query(
    'UPDATE users SET is_active = TRUE, deleted_at = NULL WHERE id = ?',
    [id]
  );

  return { success: true, user: await getUserById(id) };
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
  normalizeUser,
  listUsers,
  listUsersPaginated,
  listDeletedUsers,
  listDeletedUsersPaginated,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
  getUserEffectivePermissions,
};
