const pool = require('../db/pool');
const { getAgentById } = require('./agentService');
const { notifyAgentOfAssignment } = require('./caseAssignmentNotifications');

// Per-client case summary used by the Case Management table.
// Aggregates are computed in dedicated subqueries to avoid the cartesian
// product that joining debtors + debtor_files on client_id would create.
async function listClientCaseSummary({ search = '' } = {}) {
  const params = [];
  let where = 'WHERE c.deleted_at IS NULL';
  const q = String(search || '').trim();
  if (q) {
    where += ' AND c.name LIKE ?';
    params.push(`%${q}%`);
  }

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
       SELECT client_id, COUNT(*) AS total_files
       FROM debtor_files
       WHERE deleted_at IS NULL
       GROUP BY client_id
     ) f ON f.client_id = c.id
     LEFT JOIN (
       SELECT client_id,
              COUNT(*) AS total_cases,
              COALESCE(SUM(loan_amount), 0) AS total_amount,
              COALESCE(SUM(CASE WHEN assigned_agent IS NOT NULL AND assigned_agent <> '' THEN 1 ELSE 0 END), 0) AS assigned_cases,
              COALESCE(SUM(CASE WHEN assigned_agent IS NULL OR assigned_agent = '' THEN 1 ELSE 0 END), 0) AS unassigned_cases
       FROM debtors
       WHERE deleted_at IS NULL
       GROUP BY client_id
     ) d ON d.client_id = c.id
     ${where}
     ORDER BY d.total_cases DESC, c.name ASC`,
    params
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
async function listClientFiles(clientId) {
  const id = Number(clientId);
  if (!Number.isFinite(id)) return [];

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
     WHERE df.client_id = ? AND df.deleted_at IS NULL
     ORDER BY df.created_at DESC, df.id DESC`,
    [id]
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

// Current allocation breakdown for a case file: per-agent case counts +
// portfolio value, plus unassigned totals. `assigned_agent` is a VARCHAR
// holding the agent's name, so we resolve the agent id by joining users on
// name (best-effort — unmatched names get agentId: null).
async function getFileAllocation(fileId) {
  const id = Number(fileId);
  if (!Number.isFinite(id)) return null;

  const file = await getFileRow(id);
  if (!file) return null;

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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [unassigned] = await conn.query(
      `SELECT id FROM debtors
       WHERE file_id = ? AND deleted_at IS NULL
         AND (assigned_agent IS NULL OR assigned_agent = '')
       ORDER BY id ASC
       FOR UPDATE`,
      [id]
    );

    const perAgentCounts = new Map(agents.map((a) => [a.id, 0]));
    for (let i = 0; i < unassigned.length; i += 1) {
      const agent = agents[i % agents.length];
      await conn.query('UPDATE debtors SET assigned_agent = ? WHERE id = ?', [
        agent.name,
        unassigned[i].id,
      ]);
      perAgentCounts.set(agent.id, perAgentCounts.get(agent.id) + 1);
    }

    await conn.commit();

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

  const agentNames = agents.map((a) => a.name);
  const results = [];

  for (const agent of agents) {
    const [result] = await pool.query(
      `UPDATE debtors SET assigned_agent = NULL
       WHERE file_id = ? AND deleted_at IS NULL AND assigned_agent = ?`,
      [id, agent.name]
    );
    const caseCount = result.affectedRows || 0;
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

  const fromAgent = await getAgentById(fromAgentId);
  const toAgent = await getAgentById(toAgentId);
  if (!fromAgent || !toAgent) {
    const err = new Error('Agent not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const [result] = await pool.query(
    `UPDATE debtors SET assigned_agent = ?
     WHERE file_id = ? AND deleted_at IS NULL AND assigned_agent = ?`,
    [toAgent.name, id, fromAgent.name]
  );
  const caseCount = result.affectedRows || 0;

  if (caseCount > 0) {
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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Only debtors that actually belong to this file are eligible.
    const [rows] = await conn.query(
      `SELECT id, assigned_agent FROM debtors
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
    const agentById = new Map(agents.map((a) => [a.id, a]));

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
    }

    await conn.commit();

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

  const [rows] = await pool.query(
    `SELECT id, assigned_agent FROM debtors
     WHERE file_id = ? AND deleted_at IS NULL AND id IN (?)`,
    [id, dIds]
  );
  if (rows.length === 0) {
    const err = new Error('No matching cases found in this file');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const lost = new Map(); // agentName -> count
  for (const row of rows) {
    if (row.assigned_agent) {
      lost.set(row.assigned_agent, (lost.get(row.assigned_agent) || 0) + 1);
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

  return {
    fileId: id,
    unallocated: rows.length,
    agents: agentNames.map((name) => ({ agentName: name, caseCount: lost.get(name) })),
  };
}

module.exports = {
  listClientCaseSummary,
  listClientFiles,
  getFileAllocation,
  assignFileAgents,
  unassignFileAgents,
  reallocateFileAgents,
  assignCases,
  unassignCases,
};
