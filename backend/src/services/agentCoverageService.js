const pool = require('../db/pool');
const { getAgentById } = require('./agentService');
const {
  canAssignCases,
  resolveCallCenterScope,
  isSupervisorRole,
  isSeniorSupervisorRole,
  isRegionalManagerRole,
} = require('../config/orgRoles');
const { recordActivityEvent } = require('./activityService');

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
    absentAgentUserId: Number(row.absent_agent_user_id),
    absentAgentName: row.absent_agent_name || null,
    coveringAgentUserId: Number(row.covering_agent_user_id),
    coveringAgentName: row.covering_agent_name || null,
    callCenterId: row.call_center_id != null ? Number(row.call_center_id) : null,
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

function assertCanManageCoverage(user) {
  if (!canAssignCases(user)) {
    throw httpError('You do not have permission to manage agent leave coverage', 403, 'FORBIDDEN');
  }
}

async function assertAgentsInSameScope(user, absent, covering) {
  if (user?.isSystemAdmin || isSeniorSupervisorRole(user) || isRegionalManagerRole(user)) {
    if (Number(absent.callCenterId) !== Number(covering.callCenterId)) {
      throw httpError('Covering agent must be in the same call center as the absent agent', 400);
    }
    return;
  }
  if (isSupervisorRole(user)) {
    const { assertCanActAsSupervisorForCenter } = require('./staffCoverageService');
    await assertCanActAsSupervisorForCenter(user, absent.callCenterId);
    if (Number(absent.callCenterId) !== Number(covering.callCenterId)) {
      throw httpError('Covering agent must be in the same call center as the absent agent', 400);
    }
    return;
  }
  const scope = resolveCallCenterScope(user);
  if (scope.mode === 'center') {
    if (
      !scope.callCenterId ||
      Number(absent.callCenterId) !== Number(scope.callCenterId) ||
      Number(covering.callCenterId) !== Number(scope.callCenterId)
    ) {
      throw httpError('Both agents must belong to your call center', 403, 'FORBIDDEN');
    }
  }
  if (Number(absent.callCenterId) !== Number(covering.callCenterId)) {
    throw httpError('Covering agent must be in the same call center as the absent agent', 400);
  }
}

async function getActiveAbsentIdsCoveredBy(coveringUserId) {
  const [rows] = await pool.query(
    `SELECT absent_agent_user_id
     FROM agent_coverages
     WHERE covering_agent_user_id = ?
       AND status = 'active'
       AND starts_at <= NOW()
       AND (ends_at IS NULL OR ends_at >= NOW())`,
    [Number(coveringUserId)]
  );
  return rows.map((r) => Number(r.absent_agent_user_id));
}

/** Portfolio owner ids the user may work: self + absentees they actively cover. */
async function getEffectivePortfolioAgentIds(user) {
  const selfId = Number(user.id);
  const covered = await getActiveAbsentIdsCoveredBy(selfId);
  return Array.from(new Set([selfId, ...covered]));
}

async function assertAgentCanAccessDebtor(user, debtor) {
  const ownerId = debtor.assigned_agent_user_id
    ? Number(debtor.assigned_agent_user_id)
    : null;
  const ownerName = String(debtor.assigned_agent || '').trim();
  const selfId = Number(user.id);
  const selfName = String(user.name || '').trim();

  if (ownerId && ownerId === selfId) return { mode: 'owner' };
  if (!ownerId && ownerName && ownerName === selfName) return { mode: 'owner' };

  if (ownerId) {
    const covered = await getActiveAbsentIdsCoveredBy(selfId);
    if (covered.includes(ownerId)) {
      return { mode: 'coverage', portfolioOwnerUserId: ownerId, portfolioOwnerName: ownerName };
    }
  }

  throw httpError('This case is not assigned to you', 403, 'FORBIDDEN');
}

async function listCoverages({ user, status, agentUserId } = {}) {
  assertCanManageCoverage(user);
  const scope = resolveCallCenterScope(user);
  const clauses = ['1=1'];
  const params = [];

  if (status) {
    clauses.push('ac.status = ?');
    params.push(status);
  } else {
    clauses.push(`ac.status IN ('scheduled','active')`);
  }

  if (agentUserId) {
    clauses.push('(ac.absent_agent_user_id = ? OR ac.covering_agent_user_id = ?)');
    params.push(Number(agentUserId), Number(agentUserId));
  }

  if (scope.mode === 'center' && scope.callCenterId) {
    clauses.push('ac.call_center_id = ?');
    params.push(scope.callCenterId);
  } else if (scope.mode === 'region' && scope.regionId) {
    clauses.push(
      'ac.call_center_id IN (SELECT id FROM call_centers WHERE region_id = ? AND deleted_at IS NULL)'
    );
    params.push(scope.regionId);
  } else if (scope.mode === 'none') {
    return [];
  }

  const [rows] = await pool.query(
    `SELECT ac.*,
            ua.name AS absent_agent_name,
            uc.name AS covering_agent_name
     FROM agent_coverages ac
     LEFT JOIN users ua ON ua.id = ac.absent_agent_user_id
     LEFT JOIN users uc ON uc.id = ac.covering_agent_user_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY ac.starts_at DESC, ac.id DESC`,
    params
  );
  return rows.map(normalizeCoverage);
}

async function countActiveCoverages({ user } = {}) {
  if (!user) return 0;
  const scope = resolveCallCenterScope(user);
  const clauses = [`ac.status = 'active'`, 'ac.starts_at <= NOW()', '(ac.ends_at IS NULL OR ac.ends_at >= NOW())'];
  const params = [];
  if (scope.mode === 'center' && scope.callCenterId) {
    clauses.push('ac.call_center_id = ?');
    params.push(scope.callCenterId);
  } else if (scope.mode === 'region' && scope.regionId) {
    clauses.push(
      'ac.call_center_id IN (SELECT id FROM call_centers WHERE region_id = ? AND deleted_at IS NULL)'
    );
    params.push(scope.regionId);
  } else if (scope.mode === 'none') {
    return 0;
  }
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM agent_coverages ac WHERE ${clauses.join(' AND ')}`,
    params
  );
  return Number(rows[0]?.cnt) || 0;
}

async function createCoverage(
  {
    absentAgentUserId,
    coveringAgentUserId,
    reason = 'leave',
    startsAt,
    endsAt = null,
    notes = null,
  },
  { performedBy } = {}
) {
  assertCanManageCoverage(performedBy);

  const absentId = Number(absentAgentUserId);
  const coveringId = Number(coveringAgentUserId);
  if (!absentId || !coveringId) {
    throw httpError('Absent and covering agents are required');
  }
  if (absentId === coveringId) {
    throw httpError('Covering agent must differ from the absent agent');
  }
  const normalizedReason = REASONS.has(reason) ? reason : 'leave';
  const start = startsAt ? new Date(startsAt) : new Date();
  if (Number.isNaN(start.getTime())) {
    throw httpError('Invalid coverage start date');
  }
  let end = null;
  if (endsAt) {
    end = new Date(endsAt);
    if (Number.isNaN(end.getTime())) throw httpError('Invalid coverage end date');
    if (end <= start) throw httpError('Coverage end must be after start');
  }

  const absent = await getAgentById(absentId);
  const covering = await getAgentById(coveringId);
  if (!absent || !covering) throw httpError('Agent not found', 404, 'NOT_FOUND');
  if (!covering.isActive) {
    throw httpError('Covering agent must be active');
  }

  await assertAgentsInSameScope(performedBy, absent, covering);

  const [overlap] = await pool.query(
    `SELECT id FROM agent_coverages
     WHERE absent_agent_user_id = ?
       AND status IN ('scheduled','active')
     LIMIT 1`,
    [absentId]
  );
  if (overlap[0]) {
    throw httpError('This agent already has an active or scheduled coverage period');
  }

  const now = new Date();
  const status = start <= now ? 'active' : 'scheduled';

  const [result] = await pool.query(
    `INSERT INTO agent_coverages
      (absent_agent_user_id, covering_agent_user_id, call_center_id, reason,
       starts_at, ends_at, status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      absentId,
      coveringId,
      absent.callCenterId || covering.callCenterId || null,
      normalizedReason,
      start,
      end,
      status,
      notes || null,
      performedBy?.id || null,
    ]
  );

  await recordActivityEvent({
    actionType: 'agent.coverage_started',
    title: `Leave coverage: ${covering.name} covering for ${absent.name}`,
    subject: absent.name,
    actorUserId: performedBy?.id || null,
    metadata: {
      coverageId: result.insertId,
      absentAgentUserId: absentId,
      coveringAgentUserId: coveringId,
      reason: normalizedReason,
      status,
    },
  }).catch(() => {});

  const [rows] = await pool.query(
    `SELECT ac.*, ua.name AS absent_agent_name, uc.name AS covering_agent_name
     FROM agent_coverages ac
     LEFT JOIN users ua ON ua.id = ac.absent_agent_user_id
     LEFT JOIN users uc ON uc.id = ac.covering_agent_user_id
     WHERE ac.id = ?`,
    [result.insertId]
  );
  return normalizeCoverage(rows[0]);
}

async function endCoverage(coverageId, { performedBy, status = 'ended' } = {}) {
  assertCanManageCoverage(performedBy);
  const id = Number(coverageId);
  const endStatus = status === 'cancelled' ? 'cancelled' : 'ended';

  const [rows] = await pool.query(
    `SELECT ac.*, ua.name AS absent_agent_name, uc.name AS covering_agent_name
     FROM agent_coverages ac
     LEFT JOIN users ua ON ua.id = ac.absent_agent_user_id
     LEFT JOIN users uc ON uc.id = ac.covering_agent_user_id
     WHERE ac.id = ? LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) throw httpError('Coverage not found', 404, 'NOT_FOUND');
  if (row.status === 'ended' || row.status === 'cancelled') {
    throw httpError('Coverage is already closed');
  }

  if (performedBy && !performedBy.isSystemAdmin) {
    const scope = resolveCallCenterScope(performedBy);
    if (
      scope.mode === 'center' &&
      scope.callCenterId &&
      Number(row.call_center_id) !== Number(scope.callCenterId)
    ) {
      throw httpError('Coverage is outside your call center', 403, 'FORBIDDEN');
    }
  }

  await pool.query(
    `UPDATE agent_coverages
     SET status = ?, ended_by = ?, ended_at = NOW(),
         ends_at = COALESCE(ends_at, NOW())
     WHERE id = ?`,
    [endStatus, performedBy?.id || null, id]
  );

  await recordActivityEvent({
    actionType: 'agent.coverage_ended',
    title: `Leave coverage ended for ${row.absent_agent_name}`,
    subject: row.absent_agent_name,
    actorUserId: performedBy?.id || null,
    metadata: { coverageId: id, status: endStatus },
  }).catch(() => {});

  const [updated] = await pool.query(
    `SELECT ac.*, ua.name AS absent_agent_name, uc.name AS covering_agent_name
     FROM agent_coverages ac
     LEFT JOIN users ua ON ua.id = ac.absent_agent_user_id
     LEFT JOIN users uc ON uc.id = ac.covering_agent_user_id
     WHERE ac.id = ?`,
    [id]
  );
  return normalizeCoverage(updated[0]);
}

/** Activate due scheduled coverages and end expired active ones. */
async function syncCoverageWindows() {
  const [activated] = await pool.query(
    `UPDATE agent_coverages
     SET status = 'active'
     WHERE status = 'scheduled' AND starts_at <= NOW()`
  );
  const [ended] = await pool.query(
    `UPDATE agent_coverages
     SET status = 'ended', ended_at = COALESCE(ended_at, NOW())
     WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < NOW()`
  );
  return {
    activated: activated.affectedRows || 0,
    ended: ended.affectedRows || 0,
  };
}

module.exports = {
  listCoverages,
  createCoverage,
  endCoverage,
  countActiveCoverages,
  getEffectivePortfolioAgentIds,
  getActiveAbsentIdsCoveredBy,
  assertAgentCanAccessDebtor,
  syncCoverageWindows,
  normalizeCoverage,
};
