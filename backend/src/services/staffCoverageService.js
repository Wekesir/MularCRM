const pool = require('../db/pool');
const {
  isSupervisorRole,
  isSeniorSupervisorRole,
  isRegionalManagerRole,
  SUPERVISOR_ROLE_NAMES,
  SENIOR_SUPERVISOR_ROLE_NAMES,
} = require('../config/orgRoles');
const { recordActivityEvent } = require('./activityService');

function getUserById(id) {
  return require('./userService').getUserById(id);
}

const REASONS = new Set(['leave', 'sick', 'training', 'other']);

function httpError(message, status = 400, code = 'VALIDATION') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function normalizeCoverage(row) {
  return {
    id: Number(row.id),
    absentUserId: Number(row.absent_user_id),
    absentUserName: row.absent_user_name || null,
    coveringUserId: Number(row.covering_user_id),
    coveringUserName: row.covering_user_name || null,
    scopeType: row.scope_type,
    callCenterId: row.call_center_id != null ? Number(row.call_center_id) : null,
    callCenterName: row.call_center_name || null,
    roleBucket: row.role_bucket,
    reason: row.reason,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    notes: row.notes || null,
    createdBy: row.created_by != null ? Number(row.created_by) : null,
    endedBy: row.ended_by != null ? Number(row.ended_by) : null,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

function canManageSupervisorCoverage(user) {
  if (!user) return false;
  if (user.isSystemAdmin) return true;
  return isSeniorSupervisorRole(user) || isRegionalManagerRole(user);
}

function canManageSeniorCoverage(user) {
  return Boolean(user?.isSystemAdmin);
}

function assertCanManageStaffCoverage(user, roleBucket) {
  if (roleBucket === 'senior_supervisor') {
    if (!canManageSeniorCoverage(user)) {
      throw httpError(
        'Only System Admins can manage Senior Supervisor leave coverage',
        403,
        'FORBIDDEN'
      );
    }
    return;
  }
  if (!canManageSupervisorCoverage(user)) {
    throw httpError(
      'Only Senior Supervisors, Regional Managers, or System Admins can manage supervisor leave coverage',
      403,
      'FORBIDDEN'
    );
  }
}

async function getActiveCoveredCallCenterIds(coveringUserId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT call_center_id
     FROM staff_coverages
     WHERE covering_user_id = ?
       AND status = 'active'
       AND scope_type = 'call_center'
       AND call_center_id IS NOT NULL
       AND starts_at <= NOW()
       AND (ends_at IS NULL OR ends_at >= NOW())`,
    [Number(coveringUserId)]
  );
  return rows.map((r) => Number(r.call_center_id)).filter(Boolean);
}

async function getActiveCompanyCoverAbsents(coveringUserId) {
  const [rows] = await pool.query(
    `SELECT absent_user_id
     FROM staff_coverages
     WHERE covering_user_id = ?
       AND status = 'active'
       AND scope_type = 'company'
       AND starts_at <= NOW()
       AND (ends_at IS NULL OR ends_at >= NOW())`,
    [Number(coveringUserId)]
  );
  return rows.map((r) => Number(r.absent_user_id));
}

/** Call centers where the user may act as supervisor (own binding + active cover). */
async function getEffectiveSupervisorCallCenterIds(user) {
  if (!user) return [];
  const ids = new Set();
  if (isSupervisorRole(user) && user.callCenterId) {
    ids.add(Number(user.callCenterId));
  }
  if (user.isSystemAdmin || isSeniorSupervisorRole(user) || isRegionalManagerRole(user)) {
    // Company/region roles already have broad assign rights; still include covered centers for notify.
  }
  const covered = await getActiveCoveredCallCenterIds(user.id);
  for (const id of covered) ids.add(id);
  return Array.from(ids);
}

async function assertCanActAsSupervisorForCenter(user, callCenterId) {
  const centerId = Number(callCenterId);
  if (!user || !centerId) {
    throw httpError('Unauthorized', 403, 'FORBIDDEN');
  }
  if (user.isSystemAdmin || isSeniorSupervisorRole(user)) return { mode: 'company' };
  if (isRegionalManagerRole(user)) {
    // Region managers already scoped elsewhere; allow if they manage the center's region.
    return { mode: 'region' };
  }
  if (isSupervisorRole(user) && Number(user.callCenterId) === centerId) {
    return { mode: 'owner' };
  }
  const covered = await getActiveCoveredCallCenterIds(user.id);
  if (covered.includes(centerId)) {
    return { mode: 'coverage', callCenterId: centerId };
  }
  throw httpError('You do not have supervisor authority for this call center', 403, 'FORBIDDEN');
}

async function listCoveringUserIdsForCallCenter(callCenterId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT covering_user_id
     FROM staff_coverages
     WHERE call_center_id = ?
       AND status = 'active'
       AND scope_type = 'call_center'
       AND starts_at <= NOW()
       AND (ends_at IS NULL OR ends_at >= NOW())`,
    [Number(callCenterId)]
  );
  return rows.map((r) => Number(r.covering_user_id));
}

async function listCoverages({ user, status, userId, callCenterId } = {}) {
  if (!canManageSupervisorCoverage(user) && !canManageSeniorCoverage(user)) {
    throw httpError('You do not have permission to list staff coverages', 403, 'FORBIDDEN');
  }

  const clauses = ['1=1'];
  const params = [];

  if (status) {
    clauses.push('sc.status = ?');
    params.push(status);
  } else {
    clauses.push(`sc.status IN ('scheduled','active')`);
  }

  if (userId) {
    clauses.push('(sc.absent_user_id = ? OR sc.covering_user_id = ?)');
    params.push(Number(userId), Number(userId));
  }

  if (callCenterId) {
    clauses.push('sc.call_center_id = ?');
    params.push(Number(callCenterId));
  }

  if (!user.isSystemAdmin && isRegionalManagerRole(user) && user.regionId) {
    clauses.push(
      `(sc.call_center_id IN (SELECT id FROM call_centers WHERE region_id = ? AND deleted_at IS NULL)
        OR sc.scope_type = 'company')`
    );
    params.push(Number(user.regionId));
  }

  if (!canManageSeniorCoverage(user) && !user.isSystemAdmin) {
    clauses.push(`sc.role_bucket = 'supervisor'`);
  }

  const [rows] = await pool.query(
    `SELECT sc.*,
            ua.name AS absent_user_name,
            uc.name AS covering_user_name,
            cc.name AS call_center_name
     FROM staff_coverages sc
     LEFT JOIN users ua ON ua.id = sc.absent_user_id
     LEFT JOIN users uc ON uc.id = sc.covering_user_id
     LEFT JOIN call_centers cc ON cc.id = sc.call_center_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY sc.starts_at DESC, sc.id DESC`,
    params
  );
  return rows.map(normalizeCoverage);
}

async function countActiveStaffCoverages({ user } = {}) {
  const clauses = [
    `sc.status = 'active'`,
    'sc.starts_at <= NOW()',
    '(sc.ends_at IS NULL OR sc.ends_at >= NOW())',
  ];
  const params = [];
  if (user && !user.isSystemAdmin && isRegionalManagerRole(user) && user.regionId) {
    clauses.push(
      `sc.call_center_id IN (SELECT id FROM call_centers WHERE region_id = ? AND deleted_at IS NULL)`
    );
    params.push(Number(user.regionId));
  }
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM staff_coverages sc WHERE ${clauses.join(' AND ')}`,
    params
  );
  return Number(rows[0]?.cnt) || 0;
}

async function createCoverage(
  {
    absentUserId,
    coveringUserId,
    reason = 'leave',
    startsAt,
    endsAt = null,
    notes = null,
  },
  { performedBy } = {}
) {
  const absentId = Number(absentUserId);
  const coveringId = Number(coveringUserId);
  if (!absentId || !coveringId) {
    throw httpError('Absent and covering users are required');
  }
  if (absentId === coveringId) {
    throw httpError('Covering user must differ from the absent user');
  }

  const absent = await getUserById(absentId);
  const covering = await getUserById(coveringId);
  if (!absent || !covering) throw httpError('User not found', 404, 'NOT_FOUND');
  if (!absent.isActive) throw httpError('Absent user must be active');
  if (!covering.isActive) throw httpError('Covering user must be active');

  let roleBucket;
  let scopeType;
  let callCenterId = null;

  if (isSupervisorRole(absent)) {
    roleBucket = 'supervisor';
    scopeType = 'call_center';
    callCenterId = absent.callCenterId;
    if (!callCenterId) {
      throw httpError('Absent supervisor must be bound to a call center');
    }
    assertCanManageStaffCoverage(performedBy, roleBucket);

    const coveringOk =
      covering.isSystemAdmin ||
      isSeniorSupervisorRole(covering) ||
      (isSupervisorRole(covering) &&
        Number(covering.callCenterId) === Number(callCenterId));
    if (!coveringOk) {
      throw httpError(
        'Covering user must be a supervisor in the same call center, a Senior Supervisor, or a System Admin'
      );
    }
  } else if (isSeniorSupervisorRole(absent)) {
    roleBucket = 'senior_supervisor';
    scopeType = 'company';
    assertCanManageStaffCoverage(performedBy, roleBucket);
    const coveringOk =
      covering.isSystemAdmin || isSeniorSupervisorRole(covering);
    if (!coveringOk) {
      throw httpError('Covering user must be another Senior Supervisor or a System Admin');
    }
  } else {
    throw httpError('Leave coverage is only supported for Supervisors and Senior Supervisors');
  }

  const normalizedReason = REASONS.has(reason) ? reason : 'leave';
  const start = startsAt ? new Date(startsAt) : new Date();
  if (Number.isNaN(start.getTime())) throw httpError('Invalid coverage start date');
  let end = null;
  if (endsAt) {
    end = new Date(endsAt);
    if (Number.isNaN(end.getTime())) throw httpError('Invalid coverage end date');
    if (end <= start) throw httpError('Coverage end must be after start');
  }

  const [overlap] = await pool.query(
    `SELECT id FROM staff_coverages
     WHERE absent_user_id = ?
       AND status IN ('scheduled','active')
     LIMIT 1`,
    [absentId]
  );
  if (overlap[0]) {
    throw httpError('This user already has an active or scheduled leave coverage period');
  }

  const now = new Date();
  const status = start <= now ? 'active' : 'scheduled';

  const [result] = await pool.query(
    `INSERT INTO staff_coverages
      (absent_user_id, covering_user_id, scope_type, call_center_id, role_bucket,
       reason, starts_at, ends_at, status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      absentId,
      coveringId,
      scopeType,
      callCenterId,
      roleBucket,
      normalizedReason,
      start,
      end,
      status,
      notes || null,
      performedBy?.id || null,
    ]
  );

  await recordActivityEvent({
    actionType: 'staff.coverage_started',
    title: `Staff leave coverage: ${covering.name} covering for ${absent.name}`,
    subject: absent.name,
    actorUserId: performedBy?.id || null,
    metadata: {
      coverageId: result.insertId,
      absentUserId: absentId,
      coveringUserId: coveringId,
      roleBucket,
      scopeType,
      callCenterId,
      status,
    },
  }).catch(() => {});

  const [rows] = await pool.query(
    `SELECT sc.*, ua.name AS absent_user_name, uc.name AS covering_user_name, cc.name AS call_center_name
     FROM staff_coverages sc
     LEFT JOIN users ua ON ua.id = sc.absent_user_id
     LEFT JOIN users uc ON uc.id = sc.covering_user_id
     LEFT JOIN call_centers cc ON cc.id = sc.call_center_id
     WHERE sc.id = ?`,
    [result.insertId]
  );
  return normalizeCoverage(rows[0]);
}

async function endCoverage(coverageId, { performedBy, status = 'ended' } = {}) {
  const id = Number(coverageId);
  const endStatus = status === 'cancelled' ? 'cancelled' : 'ended';

  const [rows] = await pool.query(
    `SELECT sc.*, ua.name AS absent_user_name, uc.name AS covering_user_name, cc.name AS call_center_name
     FROM staff_coverages sc
     LEFT JOIN users ua ON ua.id = sc.absent_user_id
     LEFT JOIN users uc ON uc.id = sc.covering_user_id
     LEFT JOIN call_centers cc ON cc.id = sc.call_center_id
     WHERE sc.id = ? LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) throw httpError('Coverage not found', 404, 'NOT_FOUND');
  if (row.status === 'ended' || row.status === 'cancelled') {
    throw httpError('Coverage is already closed');
  }

  assertCanManageStaffCoverage(performedBy, row.role_bucket);

  await pool.query(
    `UPDATE staff_coverages
     SET status = ?, ended_by = ?, ended_at = NOW(),
         ends_at = COALESCE(ends_at, NOW())
     WHERE id = ?`,
    [endStatus, performedBy?.id || null, id]
  );

  await recordActivityEvent({
    actionType: 'staff.coverage_ended',
    title: `Staff leave coverage ended for ${row.absent_user_name}`,
    subject: row.absent_user_name,
    actorUserId: performedBy?.id || null,
    metadata: { coverageId: id, status: endStatus, roleBucket: row.role_bucket },
  }).catch(() => {});

  const [updated] = await pool.query(
    `SELECT sc.*, ua.name AS absent_user_name, uc.name AS covering_user_name, cc.name AS call_center_name
     FROM staff_coverages sc
     LEFT JOIN users ua ON ua.id = sc.absent_user_id
     LEFT JOIN users uc ON uc.id = sc.covering_user_id
     LEFT JOIN call_centers cc ON cc.id = sc.call_center_id
     WHERE sc.id = ?`,
    [id]
  );
  return normalizeCoverage(updated[0]);
}

async function endOpenCoveragesForUser(userId, { performedBy } = {}) {
  await pool.query(
    `UPDATE staff_coverages
     SET status = 'ended', ended_at = COALESCE(ended_at, NOW()), ended_by = ?
     WHERE (absent_user_id = ? OR covering_user_id = ?)
       AND status IN ('scheduled','active')`,
    [performedBy?.id || null, Number(userId), Number(userId)]
  );
}

async function syncStaffCoverageWindows() {
  const [activated] = await pool.query(
    `UPDATE staff_coverages
     SET status = 'active'
     WHERE status = 'scheduled' AND starts_at <= NOW()`
  );
  const [ended] = await pool.query(
    `UPDATE staff_coverages
     SET status = 'ended', ended_at = COALESCE(ended_at, NOW())
     WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < NOW()`
  );
  return {
    activated: activated.affectedRows || 0,
    ended: ended.affectedRows || 0,
  };
}

async function getCoverageMapForCallCenter(callCenterId) {
  const [rows] = await pool.query(
    `SELECT sc.*, ua.name AS absent_user_name, uc.name AS covering_user_name
     FROM staff_coverages sc
     LEFT JOIN users ua ON ua.id = sc.absent_user_id
     LEFT JOIN users uc ON uc.id = sc.covering_user_id
     WHERE sc.call_center_id = ?
       AND sc.status IN ('scheduled','active')`,
    [Number(callCenterId)]
  );
  const byAbsent = new Map();
  for (const row of rows) {
    byAbsent.set(Number(row.absent_user_id), normalizeCoverage(row));
  }
  return byAbsent;
}

module.exports = {
  listCoverages,
  createCoverage,
  endCoverage,
  countActiveStaffCoverages,
  getEffectiveSupervisorCallCenterIds,
  getActiveCoveredCallCenterIds,
  getActiveCompanyCoverAbsents,
  assertCanActAsSupervisorForCenter,
  listCoveringUserIdsForCallCenter,
  endOpenCoveragesForUser,
  syncStaffCoverageWindows,
  getCoverageMapForCallCenter,
  canManageSupervisorCoverage,
  canManageSeniorCoverage,
  SUPERVISOR_ROLE_NAMES,
  SENIOR_SUPERVISOR_ROLE_NAMES,
};
