const pool = require('../db/pool');
const { getAgentById } = require('./agentService');
const { canAssignCases, resolveCallCenterScope } = require('../config/orgRoles');
const { notifyAgentOfAssignment } = require('./caseAssignmentNotifications');
const { recordActivityEvent } = require('./activityService');

function httpError(message, status = 400, code = 'VALIDATION') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function assertCanHandoff(user) {
  if (!canAssignCases(user)) {
    throw httpError('You do not have permission to hand off portfolios', 403, 'FORBIDDEN');
  }
}

async function countAgentPortfolio(agentUserId, agentName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS debtor_count,
            COUNT(DISTINCT file_id) AS file_count
     FROM debtors
     WHERE deleted_at IS NULL
       AND is_closed = 0
       AND (
         assigned_agent_user_id = ?
         OR (assigned_agent_user_id IS NULL AND assigned_agent = ?)
       )`,
    [Number(agentUserId), agentName || '']
  );
  return {
    debtorCount: Number(rows[0]?.debtor_count) || 0,
    fileCount: Number(rows[0]?.file_count) || 0,
  };
}

async function assertNoOpenPortfolio(agentUserId, { allowSystemAdminOverride = false, user } = {}) {
  const agent = await getAgentById(agentUserId);
  if (!agent) throw httpError('Agent not found', 404, 'NOT_FOUND');
  const counts = await countAgentPortfolio(agent.id, agent.name);
  if (counts.debtorCount === 0) return counts;

  if (allowSystemAdminOverride && user?.isSystemAdmin) {
    return counts;
  }

  throw httpError(
    `${agent.name} still has ${counts.debtorCount} open case(s) across ${counts.fileCount} file(s). Complete a portfolio handoff before deactivating or deleting.`,
    409,
    'PORTFOLIO_PENDING'
  );
}

/**
 * Permanently transfer or unassign an agent's entire open portfolio (cross-file).
 * mode: 'transfer' | 'unassign'
 * toAgentIds: required for transfer (round-robin)
 */
async function handoffAgentPortfolio(
  fromAgentUserId,
  { mode = 'transfer', toAgentIds = [] } = {},
  { performedBy, force = false } = {}
) {
  assertCanHandoff(performedBy);

  const fromId = Number(fromAgentUserId);
  const fromAgent = await getAgentById(fromId);
  if (!fromAgent) throw httpError('Agent not found', 404, 'NOT_FOUND');

  if (performedBy && !performedBy.isSystemAdmin) {
    const scope = resolveCallCenterScope(performedBy);
    if (
      scope.mode === 'center' &&
      scope.callCenterId &&
      Number(fromAgent.callCenterId) !== Number(scope.callCenterId)
    ) {
      throw httpError('Agent is outside your call center', 403, 'FORBIDDEN');
    }
  }

  const normalizedMode = mode === 'unassign' ? 'unassign' : 'transfer';
  let targets = [];

  if (normalizedMode === 'transfer') {
    const ids = Array.isArray(toAgentIds) ? toAgentIds.map(Number).filter(Boolean) : [];
    if (!ids.length) throw httpError('Select at least one destination agent');
    for (const id of ids) {
      if (id === fromId) continue;
      const agent = await getAgentById(id);
      if (!agent) continue;
      if (!agent.isActive) {
        throw httpError(`${agent.name} is inactive and cannot receive a portfolio`);
      }
      if (
        fromAgent.callCenterId &&
        agent.callCenterId &&
        Number(agent.callCenterId) !== Number(fromAgent.callCenterId)
      ) {
        throw httpError('Destination agents must share the same call center');
      }
      targets.push(agent);
    }
    if (!targets.length) throw httpError('No valid destination agents selected');
  }

  const conn = await pool.getConnection();
  let debtorCount = 0;
  let fileIds = new Set();
  const perTarget = new Map(targets.map((a) => [a.id, 0]));

  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id, name, file_id FROM debtors
       WHERE deleted_at IS NULL AND is_closed = 0
         AND (
           assigned_agent_user_id = ?
           OR (assigned_agent_user_id IS NULL AND assigned_agent = ?)
         )
       ORDER BY id ASC
       FOR UPDATE`,
      [fromId, fromAgent.name]
    );

    if (!rows.length && !force) {
      await conn.rollback();
      return {
        fromAgent: { id: fromAgent.id, name: fromAgent.name },
        mode: normalizedMode,
        debtorCount: 0,
        fileCount: 0,
        agents: [],
      };
    }

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.file_id) fileIds.add(Number(row.file_id));
      if (normalizedMode === 'unassign') {
        await conn.query(
          `UPDATE debtors
           SET assigned_agent = NULL, assigned_agent_user_id = NULL
           WHERE id = ?`,
          [row.id]
        );
      } else {
        const target = targets[i % targets.length];
        await conn.query(
          `UPDATE debtors
           SET assigned_agent = ?, assigned_agent_user_id = ?
           WHERE id = ?`,
          [target.name, target.id, row.id]
        );
        perTarget.set(target.id, (perTarget.get(target.id) || 0) + 1);
      }
      debtorCount += 1;
    }

    const primaryTo =
      normalizedMode === 'transfer' && targets.length === 1 ? targets[0].id : null;

    await conn.query(
      `INSERT INTO agent_portfolio_handoffs
        (from_agent_user_id, to_agent_user_id, mode, debtor_count, file_count, created_by, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fromId,
        primaryTo,
        normalizedMode,
        debtorCount,
        fileIds.size,
        performedBy?.id || null,
        JSON.stringify({
          toAgentIds: targets.map((a) => a.id),
          toAgentNames: targets.map((a) => a.name),
        }),
      ]
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  // End any active leave coverage for this agent
  await pool.query(
    `UPDATE agent_coverages
     SET status = 'ended', ended_at = NOW(), ended_by = ?
     WHERE absent_agent_user_id = ? AND status IN ('scheduled','active')`,
    [performedBy?.id || null, fromId]
  );

  await recordActivityEvent({
    actionType: 'agent.portfolio_handoff',
    title:
      normalizedMode === 'unassign'
        ? `Portfolio unassigned from ${fromAgent.name}`
        : `Portfolio handed off from ${fromAgent.name}`,
    subject: fromAgent.name,
    actorUserId: performedBy?.id || null,
    metadata: {
      mode: normalizedMode,
      debtorCount,
      fileCount: fileIds.size,
      toAgentIds: targets.map((a) => a.id),
    },
  }).catch(() => {});

  if (normalizedMode === 'transfer') {
    for (const agent of targets) {
      const caseCount = perTarget.get(agent.id) || 0;
      if (caseCount > 0) {
        notifyAgentOfAssignment({
          agent,
          action: 'reallocated',
          file: { id: null, name: 'Portfolio handoff' },
          caseCount,
          performedBy,
        }).catch(() => {});
      }
    }
  }

  return {
    fromAgent: { id: fromAgent.id, name: fromAgent.name },
    mode: normalizedMode,
    debtorCount,
    fileCount: fileIds.size,
    agents: targets.map((a) => ({
      agentId: a.id,
      agentName: a.name,
      caseCount: perTarget.get(a.id) || 0,
    })),
  };
}

module.exports = {
  countAgentPortfolio,
  assertNoOpenPortfolio,
  handoffAgentPortfolio,
};
