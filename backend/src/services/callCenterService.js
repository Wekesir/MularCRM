const pool = require('../db/pool');
const {
  isAgentRole,
  isSupervisorRole,
  isSeniorSupervisorRole,
  SUPERVISOR_ROLE_NAMES,
  AGENT_ROLE_NAMES,
} = require('../config/orgRoles');
const { recordActivityEvent } = require('./activityService');

function normalizeCallCenter(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    status: row.status,
    createdBy: row.created_by || null,
    supervisorCount: Number(row.supervisor_count) || 0,
    agentCount: Number(row.agent_count) || 0,
    clientCount: Number(row.client_count) || 0,
    deletedAt: row.deleted_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listCallCenters({ includeInactive = false } = {}) {
  const where = ['cc.deleted_at IS NULL'];
  if (!includeInactive) where.push(`cc.status = 'active'`);

  const [rows] = await pool.query(
    `SELECT cc.*,
            (SELECT COUNT(*) FROM users u
              JOIN roles r ON r.id = u.role_id
             WHERE u.call_center_id = cc.id AND u.deleted_at IS NULL
               AND r.name IN (?)) AS supervisor_count,
            (SELECT COUNT(*) FROM users u
              JOIN roles r ON r.id = u.role_id
             WHERE u.call_center_id = cc.id AND u.deleted_at IS NULL
               AND r.name IN (?)) AS agent_count,
            (SELECT COUNT(*) FROM clients c
             WHERE c.call_center_id = cc.id AND c.deleted_at IS NULL) AS client_count
     FROM call_centers cc
     WHERE ${where.join(' AND ')}
     ORDER BY cc.name ASC`,
    [SUPERVISOR_ROLE_NAMES, AGENT_ROLE_NAMES]
  );
  return rows.map(normalizeCallCenter);
}

async function getCallCenterById(id) {
  const [rows] = await pool.query(
    `SELECT cc.*,
            (SELECT COUNT(*) FROM users u
              JOIN roles r ON r.id = u.role_id
             WHERE u.call_center_id = cc.id AND u.deleted_at IS NULL
               AND r.name IN (?)) AS supervisor_count,
            (SELECT COUNT(*) FROM users u
              JOIN roles r ON r.id = u.role_id
             WHERE u.call_center_id = cc.id AND u.deleted_at IS NULL
               AND r.name IN (?)) AS agent_count,
            (SELECT COUNT(*) FROM clients c
             WHERE c.call_center_id = cc.id AND c.deleted_at IS NULL) AS client_count
     FROM call_centers cc
     WHERE cc.id = ? AND cc.deleted_at IS NULL
     LIMIT 1`,
    [SUPERVISOR_ROLE_NAMES, AGENT_ROLE_NAMES, id]
  );
  return rows[0] ? normalizeCallCenter(rows[0]) : null;
}

async function createCallCenter({ name, description, status }, { performedBy } = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    const err = new Error('Call center name is required');
    err.code = 'VALIDATION';
    throw err;
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO call_centers (name, description, status, created_by)
       VALUES (?, ?, ?, ?)`,
      [
        trimmed,
        description ? String(description).trim() : null,
        status === 'inactive' ? 'inactive' : 'active',
        performedBy?.id || null,
      ]
    );
    return getCallCenterById(result.insertId);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const err = new Error('A call center with this name already exists');
      err.code = 'DUPLICATE';
      throw err;
    }
    throw error;
  }
}

async function updateCallCenter(id, { name, description, status }) {
  const existing = await getCallCenterById(id);
  if (!existing) return null;

  const nextName = name !== undefined ? String(name).trim() : existing.name;
  if (!nextName) {
    const err = new Error('Call center name is required');
    err.code = 'VALIDATION';
    throw err;
  }

  try {
    await pool.query(
      `UPDATE call_centers
       SET name = ?, description = ?, status = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        nextName,
        description !== undefined
          ? description
            ? String(description).trim()
            : null
          : existing.description,
        status !== undefined
          ? status === 'inactive'
            ? 'inactive'
            : 'active'
          : existing.status,
        id,
      ]
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const err = new Error('A call center with this name already exists');
      err.code = 'DUPLICATE';
      throw err;
    }
    throw error;
  }
  return getCallCenterById(id);
}

async function softDeleteCallCenter(id) {
  const existing = await getCallCenterById(id);
  if (!existing) return { deleted: false };

  const [[staff]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM users
     WHERE call_center_id = ? AND deleted_at IS NULL`,
    [id]
  );
  const [[clients]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM clients
     WHERE call_center_id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (Number(staff?.cnt) > 0 || Number(clients?.cnt) > 0) {
    const err = new Error(
      'Cannot delete a call center that still has staff or assigned clients. Reassign them first.'
    );
    err.code = 'IN_USE';
    throw err;
  }

  await pool.query(
    `UPDATE call_centers SET deleted_at = NOW(), status = 'inactive', name = CONCAT(name, ' (deleted-', id, ')')
     WHERE id = ?`,
    [id]
  );
  return { deleted: true, id: Number(id) };
}

async function getCallCenterStaff(id) {
  const center = await getCallCenterById(id);
  if (!center) return null;

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.is_active, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.call_center_id = ? AND u.deleted_at IS NULL
     ORDER BY r.name ASC, u.name ASC`,
    [id]
  );

  return {
    callCenter: center,
    supervisors: rows
      .filter((r) => isSupervisorRole(r.role_name))
      .map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        isActive: Boolean(r.is_active),
        roleName: r.role_name,
      })),
    agents: rows
      .filter((r) => AGENT_ROLE_NAMES.some((n) => n.toLowerCase() === String(r.role_name).toLowerCase()))
      .map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        isActive: Boolean(r.is_active),
        roleName: r.role_name,
      })),
  };
}

/**
 * Candidates who can be added/transferred into a call center:
 * unbound staff + staff currently at other centers (excludes the target center).
 * @param {'supervisor'|'agent'} staffKind
 * @param {number} excludeCallCenterId
 */
async function listAssignableStaff(staffKind, excludeCallCenterId) {
  const roleNames =
    staffKind === 'agent'
      ? AGENT_ROLE_NAMES
      : staffKind === 'supervisor'
        ? SUPERVISOR_ROLE_NAMES
        : null;

  if (!roleNames) {
    const err = new Error('Invalid staff kind');
    err.code = 'VALIDATION';
    throw err;
  }

  const excludeId = Number(excludeCallCenterId);
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.is_active, u.call_center_id,
            r.name AS role_name, cc.name AS call_center_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN call_centers cc ON cc.id = u.call_center_id AND cc.deleted_at IS NULL
     WHERE u.deleted_at IS NULL
       AND u.is_active = 1
       AND r.name IN (?)
       AND (u.call_center_id IS NULL OR u.call_center_id <> ?)
     ORDER BY
       CASE WHEN u.call_center_id IS NULL THEN 0 ELSE 1 END,
       cc.name ASC,
       u.name ASC`,
    [roleNames, Number.isFinite(excludeId) ? excludeId : 0]
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    isActive: Boolean(r.is_active),
    roleName: r.role_name,
    callCenterId: r.call_center_id != null ? Number(r.call_center_id) : null,
    callCenterName: r.call_center_name || null,
    unbound: r.call_center_id == null,
  }));
}

/**
 * Move a staff user (supervisor or agent) to another call center.
 * @param {'supervisor'|'agent'} staffKind
 */
async function transferStaff(userId, toCallCenterId, staffKind, { performedBy } = {}) {
  const [users] = await pool.query(
    `SELECT u.id, u.name, u.call_center_id, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND u.deleted_at IS NULL
     LIMIT 1`,
    [userId]
  );
  const user = users[0];
  if (!user) {
    const err = new Error('User not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (staffKind === 'supervisor') {
    if (!isSupervisorRole(user.role_name)) {
      const err = new Error('Only Supervisors can be transferred between call centers');
      err.code = 'VALIDATION';
      throw err;
    }
  } else if (staffKind === 'agent') {
    if (!isAgentRole(user.role_name)) {
      const err = new Error('Only Agents can be transferred between call centers');
      err.code = 'VALIDATION';
      throw err;
    }
  } else {
    const err = new Error('Invalid staff kind');
    err.code = 'VALIDATION';
    throw err;
  }

  const target = await getCallCenterById(toCallCenterId);
  if (!target) {
    const err = new Error('Target call center not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (target.status !== 'active') {
    const err = new Error('Target call center is inactive');
    err.code = 'VALIDATION';
    throw err;
  }

  const fromId = user.call_center_id;
  if (Number(fromId) === Number(toCallCenterId)) {
    const err = new Error('User is already assigned to this call center');
    err.code = 'VALIDATION';
    throw err;
  }

  await pool.query('UPDATE users SET call_center_id = ? WHERE id = ?', [toCallCenterId, userId]);

  const wasUnbound = fromId == null;
  const actionType =
    staffKind === 'agent'
      ? wasUnbound
        ? 'call_center.agent_assigned'
        : 'call_center.agent_transferred'
      : wasUnbound
        ? 'call_center.supervisor_assigned'
        : 'call_center.supervisor_transferred';

  await recordActivityEvent({
    userId: performedBy?.id ?? null,
    userName: performedBy?.name ?? null,
    actionType,
    title: wasUnbound
      ? `Assigned ${user.name} to ${target.name}`
      : `Transferred ${user.name} to ${target.name}`,
    subject: user.name,
    entityType: 'user',
    entityId: String(userId),
    metadata: {
      fromCallCenterId: fromId,
      toCallCenterId: Number(toCallCenterId),
      toCallCenterName: target.name,
      staffKind,
      assigned: wasUnbound,
    },
  });

  return {
    userId: Number(userId),
    name: user.name,
    fromCallCenterId: fromId,
    toCallCenterId: Number(toCallCenterId),
    toCallCenterName: target.name,
    assigned: wasUnbound,
  };
}

/** Move a Supervisor user to another call center. */
async function transferSupervisor(userId, toCallCenterId, options) {
  return transferStaff(userId, toCallCenterId, 'supervisor', options);
}

/** Move an Agent user to another call center. */
async function transferAgent(userId, toCallCenterId, options) {
  return transferStaff(userId, toCallCenterId, 'agent', options);
}

function assertCanManageCallCenters(user) {
  if (!user) {
    const err = new Error('Unauthorized');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
  if (user.isSystemAdmin || isSeniorSupervisorRole(user)) return;
  const err = new Error('Only Senior Supervisors can manage call centers');
  err.code = 'FORBIDDEN';
  err.status = 403;
  throw err;
}

module.exports = {
  listCallCenters,
  getCallCenterById,
  createCallCenter,
  updateCallCenter,
  softDeleteCallCenter,
  getCallCenterStaff,
  listAssignableStaff,
  transferSupervisor,
  transferAgent,
  assertCanManageCallCenters,
};
