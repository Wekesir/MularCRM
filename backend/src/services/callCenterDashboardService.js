/**
 * Role-specific dashboards for Senior Supervisor, Regional Manager, and Call Center Supervisor.
 */
const pool = require('../db/pool');
const {
  isSeniorSupervisorRole,
  isRegionalManagerRole,
  isSupervisorRole,
  AGENT_ROLE_NAMES,
  SUPERVISOR_ROLE_NAMES,
} = require('../config/orgRoles');
const { getOrgDashboard } = require('./orgDashboardService');

async function getSeniorSupervisorDashboard({ regionId = null } = {}) {
  const regionFilter = regionId != null ? ' AND cc.region_id = ?' : '';
  const regionParams = regionId != null ? [regionId] : [];
  const centersInRegion = regionId != null
    ? 'SELECT id FROM call_centers WHERE region_id = ? AND deleted_at IS NULL'
    : null;

  const [[centers]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM call_centers cc
     WHERE cc.deleted_at IS NULL AND cc.status = 'active'${regionFilter}`,
    regionParams
  );

  let unassignedClients = { cnt: 0 };
  let assignedClients = { cnt: 0 };
  if (regionId != null) {
    // Unassigned clients are company-wide; regional managers only see assigned centers in-region.
    const [[assigned]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM clients
       WHERE deleted_at IS NULL AND call_center_id IN (${centersInRegion})`,
      [regionId]
    );
    assignedClients = assigned;
  } else {
    const [[unassigned]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM clients WHERE deleted_at IS NULL AND call_center_id IS NULL`
    );
    const [[assigned]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM clients WHERE deleted_at IS NULL AND call_center_id IS NOT NULL`
    );
    unassignedClients = unassigned;
    assignedClients = assigned;
  }

  const staffCenterClause = regionId != null
    ? ` AND u.call_center_id IN (${centersInRegion})`
    : '';
  const staffParams = (extra) =>
    regionId != null ? [...extra, regionId] : extra;

  const [[supervisors]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL AND u.is_active = 1 AND r.name IN (?)${staffCenterClause}`,
    staffParams([SUPERVISOR_ROLE_NAMES])
  );
  const [[agents]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL AND u.is_active = 1 AND r.name IN (?)${staffCenterClause}`,
    staffParams([AGENT_ROLE_NAMES])
  );

  let unboundAgents = { cnt: 0 };
  if (regionId == null) {
    const [[unbound]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.deleted_at IS NULL AND r.name IN (?) AND u.call_center_id IS NULL`,
      [AGENT_ROLE_NAMES]
    );
    unboundAgents = unbound;
  }

  const [centerRowsFixed] = await pool.query(
    `SELECT cc.id, cc.name, cc.status,
            (SELECT COUNT(*) FROM clients c WHERE c.call_center_id = cc.id AND c.deleted_at IS NULL) AS client_count,
            (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id
              WHERE u.call_center_id = cc.id AND u.deleted_at IS NULL AND r.name IN (?)) AS supervisor_count,
            (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id
              WHERE u.call_center_id = cc.id AND u.deleted_at IS NULL AND r.name IN (?)) AS agent_count
     FROM call_centers cc
     WHERE cc.deleted_at IS NULL${regionFilter}
     ORDER BY cc.name ASC`,
    regionId != null
      ? [SUPERVISOR_ROLE_NAMES, AGENT_ROLE_NAMES, regionId]
      : [SUPERVISOR_ROLE_NAMES, AGENT_ROLE_NAMES]
  );

  const assignmentCenterClause = regionId != null
    ? ` AND c.call_center_id IN (${centersInRegion})`
    : ' AND c.call_center_id IS NOT NULL';
  const assignmentParams = regionId != null ? [regionId] : [];

  const [recentAssignments] = await pool.query(
    `SELECT c.id, c.name, c.call_center_id, cc.name AS call_center_name, c.call_center_assigned_at
     FROM clients c
     LEFT JOIN call_centers cc ON cc.id = c.call_center_id
     WHERE c.deleted_at IS NULL${assignmentCenterClause}
     ORDER BY c.call_center_assigned_at DESC
     LIMIT 10`,
    assignmentParams
  );

  let activeStaffCoverages = 0;
  try {
    const { countActiveStaffCoverages } = require('./staffCoverageService');
    activeStaffCoverages = await countActiveStaffCoverages({
      user: regionId != null ? { isSystemAdmin: false, regionId, roleName: 'Regional Manager' } : { isSystemAdmin: true },
    });
  } catch {
    activeStaffCoverages = 0;
  }

  let centersWithoutSupervisor = 0;
  try {
    centersWithoutSupervisor = centerRowsFixed.filter(
      (r) => Number(r.supervisor_count) === 0 && String(r.status) === 'active'
    ).length;
  } catch {
    centersWithoutSupervisor = 0;
  }

  return {
    variant: regionId != null ? 'regional_manager' : 'senior_supervisor',
    regionId: regionId != null ? Number(regionId) : null,
    summary: {
      activeCallCenters: Number(centers?.cnt) || 0,
      unassignedClients: Number(unassignedClients?.cnt) || 0,
      assignedClients: Number(assignedClients?.cnt) || 0,
      supervisors: Number(supervisors?.cnt) || 0,
      agents: Number(agents?.cnt) || 0,
      unboundAgents: Number(unboundAgents?.cnt) || 0,
      activeStaffCoverages,
      centersWithoutSupervisor,
    },
    callCenters: centerRowsFixed.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      clientCount: Number(r.client_count) || 0,
      supervisorCount: Number(r.supervisor_count) || 0,
      agentCount: Number(r.agent_count) || 0,
    })),
    recentClientAssignments: recentAssignments.map((r) => ({
      clientId: r.id,
      clientName: r.name,
      callCenterId: r.call_center_id,
      callCenterName: r.call_center_name,
      assignedAt: r.call_center_assigned_at,
    })),
  };
}

async function getSupervisorDashboard(user) {
  const { countActiveCoverages } = require('./agentCoverageService');
  const callCenterId = user?.callCenterId != null ? Number(user.callCenterId) : null;
  if (!callCenterId) {
    return {
      variant: 'supervisor',
      callCenter: null,
      summary: {
        clients: 0,
        agents: 0,
        newBatches: 0,
        unassignedCases: 0,
        assignedCases: 0,
        outstanding: 0,
        collected: 0,
        activeCoverages: 0,
      },
      newBatches: [],
      agents: [],
      message: 'You are not bound to a call center yet. Ask a Senior Supervisor to assign you.',
    };
  }

  const [centers] = await pool.query(
    `SELECT id, name, status FROM call_centers WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [callCenterId]
  );
  const center = centers[0] || null;

  const [[clientCount]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM clients WHERE deleted_at IS NULL AND call_center_id = ?`,
    [callCenterId]
  );
  const [[agentCount]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL AND u.is_active = 1 AND u.call_center_id = ? AND r.name IN (?)`,
    [callCenterId, AGENT_ROLE_NAMES]
  );

  const [[portfolio]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN d.assigned_agent IS NULL OR d.assigned_agent = '' THEN 1 ELSE 0 END), 0) AS unassigned_cases,
       COALESCE(SUM(CASE WHEN d.assigned_agent IS NOT NULL AND d.assigned_agent <> '' THEN 1 ELSE 0 END), 0) AS assigned_cases,
       COALESCE(SUM(d.outstanding_balance), 0) AS outstanding,
       COALESCE(SUM(d.total_paid), 0) AS collected
     FROM debtors d
     JOIN clients c ON c.id = d.client_id
     LEFT JOIN debtor_files df ON df.id = d.file_id AND df.deleted_at IS NULL
     WHERE d.deleted_at IS NULL AND c.deleted_at IS NULL
       AND COALESCE(df.call_center_id, c.call_center_id) = ?`,
    [callCenterId]
  );

  // New / unallocated batches bound to this call center (file preferred; client fallback).
  const [batchRows] = await pool.query(
    `SELECT df.id, df.file_name, df.created_at, df.imported_count, c.id AS client_id, c.name AS client_name,
            agg.unassigned_cases, agg.loan_total
     FROM debtor_files df
     LEFT JOIN clients c ON c.id = df.client_id
     INNER JOIN (
       SELECT file_id,
              COALESCE(SUM(CASE WHEN assigned_agent IS NULL OR assigned_agent = '' THEN 1 ELSE 0 END), 0) AS unassigned_cases,
              COALESCE(SUM(loan_amount), 0) AS loan_total
       FROM debtors
       WHERE deleted_at IS NULL
       GROUP BY file_id
       HAVING COALESCE(SUM(CASE WHEN assigned_agent IS NULL OR assigned_agent = '' THEN 1 ELSE 0 END), 0) > 0
     ) agg ON agg.file_id = df.id
     WHERE df.deleted_at IS NULL
       AND (df.is_closed = 0 OR df.is_closed IS NULL)
       AND (df.call_center_id = ? OR (df.call_center_id IS NULL AND c.call_center_id = ?))
     ORDER BY df.created_at DESC
     LIMIT 25`,
    [callCenterId, callCenterId]
  );

  const [agentRows] = await pool.query(
    `SELECT u.id, u.name, u.email,
            (SELECT COUNT(*) FROM debtors d
              WHERE (d.assigned_agent_user_id = u.id
                     OR (d.assigned_agent_user_id IS NULL AND d.assigned_agent = u.name))
                AND d.deleted_at IS NULL AND d.is_closed = 0) AS cases_assigned
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL AND u.is_active = 1 AND u.call_center_id = ? AND r.name IN (?)
     ORDER BY u.name ASC
     LIMIT 20`,
    [callCenterId, AGENT_ROLE_NAMES]
  );

  const activeCoverages = await countActiveCoverages({ user });

  return {
    variant: 'supervisor',
    callCenter: center
      ? { id: center.id, name: center.name, status: center.status }
      : null,
    summary: {
      clients: Number(clientCount?.cnt) || 0,
      agents: Number(agentCount?.cnt) || 0,
      newBatches: batchRows.length,
      unassignedCases: Number(portfolio?.unassigned_cases) || 0,
      assignedCases: Number(portfolio?.assigned_cases) || 0,
      outstanding: Number(portfolio?.outstanding) || 0,
      collected: Number(portfolio?.collected) || 0,
      activeCoverages,
    },
    newBatches: batchRows.map((r) => ({
      fileId: r.id,
      fileName: r.file_name,
      clientId: r.client_id,
      clientName: r.client_name,
      importedCount: Number(r.imported_count) || 0,
      unassignedCases: Number(r.unassigned_cases) || 0,
      loanTotal: Number(r.loan_total) || 0,
      createdAt: r.created_at,
    })),
    agents: agentRows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      casesAssigned: Number(r.cases_assigned) || 0,
    })),
  };
}

async function getDashboardForUser(user) {
  if (!user) {
    const err = new Error('Unauthorized');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }

  if (user.isSystemAdmin) {
    const org = await getOrgDashboard(user);
    // Enrich admin view with call-center breakdown.
    const senior = await getSeniorSupervisorDashboard();
    return { ...org, variant: 'admin', callCenterOverview: senior };
  }

  if (isRegionalManagerRole(user)) {
    const regionId = user.regionId != null ? Number(user.regionId) : null;
    if (!regionId) {
      return {
        variant: 'regional_manager',
        regionId: null,
        summary: {
          activeCallCenters: 0,
          unassignedClients: 0,
          assignedClients: 0,
          supervisors: 0,
          agents: 0,
          unboundAgents: 0,
        },
        callCenters: [],
        recentClientAssignments: [],
        message: 'You are not bound to a region yet. Ask an administrator to assign you.',
      };
    }
    const dash = await getSeniorSupervisorDashboard({ regionId });
    return {
      ...dash,
      regionName: user.regionName || null,
    };
  }

  if (isSeniorSupervisorRole(user)) {
    return getSeniorSupervisorDashboard();
  }

  if (isSupervisorRole(user)) {
    return getSupervisorDashboard(user);
  }

  // Fallback: org dashboard for other non-agent roles
  const org = await getOrgDashboard(user);
  return { ...org, variant: 'org' };
}

module.exports = {
  getDashboardForUser,
  getSeniorSupervisorDashboard,
  getSupervisorDashboard,
};
