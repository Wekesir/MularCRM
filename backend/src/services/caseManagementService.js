const pool = require('../db/pool');
const { getAgentById } = require('./agentService');
const { notifyAgentOfAssignment } = require('./caseAssignmentNotifications');
const { recordActivityEvents } = require('./activityService');
const { assertCallerCanAccessClient } = require('./clientService');
const {
  resolveCallCenterScope,
  isSupervisorRole,
} = require('../config/orgRoles');

/** Prefer file-level call center, fall back to client's binding. */
function resolveFileCallCenterId(file) {
  if (!file) return null;
  if (file.call_center_id != null) return Number(file.call_center_id);
  return null;
}

async function getFileCallCenterId(file) {
  const fromFile = resolveFileCallCenterId(file);
  if (fromFile) return fromFile;
  return getClientCallCenterId(file?.client_id);
}

async function assertCallerCanAccessFile(user, file) {
  if (!user || user.isSystemAdmin) return;
  const scope = resolveCallCenterScope(user);
  if (scope.mode === 'company') return;
  if (scope.mode !== 'center' || !scope.callCenterId) {
    const err = new Error('You are not bound to a call center');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
  const fileCenter = await getFileCallCenterId(file);
  if (!fileCenter || Number(fileCenter) !== Number(scope.callCenterId)) {
    const err = new Error('This portfolio is not assigned to your call center');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
}

async function assertAgentsInCallerCenter(user, agents, fileClientCallCenterId) {
  if (!user || user.isSystemAdmin) return;
  const scope = resolveCallCenterScope(user);
  const requiredCenter =
    scope.mode === 'center' ? scope.callCenterId : fileClientCallCenterId;
  if (!requiredCenter) return;

  const outsiders = agents.filter(
    (a) => !a.callCenterId || Number(a.callCenterId) !== Number(requiredCenter)
  );
  if (outsiders.length) {
    const err = new Error(
      'All selected agents must belong to the same call center as this portfolio'
    );
    err.code = 'VALIDATION';
    throw err;
  }
}

async function getClientCallCenterId(clientId) {
  if (!clientId) return null;
  const [rows] = await pool.query(
    `SELECT call_center_id FROM clients WHERE id = ? LIMIT 1`,
    [clientId]
  );
  return rows[0]?.call_center_id != null ? Number(rows[0].call_center_id) : null;
}

// Per-client case summary used by the Case Management table.
// Aggregates are computed in dedicated subqueries to avoid the cartesian
// product that joining debtors + debtor_files on client_id would create.
async function listClientCaseSummary({ search = '', user = null } = {}) {
  const params = [];
  let where = 'WHERE c.deleted_at IS NULL';
  const q = String(search || '').trim();
  if (q) {
    where += ' AND c.name LIKE ?';
    params.push(`%${q}%`);
  }

  let centerId = null;
  if (user) {
    const scope = resolveCallCenterScope(user);
    if (scope.mode === 'center') {
      if (!scope.callCenterId) return [];
      centerId = scope.callCenterId;
      where += ' AND c.call_center_id = ?';
      params.push(scope.callCenterId);
    } else if (scope.mode === 'none') {
      return [];
    }
  }

  // When center-scoped, count only files/debtors bound to that center
  // (file center preferred; legacy client bind when file has no center).
  const fileCenterSql = centerId
    ? ' AND (df.call_center_id = ? OR (df.call_center_id IS NULL AND c2.call_center_id = ?))'
    : '';
  const debtorCenterSql = centerId
    ? ' AND COALESCE(df.call_center_id, c2.call_center_id) = ?'
    : '';
  const fileParams = centerId ? [centerId, centerId] : [];
  const debtorParams = centerId ? [centerId] : [];

  const [rows] = await pool.query(
    `SELECT c.id,
            c.name,
            COALESCE(f.total_files, 0) AS total_files,
            COALESCE(d.total_cases, 0) AS total_cases,
            COALESCE(d.total_amount, 0) AS total_amount,
            COALESCE(d.assigned_cases, 0) AS assigned_cases,
            COALESCE(d.unassigned_cases, 0) AS unassigned_cases
     FROM clients c
     LEFT JOIN (
       SELECT df.client_id, COUNT(*) AS total_files
       FROM debtor_files df
       LEFT JOIN clients c2 ON c2.id = df.client_id
       WHERE df.deleted_at IS NULL${fileCenterSql}
       GROUP BY df.client_id
     ) f ON f.client_id = c.id
     LEFT JOIN (
       SELECT d.client_id,
              COUNT(*) AS total_cases,
              COALESCE(SUM(d.loan_amount), 0) AS total_amount,
              COALESCE(SUM(CASE WHEN d.assigned_agent IS NOT NULL AND d.assigned_agent <> '' THEN 1 ELSE 0 END), 0) AS assigned_cases,
              COALESCE(SUM(CASE WHEN d.assigned_agent IS NULL OR d.assigned_agent = '' THEN 1 ELSE 0 END), 0) AS unassigned_cases
       FROM debtors d
       LEFT JOIN debtor_files df ON df.id = d.file_id
       LEFT JOIN clients c2 ON c2.id = d.client_id
       WHERE d.deleted_at IS NULL${debtorCenterSql}
       GROUP BY d.client_id
     ) d ON d.client_id = c.id
     ${where}
     ORDER BY d.total_cases DESC, c.name ASC`,
    [...fileParams, ...debtorParams, ...params]
  );

  return rows.map((r) => ({
    clientId: r.id,
    clientName: r.name,
    totalFiles: Number(r.total_files) || 0,
    totalCases: Number(r.total_cases) || 0,
    totalAmount: Number(r.total_amount) || 0,
    assignedCases: Number(r.assigned_cases) || 0,
    unassignedCases: Number(r.unassigned_cases) || 0,
  }));
}

// All (non-deleted) batch files belonging to a single client, with the same
// aggregated stats shape as listDebtorFiles so the modal can reuse the layout.
async function listClientFiles(clientId, { user = null } = {}) {
  const id = Number(clientId);
  if (!Number.isFinite(id)) return [];
  if (user) await assertCallerCanAccessClient(user, id);

  const params = [id];
  let centerClause = '';
  if (user) {
    const scope = resolveCallCenterScope(user);
    if (scope.mode === 'center' && scope.callCenterId) {
      centerClause =
        ' AND (df.call_center_id = ? OR (df.call_center_id IS NULL AND c.call_center_id = ?))';
      params.push(scope.callCenterId, scope.callCenterId);
    }
  }

  const [rows] = await pool.query(
    `SELECT df.*,
            c.name AS client_name,
            dc.name AS debt_category_name,
            dt.name AS debt_type_name,
            cur.code AS currency_code,
            cur.symbol AS currency_symbol,
            u.name AS uploaded_by_name,
            agg.loan_total,
            agg.collected_total,
            agg.outstanding_total,
            agg.assigned_cases,
            agg.unassigned_cases
     FROM debtor_files df
     LEFT JOIN clients c ON c.id = df.client_id
     LEFT JOIN debt_categories dc ON dc.id = df.debt_category_id
     LEFT JOIN debt_types dt ON dt.id = df.debt_type_id
     LEFT JOIN currencies cur ON cur.id = df.currency_id
     LEFT JOIN users u ON u.id = df.uploaded_by
     LEFT JOIN (
       SELECT file_id,
              COUNT(*) AS cnt,
              COALESCE(SUM(loan_amount), 0) AS loan_total,
              COALESCE(SUM(total_paid), 0) AS collected_total,
              COALESCE(SUM(outstanding_balance), 0) AS outstanding_total,
              COALESCE(SUM(CASE WHEN assigned_agent IS NOT NULL AND assigned_agent <> '' THEN 1 ELSE 0 END), 0) AS assigned_cases,
              COALESCE(SUM(CASE WHEN assigned_agent IS NULL OR assigned_agent = '' THEN 1 ELSE 0 END), 0) AS unassigned_cases
       FROM debtors WHERE deleted_at IS NULL GROUP BY file_id
     ) agg ON agg.file_id = df.id
     WHERE df.client_id = ? AND df.deleted_at IS NULL${centerClause}
     ORDER BY df.created_at DESC, df.id DESC`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    fileName: row.file_name || null,
    debtCategoryName: row.debt_category_name || null,
    debtTypeName: row.debt_type_name || null,
    currencyCode: row.currency_code || null,
    currencySymbol: row.currency_symbol || null,
    rowCount: row.row_count || 0,
    importedCount: row.imported_count || 0,
    skippedCount: row.skipped_count || 0,
    uploadedByName: row.uploaded_by_name || null,
    loanTotal: Number(row.loan_total) || 0,
    collectedTotal: Number(row.collected_total) || 0,
    outstandingTotal: Number(row.outstanding_total) || 0,
    assignedCases: Number(row.assigned_cases) || 0,
    unassignedCases: Number(row.unassigned_cases) || 0,
    isClosed: Boolean(row.is_closed),
    createdAt: row.created_at,
  }));
}

/** Batch files that still have at least one unassigned debtor case. */
async function listUnassignedFiles({ search = '', user = null } = {}) {
  const params = [];
  let searchClause = '';
  const q = String(search || '').trim();
  if (q) {
    searchClause = ' AND (df.file_name LIKE ? OR c.name LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }

  let centerClause = '';
  if (user) {
    const scope = resolveCallCenterScope(user);
    if (scope.mode === 'center') {
      if (!scope.callCenterId) return [];
      // Prefer file bind; only use client bind when the file has no center
      // (avoids surfacing another center's file for a shared client).
      centerClause =
        ' AND (df.call_center_id = ? OR (df.call_center_id IS NULL AND c.call_center_id = ?))';
      params.push(scope.callCenterId, scope.callCenterId);
    } else if (scope.mode === 'none') {
      return [];
    }
  }

  const [rows] = await pool.query(
    `SELECT df.*,
            c.name AS client_name,
            cc.name AS call_center_name,
            dc.name AS debt_category_name,
            dt.name AS debt_type_name,
            cur.code AS currency_code,
            cur.symbol AS currency_symbol,
            u.name AS uploaded_by_name,
            agg.loan_total,
            agg.collected_total,
            agg.outstanding_total,
            agg.assigned_cases,
            agg.unassigned_cases
     FROM debtor_files df
     LEFT JOIN clients c ON c.id = df.client_id
     LEFT JOIN call_centers cc ON cc.id = COALESCE(df.call_center_id, c.call_center_id) AND cc.deleted_at IS NULL
     LEFT JOIN debt_categories dc ON dc.id = df.debt_category_id
     LEFT JOIN debt_types dt ON dt.id = df.debt_type_id
     LEFT JOIN currencies cur ON cur.id = df.currency_id
     LEFT JOIN users u ON u.id = df.uploaded_by
     INNER JOIN (
       SELECT file_id,
              COALESCE(SUM(loan_amount), 0) AS loan_total,
              COALESCE(SUM(total_paid), 0) AS collected_total,
              COALESCE(SUM(outstanding_balance), 0) AS outstanding_total,
              COALESCE(SUM(CASE WHEN assigned_agent IS NOT NULL AND assigned_agent <> '' THEN 1 ELSE 0 END), 0) AS assigned_cases,
              COALESCE(SUM(CASE WHEN assigned_agent IS NULL OR assigned_agent = '' THEN 1 ELSE 0 END), 0) AS unassigned_cases
       FROM debtors
       WHERE deleted_at IS NULL
       GROUP BY file_id
       HAVING COALESCE(SUM(CASE WHEN assigned_agent IS NULL OR assigned_agent = '' THEN 1 ELSE 0 END), 0) > 0
     ) agg ON agg.file_id = df.id
     WHERE df.deleted_at IS NULL
       AND (df.is_closed = 0 OR df.is_closed IS NULL)
       AND (df.call_center_id IS NOT NULL OR c.call_center_id IS NOT NULL)
       ${searchClause}
       ${centerClause}
     ORDER BY agg.unassigned_cases DESC, df.created_at DESC, df.id DESC`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    callCenterId: row.call_center_id != null
      ? Number(row.call_center_id)
      : null,
    callCenterName: row.call_center_name || null,
    fileName: row.file_name || null,
    debtCategoryName: row.debt_category_name || null,
    debtTypeName: row.debt_type_name || null,
    currencyCode: row.currency_code || null,
    currencySymbol: row.currency_symbol || null,
    rowCount: row.row_count || 0,
    importedCount: row.imported_count || 0,
    skippedCount: row.skipped_count || 0,
    uploadedByName: row.uploaded_by_name || null,
    loanTotal: Number(row.loan_total) || 0,
    collectedTotal: Number(row.collected_total) || 0,
    outstandingTotal: Number(row.outstanding_total) || 0,
    assignedCases: Number(row.assigned_cases) || 0,
    unassignedCases: Number(row.unassigned_cases) || 0,
    isClosed: Boolean(row.is_closed),
    createdAt: row.created_at,
  }));
}

async function getFileRow(fileId) {
  const [rows] = await pool.query(
    `SELECT df.*, c.name AS client_name
     FROM debtor_files df
     LEFT JOIN clients c ON c.id = df.client_id
     WHERE df.id = ? AND df.deleted_at IS NULL
     LIMIT 1`,
    [fileId]
  );
  return rows[0] || null;
}

function assignmentEventTitle(actionType, metadata = {}) {
  const agent = metadata.agentName || null;
  const previous = metadata.previousAgentName || null;
  if (actionType === 'debtor.reassigned' && previous && agent) {
    return `Reassigned from ${previous} to ${agent}`;
  }
  if (actionType === 'debtor.assigned' && agent) {
    return `Assigned to ${agent}`;
  }
  if (actionType === 'debtor.unassigned' && previous) {
    return `Unassigned from ${previous}`;
  }
  if (actionType === 'debtor.reassigned') return 'Debtor Reassigned';
  if (actionType === 'debtor.unassigned') return 'Debtor Unassigned';
  return 'Debtor Assigned';
}

async function recordDebtorAssignmentEvents(events = [], { performedBy, fileId }) {
  if (!Array.isArray(events) || events.length === 0) return 0;
  const payload = events.map((evt) => {
    const metadata = {
      ...(evt.metadata || {}),
      fileId: Number(fileId) || null,
      source: 'case_management',
    };
    return {
      userId: performedBy?.id ?? null,
      userName: performedBy?.name ?? null,
      actionType: evt.actionType,
      title: evt.title || assignmentEventTitle(evt.actionType, metadata),
      subject: evt.subject || null,
      entityType: 'debtor',
      entityId: String(evt.debtorId),
      metadata,
    };
  });
  const inserted = await recordActivityEvents(payload);
  if (inserted < payload.length) {
    console.warn(
      `[caseManagement] Recorded ${inserted}/${payload.length} debtor assignment activity events`
    );
  }
  return inserted;
}

// Current allocation breakdown for a case file: per-agent case counts +
// portfolio value, plus unassigned totals. `assigned_agent` is a VARCHAR
// holding the agent's name, so we resolve the agent id by joining users on
// name (best-effort — unmatched names get agentId: null).
async function getFileAllocation(fileId, { user = null } = {}) {
  const id = Number(fileId);
  if (!Number.isFinite(id)) return null;

  const file = await getFileRow(id);
  if (!file) return null;
  if (user) await assertCallerCanAccessFile(user, file);

  const [rows] = await pool.query(
    `SELECT d.assigned_agent AS agent_name,
            ua.id AS agent_id,
            COUNT(*) AS case_count,
            COALESCE(SUM(d.loan_amount), 0) AS loan_total,
            COALESCE(SUM(d.outstanding_balance), 0) AS outstanding_total
     FROM debtors d
     LEFT JOIN users ua ON ua.name = d.assigned_agent
     WHERE d.file_id = ? AND d.deleted_at IS NULL
       AND d.assigned_agent IS NOT NULL AND d.assigned_agent <> ''
     GROUP BY d.assigned_agent, ua.id
     ORDER BY case_count DESC, d.assigned_agent ASC`,
    [id]
  );

  const allocated = rows.map((r) => ({
    agentId: r.agent_id ? Number(r.agent_id) : null,
    agentName: r.agent_name,
    caseCount: Number(r.case_count) || 0,
    loanTotal: Number(r.loan_total) || 0,
    outstandingTotal: Number(r.outstanding_total) || 0,
  }));

  const [unassigned] = await pool.query(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(loan_amount), 0) AS loan_total
     FROM debtors
     WHERE file_id = ? AND deleted_at IS NULL
       AND (assigned_agent IS NULL OR assigned_agent = '')`,
    [id]
  );

  const [totals] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM debtors WHERE file_id = ? AND deleted_at IS NULL`,
    [id]
  );

  return {
    file: {
      id: file.id,
      clientId: file.client_id || null,
      clientName: file.client_name || null,
      fileName: file.file_name || null,
    },
    totalCases: Number(totals[0]?.cnt) || 0,
    assignedCases: allocated.reduce((sum, a) => sum + a.caseCount, 0),
    unassignedCases: Number(unassigned[0]?.cnt) || 0,
    unassignedLoanTotal: Number(unassigned[0]?.loan_total) || 0,
    allocated,
  };
}

// Round-robin distribute the currently-unassigned cases in a file among the
// selected agents. `assigned_agent` is stamped with the agent's name.
async function assignFileAgents(fileId, agentIds, { performedBy } = {}) {
  const id = Number(fileId);
  if (!Number.isFinite(id)) {
    const err = new Error('Invalid file id');
    err.code = 'VALIDATION';
    throw err;
  }
  const ids = Array.isArray(agentIds) ? agentIds.map(Number).filter(Boolean) : [];
  if (ids.length === 0) {
    const err = new Error('Select at least one agent');
    err.code = 'VALIDATION';
    throw err;
  }

  const file = await getFileRow(id);
  if (!file) {
    const err = new Error('Case file not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (performedBy) {
    await assertCallerCanAccessFile(performedBy, file);
  }

  const fileCenterId = await getFileCallCenterId(file);
  if (!fileCenterId && isSupervisorRole(performedBy) && !performedBy?.isSystemAdmin) {
    const err = new Error('This portfolio has not been assigned to a call center yet');
    err.code = 'VALIDATION';
    throw err;
  }

  const agents = [];
  for (const agentId of ids) {
    const agent = await getAgentById(agentId);
    if (!agent) continue;
    agents.push(agent);
  }
  if (agents.length === 0) {
    const err = new Error('No valid agents selected');
    err.code = 'VALIDATION';
    throw err;
  }

  await assertAgentsInCallerCenter(performedBy, agents, fileCenterId);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [unassigned] = await conn.query(
      `SELECT id, name FROM debtors
       WHERE file_id = ? AND deleted_at IS NULL
         AND (assigned_agent IS NULL OR assigned_agent = '')
       ORDER BY id ASC
       FOR UPDATE`,
      [id]
    );

    const perAgentCounts = new Map(agents.map((a) => [a.id, 0]));
    const debtorEvents = [];
    for (let i = 0; i < unassigned.length; i += 1) {
      const agent = agents[i % agents.length];
      await conn.query('UPDATE debtors SET assigned_agent = ? WHERE id = ?', [
        agent.name,
        unassigned[i].id,
      ]);
      perAgentCounts.set(agent.id, perAgentCounts.get(agent.id) + 1);
      const metadata = { agentName: agent.name };
      debtorEvents.push({
        debtorId: unassigned[i].id,
        actionType: 'debtor.assigned',
        title: assignmentEventTitle('debtor.assigned', metadata),
        subject: unassigned[i].name || `Debtor #${unassigned[i].id}`,
        metadata,
      });
    }

    await conn.commit();
    await recordDebtorAssignmentEvents(debtorEvents, { performedBy, fileId: id });

    const affected = agents
      .map((a) => ({ agent: a, caseCount: perAgentCounts.get(a.id) }))
      .filter((x) => x.caseCount > 0);

    // Best-effort notifications (after commit, so agents only hear about
    // assignments that actually landed).
    for (const { agent, caseCount } of affected) {
      notifyAgentOfAssignment({
        agent,
        action: 'assigned',
        file,
        caseCount,
        performedBy,
      }).catch(() => {});
    }

    return {
      fileId: id,
      distributed: unassigned.length,
      agents: affected.map((x) => ({
        agentId: x.agent.id,
        agentName: x.agent.name,
        caseCount: x.caseCount,
      })),
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// Clear assignments for the chosen agents within a file.
async function unassignFileAgents(fileId, agentIds, { performedBy } = {}) {
  const id = Number(fileId);
  if (!Number.isFinite(id)) {
    const err = new Error('Invalid file id');
    err.code = 'VALIDATION';
    throw err;
  }
  const ids = Array.isArray(agentIds) ? agentIds.map(Number).filter(Boolean) : [];
  if (ids.length === 0) {
    const err = new Error('Select at least one agent');
    err.code = 'VALIDATION';
    throw err;
  }

  const file = await getFileRow(id);
  if (!file) {
    const err = new Error('Case file not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (performedBy) {
    await assertCallerCanAccessFile(performedBy, file);
  }

  const agents = [];
  for (const agentId of ids) {
    const agent = await getAgentById(agentId);
    if (agent) agents.push(agent);
  }
  if (agents.length === 0) {
    const err = new Error('No valid agents selected');
    err.code = 'VALIDATION';
    throw err;
  }

  const results = [];
  const debtorEvents = [];

  for (const agent of agents) {
    const [assignedRows] = await pool.query(
      `SELECT id, name FROM debtors
       WHERE file_id = ? AND deleted_at IS NULL AND assigned_agent = ?`,
      [id, agent.name]
    );
    const [result] = await pool.query(
      `UPDATE debtors SET assigned_agent = NULL
       WHERE file_id = ? AND deleted_at IS NULL AND assigned_agent = ?`,
      [id, agent.name]
    );
    const caseCount = result.affectedRows || 0;
    if (caseCount > 0) {
      assignedRows.forEach((row) => {
        const metadata = { previousAgentName: agent.name };
        debtorEvents.push({
          debtorId: row.id,
          actionType: 'debtor.unassigned',
          title: assignmentEventTitle('debtor.unassigned', metadata),
          subject: row.name || `Debtor #${row.id}`,
          metadata,
        });
      });
    }
    results.push({ agentId: agent.id, agentName: agent.name, caseCount });
    if (caseCount > 0) {
      notifyAgentOfAssignment({
        agent,
        action: 'unallocated',
        file,
        caseCount,
        performedBy,
      }).catch(() => {});
    }
  }

  await recordDebtorAssignmentEvents(debtorEvents, { performedBy, fileId: id });

  return {
    fileId: id,
    unallocated: results.reduce((sum, r) => sum + r.caseCount, 0),
    agents: results,
  };
}

// Move all cases assigned to `fromAgentId` over to `toAgentId` within a file.
async function reallocateFileAgents(fileId, { fromAgentId, toAgentId } = {}, { performedBy } = {}) {
  const id = Number(fileId);
  if (!Number.isFinite(id)) {
    const err = new Error('Invalid file id');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!fromAgentId || !toAgentId) {
    const err = new Error('Both source and target agents are required');
    err.code = 'VALIDATION';
    throw err;
  }
  if (Number(fromAgentId) === Number(toAgentId)) {
    const err = new Error('Source and target agents must differ');
    err.code = 'VALIDATION';
    throw err;
  }

  const file = await getFileRow(id);
  if (!file) {
    const err = new Error('Case file not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (performedBy) {
    await assertCallerCanAccessFile(performedBy, file);
  }

  const fromAgent = await getAgentById(fromAgentId);
  const toAgent = await getAgentById(toAgentId);
  if (!fromAgent || !toAgent) {
    const err = new Error('Agent not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fileCenterId = await getFileCallCenterId(file);
  await assertAgentsInCallerCenter(performedBy, [fromAgent, toAgent], fileCenterId);

  const conn = await pool.getConnection();
  let movedRows = [];
  let caseCount = 0;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id, name FROM debtors
       WHERE file_id = ? AND deleted_at IS NULL AND assigned_agent = ?
       FOR UPDATE`,
      [id, fromAgent.name]
    );
    movedRows = rows;
    if (movedRows.length > 0) {
      const [result] = await conn.query(
        `UPDATE debtors SET assigned_agent = ?
         WHERE file_id = ? AND deleted_at IS NULL AND assigned_agent = ?`,
        [toAgent.name, id, fromAgent.name]
      );
      caseCount = result.affectedRows || 0;
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  if (caseCount > 0) {
    const metadata = {
      previousAgentName: fromAgent.name,
      agentName: toAgent.name,
    };
    notifyAgentOfAssignment({
      agent: fromAgent,
      action: 'unallocated',
      file,
      caseCount,
      performedBy,
    }).catch(() => {});
    notifyAgentOfAssignment({
      agent: toAgent,
      action: 'reallocated',
      file,
      caseCount,
      performedBy,
    }).catch(() => {});
    await recordDebtorAssignmentEvents(
      movedRows.map((row) => ({
        debtorId: row.id,
        actionType: 'debtor.reassigned',
        title: assignmentEventTitle('debtor.reassigned', metadata),
        subject: row.name || `Debtor #${row.id}`,
        metadata,
      })),
      { performedBy, fileId: id }
    );
  }

  return {
    fileId: id,
    reallocated: caseCount,
    fromAgent: { id: fromAgent.id, name: fromAgent.name },
    toAgent: { id: toAgent.id, name: toAgent.name },
  };
}

// Assign a specific set of debtor cases (within a file) to the chosen agents,
// round-robin. Overwrites each case's prior agent. Fires per-agent
// notifications based on net gained/lost deltas.
async function assignCases(fileId, debtorIds, agentIds, { performedBy } = {}) {
  const id = Number(fileId);
  if (!Number.isFinite(id)) {
    const err = new Error('Invalid file id');
    err.code = 'VALIDATION';
    throw err;
  }
  const dIds = Array.isArray(debtorIds) ? debtorIds.map(Number).filter(Boolean) : [];
  if (dIds.length === 0) {
    const err = new Error('Select at least one case');
    err.code = 'VALIDATION';
    throw err;
  }
  const aIds = Array.isArray(agentIds) ? agentIds.map(Number).filter(Boolean) : [];
  if (aIds.length === 0) {
    const err = new Error('Select at least one agent');
    err.code = 'VALIDATION';
    throw err;
  }

  const file = await getFileRow(id);
  if (!file) {
    const err = new Error('Case file not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (performedBy) {
    await assertCallerCanAccessFile(performedBy, file);
  }

  const agents = [];
  for (const agentId of aIds) {
    const agent = await getAgentById(agentId);
    if (agent) agents.push(agent);
  }
  if (agents.length === 0) {
    const err = new Error('No valid agents selected');
    err.code = 'VALIDATION';
    throw err;
  }

  const fileCenterId = await getFileCallCenterId(file);
  await assertAgentsInCallerCenter(performedBy, agents, fileCenterId);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Only debtors that actually belong to this file are eligible.
    const [rows] = await conn.query(
      `SELECT id, name, assigned_agent FROM debtors
       WHERE file_id = ? AND deleted_at IS NULL AND id IN (?)
       ORDER BY id ASC
       FOR UPDATE`,
      [id, dIds]
    );
    if (rows.length === 0) {
      await conn.rollback();
      const err = new Error('No matching cases found in this file');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const gained = new Map(); // agentId -> count
    const lost = new Map(); // agentName -> count (previously assigned agent)
    const debtorEvents = [];

    for (let i = 0; i < rows.length; i += 1) {
      const debtor = rows[i];
      const target = agents[i % agents.length];
      const prevName = debtor.assigned_agent || null;

      if (prevName && prevName !== target.name) {
        lost.set(prevName, (lost.get(prevName) || 0) + 1);
      }
      if (!prevName || prevName !== target.name) {
        gained.set(target.id, (gained.get(target.id) || 0) + 1);
      }

      await conn.query('UPDATE debtors SET assigned_agent = ? WHERE id = ?', [
        target.name,
        debtor.id,
      ]);
      if (!prevName || prevName !== target.name) {
        const actionType = prevName ? 'debtor.reassigned' : 'debtor.assigned';
        const metadata = {
          previousAgentName: prevName,
          agentName: target.name,
        };
        debtorEvents.push({
          debtorId: debtor.id,
          actionType,
          title: assignmentEventTitle(actionType, metadata),
          subject: debtor.name || `Debtor #${debtor.id}`,
          metadata,
        });
      }
    }

    await conn.commit();
    await recordDebtorAssignmentEvents(debtorEvents, { performedBy, fileId: id });

    // Best-effort notifications: gainers -> assigned, losers -> unallocated,
    // agents that both lost and gained -> reallocated.
    const agentResults = [];
    for (const agent of agents) {
      const g = gained.get(agent.id) || 0;
      const l = lost.get(agent.name) || 0;
      if (g > 0) agentResults.push({ agentId: agent.id, agentName: agent.name, caseCount: g });
      if (g > 0 && l > 0) {
        notifyAgentOfAssignment({ agent, action: 'reallocated', file, caseCount: g, performedBy }).catch(() => {});
      } else if (g > 0) {
        notifyAgentOfAssignment({ agent, action: 'assigned', file, caseCount: g, performedBy }).catch(() => {});
      } else if (l > 0) {
        notifyAgentOfAssignment({ agent, action: 'unallocated', file, caseCount: l, performedBy }).catch(() => {});
      }
    }

    // Notify previously-assigned agents who are NOT among the chosen targets
    // (they only lost cases).
    for (const [agentName, l] of lost.entries()) {
      const stillTargeted = agents.some((a) => a.name === agentName);
      if (stillTargeted) continue;
      const [agentRows] = await pool.query(
        'SELECT u.id, u.name, u.email, u.phone FROM users u WHERE u.name = ? LIMIT 1',
        [agentName]
      );
      const losingAgent = agentRows[0]
        ? { id: agentRows[0].id, name: agentRows[0].name, email: agentRows[0].email, phone: agentRows[0].phone }
        : null;
      if (losingAgent) {
        notifyAgentOfAssignment({ agent: losingAgent, action: 'unallocated', file, caseCount: l, performedBy }).catch(() => {});
      }
    }

    return {
      fileId: id,
      assigned: rows.length,
      agents: agentResults,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// Clear assignments on a specific set of debtor cases within a file.
async function unassignCases(fileId, debtorIds, { performedBy } = {}) {
  const id = Number(fileId);
  if (!Number.isFinite(id)) {
    const err = new Error('Invalid file id');
    err.code = 'VALIDATION';
    throw err;
  }
  const dIds = Array.isArray(debtorIds) ? debtorIds.map(Number).filter(Boolean) : [];
  if (dIds.length === 0) {
    const err = new Error('Select at least one case');
    err.code = 'VALIDATION';
    throw err;
  }

  const file = await getFileRow(id);
  if (!file) {
    const err = new Error('Case file not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (performedBy) {
    await assertCallerCanAccessFile(performedBy, file);
  }

  const [rows] = await pool.query(
    `SELECT id, name, assigned_agent FROM debtors
     WHERE file_id = ? AND deleted_at IS NULL AND id IN (?)`,
    [id, dIds]
  );
  if (rows.length === 0) {
    const err = new Error('No matching cases found in this file');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const lost = new Map(); // agentName -> count
  const debtorEvents = [];
  for (const row of rows) {
    if (row.assigned_agent) {
      lost.set(row.assigned_agent, (lost.get(row.assigned_agent) || 0) + 1);
      const metadata = { previousAgentName: row.assigned_agent };
      debtorEvents.push({
        debtorId: row.id,
        actionType: 'debtor.unassigned',
        title: assignmentEventTitle('debtor.unassigned', metadata),
        subject: row.name || `Debtor #${row.id}`,
        metadata,
      });
    }
  }

  await pool.query(
    `UPDATE debtors SET assigned_agent = NULL
     WHERE file_id = ? AND deleted_at IS NULL AND id IN (?)`,
    [id, dIds]
  );

  // Best-effort notifications to each previously-assigned agent.
  const agentNames = Array.from(lost.keys());
  let agentLookup = [];
  if (agentNames.length > 0) {
    const [agentRows] = await pool.query(
      'SELECT u.id, u.name, u.email, u.phone FROM users u WHERE u.name IN (?)',
      [agentNames]
    );
    agentLookup = agentRows;
  }
  for (const [agentName, caseCount] of lost.entries()) {
    const row = agentLookup.find((r) => r.name === agentName);
    const agent = row
      ? { id: row.id, name: row.name, email: row.email, phone: row.phone }
      : { id: null, name: agentName, email: null, phone: null };
    notifyAgentOfAssignment({ agent, action: 'unallocated', file, caseCount, performedBy }).catch(() => {});
  }
  await recordDebtorAssignmentEvents(debtorEvents, { performedBy, fileId: id });

  return {
    fileId: id,
    unallocated: rows.length,
    agents: agentNames.map((name) => ({ agentName: name, caseCount: lost.get(name) })),
  };
}

module.exports = {
  listClientCaseSummary,
  listClientFiles,
  listUnassignedFiles,
  getFileAllocation,
  assignFileAgents,
  unassignFileAgents,
  reallocateFileAgents,
  assignCases,
  unassignCases,
  assertCallerCanAccessFile,
  assertCallerCanAccessClient,
};
