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
    callCenterId: row.call_center_id != null ? Number(row.call_center_id) : null,
    callCenterName: row.call_center_name || null,
    regionId: row.region_id != null ? Number(row.region_id) : null,
    regionName: row.region_name || null,
    yeastarExtension: row.yeastar_extension ? String(row.yeastar_extension).trim() : null,
    deletedAt: row.deleted_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const USER_SELECT = `
  SELECT u.*, r.name AS role_name, r.is_system_admin,
         cc.name AS call_center_name, reg.name AS region_name
  FROM users u
  JOIN roles r ON u.role_id = r.id
  LEFT JOIN call_centers cc ON cc.id = u.call_center_id AND cc.deleted_at IS NULL
  LEFT JOIN regions reg ON reg.id = u.region_id
`;

async function listUsers() {
  const [rows] = await pool.query(`
    ${USER_SELECT}
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
    LEFT JOIN call_centers cc ON cc.id = u.call_center_id AND cc.deleted_at IS NULL
    LEFT JOIN regions reg ON reg.id = u.region_id
    WHERE u.deleted_at IS NULL
  `;
  const searchClause = searchValue
    ? ' AND (u.name LIKE ? OR u.email LIKE ? OR r.name LIKE ? OR cc.name LIKE ? OR reg.name LIKE ?)'
    : '';
  const searchParams = searchValue
    ? [
        `%${searchValue}%`,
        `%${searchValue}%`,
        `%${searchValue}%`,
        `%${searchValue}%`,
        `%${searchValue}%`,
      ]
    : [];

  const [countAllRows] = await pool.query(`SELECT COUNT(*) AS total ${baseFrom}`);
  const countFilteredRows = searchValue
    ? (
        await pool.query(`SELECT COUNT(*) AS total ${baseFrom}${searchClause}`, searchParams)
      )[0]
    : countAllRows;

  const [rows] = await pool.query(
    `SELECT u.*, r.name AS role_name, r.is_system_admin, cc.name AS call_center_name, reg.name AS region_name ${baseFrom}${searchClause} ORDER BY u.name ASC LIMIT ? OFFSET ?`,
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
    ${USER_SELECT}
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
    LEFT JOIN call_centers cc ON cc.id = u.call_center_id AND cc.deleted_at IS NULL
    LEFT JOIN regions reg ON reg.id = u.region_id
    WHERE u.deleted_at IS NOT NULL
  `;
  const searchClause = searchValue
    ? ' AND (u.name LIKE ? OR u.email LIKE ? OR r.name LIKE ? OR reg.name LIKE ?)'
    : '';
  const searchParams = searchValue
    ? [`%${searchValue}%`, `%${searchValue}%`, `%${searchValue}%`, `%${searchValue}%`]
    : [];

  const [countAllRows] = await pool.query(`SELECT COUNT(*) AS total ${baseFrom}`);
  const countFilteredRows = searchValue
    ? (
        await pool.query(`SELECT COUNT(*) AS total ${baseFrom}${searchClause}`, searchParams)
      )[0]
    : countAllRows;

  const [rows] = await pool.query(
    `SELECT u.*, r.name AS role_name, r.is_system_admin, cc.name AS call_center_name, reg.name AS region_name ${baseFrom}${searchClause} ORDER BY u.deleted_at DESC LIMIT ? OFFSET ?`,
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
  const [rows] = await pool.query(
    `${USER_SELECT}
     WHERE u.id = ?`,
    [id]
  );

  return rows.length ? normalizeUser(rows[0]) : null;
}

async function getUserByEmail(email) {
  const [rows] = await pool.query(
    `${USER_SELECT}
     WHERE u.email = ?
     LIMIT 1`,
    [email]
  );

  return rows.length ? normalizeUser(rows[0]) : null;
}

async function resolveRoleName(roleId) {
  const [rows] = await pool.query('SELECT name FROM roles WHERE id = ? LIMIT 1', [roleId]);
  return rows[0]?.name || null;
}

async function validateCallCenterForRole(roleName, callCenterId) {
  const { requiresCallCenter } = require('../config/orgRoles');
  if (!requiresCallCenter(roleName)) {
    return { callCenterId: null };
  }
  const id = callCenterId != null && callCenterId !== '' ? Number(callCenterId) : null;
  if (!Number.isFinite(id)) {
    return { error: 'Call center is required for Agents and Supervisors', code: 'VALIDATION' };
  }
  const [centers] = await pool.query(
    `SELECT id, status FROM call_centers WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  if (!centers[0]) {
    return { error: 'Call center not found', code: 'VALIDATION' };
  }
  if (centers[0].status !== 'active') {
    return { error: 'Call center is inactive', code: 'VALIDATION' };
  }
  return { callCenterId: id };
}

async function validateRegionForRole(roleName, regionId) {
  const { requiresRegion } = require('../config/orgRoles');
  if (!requiresRegion(roleName)) {
    return { regionId: null };
  }
  const id = regionId != null && regionId !== '' ? Number(regionId) : null;
  if (!Number.isFinite(id)) {
    return { error: 'Region is required for Regional Managers', code: 'VALIDATION' };
  }
  const [regions] = await pool.query(
    `SELECT id, is_active FROM regions WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!regions[0]) {
    return { error: 'Region not found', code: 'VALIDATION' };
  }
  if (!regions[0].is_active) {
    return { error: 'Region is inactive', code: 'VALIDATION' };
  }
  return { regionId: id };
}

async function createUser({
  name,
  email,
  roleId,
  permissionOverrides,
  isActive = true,
  phone = null,
  password = null,
  callCenterId = null,
  regionId = null,
  yeastarExtension = null,
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

  const roleName = await resolveRoleName(roleId);
  const centerCheck = await validateCallCenterForRole(roleName, callCenterId);
  if (centerCheck.error) return centerCheck;
  const regionCheck = await validateRegionForRole(roleName, regionId);
  if (regionCheck.error) return regionCheck;

  const { hashPassword } = require('./passwordService');
  const passwordHash = password ? hashPassword(password) : null;
  const mustResetPassword = Boolean(password);

  const ext = yeastarExtension != null ? String(yeastarExtension).trim() || null : null;

  const [result] = await pool.query(
    `INSERT INTO users (name, email, role_id, permission_overrides, is_active, phone, password_hash, must_reset_password, call_center_id, region_id, yeastar_extension)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      normalizedEmail,
      roleId,
      permissionOverrides ? JSON.stringify(permissionOverrides) : null,
      isActive,
      phone || null,
      passwordHash,
      mustResetPassword,
      centerCheck.callCenterId,
      regionCheck.regionId,
      ext,
    ]
  );

  return getUserById(result.insertId);
}

async function updateUser(
  id,
  {
    name,
    email,
    roleId,
    permissionOverrides,
    isActive,
    phone,
    password,
    callCenterId,
    regionId,
    yeastarExtension,
  },
  { performedBy, force = false } = {}
) {
  const user = await getUserById(id);
  if (!user) return null;

  const nextRoleId = roleId ?? user.roleId;
  const roleName = await resolveRoleName(nextRoleId);
  const nextCenter =
    callCenterId !== undefined ? callCenterId : user.callCenterId;
  const centerCheck = await validateCallCenterForRole(roleName, nextCenter);
  if (centerCheck.error) return centerCheck;

  const nextRegion = regionId !== undefined ? regionId : user.regionId;
  const regionCheck = await validateRegionForRole(roleName, nextRegion);
  if (regionCheck.error) return regionCheck;

  const nextActive = isActive ?? user.isActive;
  if (user.isActive && nextActive === false) {
    const { isSupervisorRole, isSeniorSupervisorRole } = require('../config/orgRoles');
    if (isSupervisorRole(user) || isSeniorSupervisorRole(user)) {
      const { assertStaffSuccessionClear } = require('./staffHandoffService');
      await assertStaffSuccessionClear(id, {
        allowSystemAdminOverride: force,
        user: performedBy,
      });
    }
  }

  const { hashPassword } = require('./passwordService');
  let passwordHash = undefined;
  let mustResetPassword = undefined;

  if (password) {
    passwordHash = hashPassword(password);
    mustResetPassword = true;
  }

  const nextExt =
    yeastarExtension !== undefined
      ? yeastarExtension != null
        ? String(yeastarExtension).trim() || null
        : null
      : user.yeastarExtension;

  await pool.query(
    `UPDATE users SET
      name = ?,
      email = ?,
      role_id = ?,
      permission_overrides = ?,
      is_active = ?,
      phone = ?,
      call_center_id = ?,
      region_id = ?,
      yeastar_extension = ?,
      password_hash = COALESCE(?, password_hash),
      must_reset_password = COALESCE(?, must_reset_password)
     WHERE id = ?`,
    [
      name ?? user.name,
      email ?? user.email,
      nextRoleId,
      permissionOverrides !== undefined
        ? permissionOverrides
          ? JSON.stringify(permissionOverrides)
          : null
        : user.permissionOverrides
          ? JSON.stringify(user.permissionOverrides)
          : null,
      nextActive,
      phone !== undefined ? phone || null : user.phone,
      centerCheck.callCenterId,
      regionCheck.regionId,
      nextExt,
      passwordHash ?? null,
      mustResetPassword ?? null,
      id,
    ]
  );

  return getUserById(id);
}

async function deleteUser(id, { performedBy, force = false } = {}) {
  const user = await getUserById(id);
  if (!user) return { error: 'User not found' };
  if (user.deletedAt) return { error: 'User is already deleted' };

  const { isAgentRole, isSupervisorRole, isSeniorSupervisorRole } = require('../config/orgRoles');
  if (isAgentRole(user)) {
    const { assertNoOpenPortfolio } = require('./agentHandoffService');
    await assertNoOpenPortfolio(id, {
      allowSystemAdminOverride: force,
      user: performedBy,
    });
  }
  if (isSupervisorRole(user) || isSeniorSupervisorRole(user)) {
    const { assertStaffSuccessionClear } = require('./staffHandoffService');
    await assertStaffSuccessionClear(id, {
      allowSystemAdminOverride: force,
      user: performedBy,
    });
    const { endOpenCoveragesForUser } = require('./staffCoverageService');
    await endOpenCoveragesForUser(id, { performedBy });
  }

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
