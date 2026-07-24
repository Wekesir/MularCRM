const pool = require('../db/pool');
const {
  isSupervisorRole,
  isSeniorSupervisorRole,
  SUPERVISOR_ROLE_NAMES,
  SENIOR_SUPERVISOR_ROLE_NAMES,
} = require('../config/orgRoles');
const { recordActivityEvent } = require('./activityService');

function getUserById(id) {
  return require('./userService').getUserById(id);
}

function endOpenCoveragesForUser(userId, opts) {
  return require('./staffCoverageService').endOpenCoveragesForUser(userId, opts);
}

function httpError(message, status = 400, code = 'VALIDATION') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function canHandoffSupervisor(user) {
  if (!user) return false;
  if (user.isSystemAdmin) return true;
  return isSeniorSupervisorRole(user) || isRegionalManagerRole(user);
}

function canHandoffSenior(user) {
  return Boolean(user?.isSystemAdmin);
}

async function countActiveSupervisorsInCenter(callCenterId, { excludeUserId } = {}) {
  const params = [Number(callCenterId), SUPERVISOR_ROLE_NAMES];
  let excludeSql = '';
  if (excludeUserId) {
    excludeSql = ' AND u.id <> ?';
    params.push(Number(excludeUserId));
  }
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.call_center_id = ?
       AND u.deleted_at IS NULL
       AND u.is_active = 1
       AND r.name IN (?)
       ${excludeSql}`,
    params
  );
  return Number(rows[0]?.cnt) || 0;
}

async function countActiveSeniors({ excludeUserId } = {}) {
  const params = [SENIOR_SUPERVISOR_ROLE_NAMES];
  let excludeSql = '';
  if (excludeUserId) {
    excludeSql = ' AND u.id <> ?';
    params.push(Number(excludeUserId));
  }
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL
       AND u.is_active = 1
       AND r.name IN (?)
       ${excludeSql}`,
    params
  );
  return Number(rows[0]?.cnt) || 0;
}

async function countActiveSystemAdmins({ excludeUserId } = {}) {
  const params = [];
  let excludeSql = '';
  if (excludeUserId) {
    excludeSql = ' AND u.id <> ?';
    params.push(Number(excludeUserId));
  }
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL
       AND u.is_active = 1
       AND r.is_system_admin = 1
       ${excludeSql}`,
    params
  );
  return Number(rows[0]?.cnt) || 0;
}

/**
 * Block deactivate/delete when the user is the last supervisor for their center
 * or the last senior (with no remaining admin).
 */
async function assertStaffSuccessionClear(userId, { allowSystemAdminOverride = false, user } = {}) {
  const target = await getUserById(userId);
  if (!target) throw httpError('User not found', 404, 'NOT_FOUND');

  if (isSupervisorRole(target)) {
    if (!target.callCenterId) return { roleBucket: 'supervisor', remaining: null };
    const remaining = await countActiveSupervisorsInCenter(target.callCenterId, {
      excludeUserId: target.id,
    });
    if (remaining > 0) return { roleBucket: 'supervisor', remaining, callCenterId: target.callCenterId };

    if (allowSystemAdminOverride && user?.isSystemAdmin) {
      return { roleBucket: 'supervisor', remaining: 0, overridden: true };
    }

    throw httpError(
      `${target.name} is the last active supervisor for their call center. Complete a succession handoff before deactivating or deleting.`,
      409,
      'SUCCESSION_PENDING'
    );
  }

  if (isSeniorSupervisorRole(target)) {
    const remainingSeniors = await countActiveSeniors({ excludeUserId: target.id });
    const remainingAdmins = await countActiveSystemAdmins({ excludeUserId: target.id });
    if (remainingSeniors > 0 || remainingAdmins > 0) {
      return {
        roleBucket: 'senior_supervisor',
        remainingSeniors,
        remainingAdmins,
      };
    }

    if (allowSystemAdminOverride && user?.isSystemAdmin) {
      return { roleBucket: 'senior_supervisor', remainingSeniors: 0, overridden: true };
    }

    throw httpError(
      `${target.name} is the last active Senior Supervisor and there is no other System Admin. Complete a succession handoff before deactivating or deleting.`,
      409,
      'SUCCESSION_PENDING'
    );
  }

  return { roleBucket: null };
}

/**
 * Permanent succession for Supervisor or Senior Supervisor.
 * mode: 'succeed' | 'release'
 * - succeed: bind/confirm successor, then unbind leaving supervisor from center (supervisors)
 * - release: unbind leaving supervisor only when another supervisor already remains
 */
async function handoffStaffRole(
  fromUserId,
  { mode = 'succeed', toUserId = null } = {},
  { performedBy } = {}
) {
  const fromId = Number(fromUserId);
  const fromUser = await getUserById(fromId);
  if (!fromUser) throw httpError('User not found', 404, 'NOT_FOUND');

  let roleBucket;
  let scopeType;
  let callCenterId = null;
  let toId = toUserId != null ? Number(toUserId) : null;
  let toUser = null;

  if (isSupervisorRole(fromUser)) {
    roleBucket = 'supervisor';
    scopeType = 'call_center';
    callCenterId = fromUser.callCenterId;
    if (!canHandoffSupervisor(performedBy)) {
      throw httpError('You do not have permission to hand off supervisor duties', 403, 'FORBIDDEN');
    }
    if (!callCenterId) {
      throw httpError('Supervisor is not bound to a call center');
    }

    const normalizedMode = mode === 'release' ? 'release' : 'succeed';

    if (normalizedMode === 'succeed') {
      if (!toId) throw httpError('Select a successor supervisor');
      toUser = await getUserById(toId);
      if (!toUser || !isSupervisorRole(toUser)) {
        throw httpError('Successor must be an active Supervisor');
      }
      if (!toUser.isActive) throw httpError('Successor must be active');
      if (toId === fromId) throw httpError('Successor must differ from the leaving supervisor');

      if (Number(toUser.callCenterId) !== Number(callCenterId)) {
        await pool.query('UPDATE users SET call_center_id = ? WHERE id = ?', [
          callCenterId,
          toId,
        ]);
      }
      await pool.query('UPDATE users SET call_center_id = NULL WHERE id = ?', [fromId]);
    } else {
      const remaining = await countActiveSupervisorsInCenter(callCenterId, {
        excludeUserId: fromId,
      });
      if (remaining < 1) {
        throw httpError(
          'Cannot release this supervisor: no other active supervisor remains on the call center. Choose a successor instead.'
        );
      }
      await pool.query('UPDATE users SET call_center_id = NULL WHERE id = ?', [fromId]);
      toId = null;
    }

    await endOpenCoveragesForUser(fromId, { performedBy });

    await pool.query(
      `INSERT INTO staff_handoffs
        (from_user_id, to_user_id, role_bucket, scope_type, call_center_id, mode, created_by, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fromId,
        toId,
        roleBucket,
        scopeType,
        callCenterId,
        normalizedMode,
        performedBy?.id || null,
        JSON.stringify({
          fromName: fromUser.name,
          toName: toUser?.name || null,
        }),
      ]
    );

    await recordActivityEvent({
      actionType: 'staff.role_handoff',
      title:
        normalizedMode === 'release'
          ? `Supervisor released from center: ${fromUser.name}`
          : `Supervisor succession: ${fromUser.name} → ${toUser?.name}`,
      subject: fromUser.name,
      actorUserId: performedBy?.id || null,
      metadata: {
        mode: normalizedMode,
        roleBucket,
        callCenterId,
        toUserId: toId,
      },
    }).catch(() => {});

    return {
      fromUser: { id: fromUser.id, name: fromUser.name },
      toUser: toUser ? { id: toUser.id, name: toUser.name } : null,
      mode: normalizedMode,
      roleBucket,
      callCenterId,
    };
  }

  if (isSeniorSupervisorRole(fromUser)) {
    roleBucket = 'senior_supervisor';
    scopeType = 'company';
    if (!canHandoffSenior(performedBy)) {
      throw httpError(
        'Only System Admins can hand off Senior Supervisor duties',
        403,
        'FORBIDDEN'
      );
    }

    const normalizedMode = mode === 'release' ? 'release' : 'succeed';
    if (normalizedMode === 'succeed') {
      if (!toId) throw httpError('Select a successor Senior Supervisor');
      toUser = await getUserById(toId);
      if (!toUser || (!isSeniorSupervisorRole(toUser) && !toUser.isSystemAdmin)) {
        throw httpError('Successor must be a Senior Supervisor or System Admin');
      }
      if (!toUser.isActive) throw httpError('Successor must be active');
      if (toId === fromId) throw httpError('Successor must differ from the leaving user');
    } else {
      const remainingSeniors = await countActiveSeniors({ excludeUserId: fromId });
      const remainingAdmins = await countActiveSystemAdmins({ excludeUserId: fromId });
      if (remainingSeniors < 1 && remainingAdmins < 1) {
        throw httpError(
          'Cannot release: no other Senior Supervisor or System Admin remains. Choose a successor instead.'
        );
      }
      toId = null;
    }

    await endOpenCoveragesForUser(fromId, { performedBy });

    await pool.query(
      `INSERT INTO staff_handoffs
        (from_user_id, to_user_id, role_bucket, scope_type, call_center_id, mode, created_by, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fromId,
        toId,
        roleBucket,
        scopeType,
        null,
        normalizedMode,
        performedBy?.id || null,
        JSON.stringify({
          fromName: fromUser.name,
          toName: toUser?.name || null,
        }),
      ]
    );

    await recordActivityEvent({
      actionType: 'staff.role_handoff',
      title:
        normalizedMode === 'release'
          ? `Senior Supervisor duties released: ${fromUser.name}`
          : `Senior Supervisor succession: ${fromUser.name} → ${toUser?.name}`,
      subject: fromUser.name,
      actorUserId: performedBy?.id || null,
      metadata: {
        mode: normalizedMode,
        roleBucket,
        toUserId: toId,
      },
    }).catch(() => {});

    return {
      fromUser: { id: fromUser.id, name: fromUser.name },
      toUser: toUser ? { id: toUser.id, name: toUser.name } : null,
      mode: normalizedMode,
      roleBucket,
      callCenterId: null,
    };
  }

  throw httpError('Role handoff is only supported for Supervisors and Senior Supervisors');
}

async function getSuccessionStatus(userId) {
  const target = await getUserById(userId);
  if (!target) throw httpError('User not found', 404, 'NOT_FOUND');

  if (isSupervisorRole(target)) {
    const remaining = target.callCenterId
      ? await countActiveSupervisorsInCenter(target.callCenterId, {
          excludeUserId: target.id,
        })
      : null;
    return {
      roleBucket: 'supervisor',
      callCenterId: target.callCenterId,
      callCenterName: target.callCenterName,
      remainingSuccessors: remaining,
      canDeactivateSafely: remaining == null || remaining > 0,
    };
  }

  if (isSeniorSupervisorRole(target)) {
    const remainingSeniors = await countActiveSeniors({ excludeUserId: target.id });
    const remainingAdmins = await countActiveSystemAdmins({ excludeUserId: target.id });
    return {
      roleBucket: 'senior_supervisor',
      remainingSeniors,
      remainingAdmins,
      canDeactivateSafely: remainingSeniors > 0 || remainingAdmins > 0,
    };
  }

  return { roleBucket: null, canDeactivateSafely: true };
}

module.exports = {
  assertStaffSuccessionClear,
  handoffStaffRole,
  getSuccessionStatus,
  countActiveSupervisorsInCenter,
  canHandoffSupervisor,
  canHandoffSenior,
};
