/**
 * Organizational role helpers for the call-center hierarchy.
 * Senior Supervisor (company-wide) → Regional Manager (region) → Call Centers → Supervisors → Agents
 *
 * Newer org-chart role names are aliased onto the same behavioral buckets.
 */

const AGENT_ROLE_NAMES = ['Agent', 'Internal Agent', 'External Agent'];
const SUPERVISOR_ROLE_NAMES = [
  'Supervisor',
  'Manager', // legacy alias
  'Call Centre Supervisor',
  'External Agent Supervisor',
];
const SENIOR_SUPERVISOR_ROLE_NAMES = [
  'Senior Supervisor',
  'Tenant Administrator',
];
const REGIONAL_MANAGER_ROLE_NAMES = ['Regional Manager'];

function normalizeRoleName(userOrRoleName) {
  if (typeof userOrRoleName === 'string') return String(userOrRoleName || '').trim();
  return String(userOrRoleName?.roleName || '').trim();
}

function roleEquals(name, list) {
  const n = normalizeRoleName(name).toLowerCase();
  return list.some((r) => r.toLowerCase() === n);
}

function isAgentRole(userOrRoleName) {
  return roleEquals(userOrRoleName, AGENT_ROLE_NAMES);
}

function isSupervisorRole(userOrRoleName) {
  return roleEquals(userOrRoleName, SUPERVISOR_ROLE_NAMES);
}

function isSeniorSupervisorRole(userOrRoleName) {
  return roleEquals(userOrRoleName, SENIOR_SUPERVISOR_ROLE_NAMES);
}

function isRegionalManagerRole(userOrRoleName) {
  return roleEquals(userOrRoleName, REGIONAL_MANAGER_ROLE_NAMES);
}

/** Roles that must be bound to a call center. */
function requiresCallCenter(userOrRoleName) {
  return isAgentRole(userOrRoleName) || isSupervisorRole(userOrRoleName);
}

/** Roles that must be bound to a region. */
function requiresRegion(userOrRoleName) {
  return isRegionalManagerRole(userOrRoleName);
}

/** Can assign/reallocate cases (Supervisor, Senior Supervisor, Regional Manager, Admin). */
function canAssignCases(user) {
  if (!user) return false;
  if (user.isSystemAdmin) return true;
  if (isAgentRole(user)) return false;
  return (
    isSupervisorRole(user) ||
    isSeniorSupervisorRole(user) ||
    isRegionalManagerRole(user)
  );
}

/**
 * Resolve the call-center / region scope for list/assign queries.
 * - Supervisor: forced to their own call_center_id (null = empty scope)
 * - Regional Manager: forced to their region_id (optional callCenterId filter within region)
 * - Senior Supervisor / Admin: optional filter, or null = company-wide
 */
function resolveCallCenterScope(user, { callCenterId } = {}) {
  if (!user) return { mode: 'none', callCenterId: null, regionId: null };

  if (user.isSystemAdmin || isSeniorSupervisorRole(user)) {
    const id = callCenterId != null && callCenterId !== '' ? Number(callCenterId) : null;
    return {
      mode: 'company',
      callCenterId: Number.isFinite(id) ? id : null,
      regionId: null,
    };
  }

  if (isRegionalManagerRole(user)) {
    const regionId = user.regionId != null ? Number(user.regionId) : null;
    const id = callCenterId != null && callCenterId !== '' ? Number(callCenterId) : null;
    return {
      mode: 'region',
      regionId: Number.isFinite(regionId) ? regionId : null,
      callCenterId: Number.isFinite(id) ? id : null,
    };
  }

  if (isSupervisorRole(user)) {
    const id = user.callCenterId != null ? Number(user.callCenterId) : null;
    return {
      mode: 'center',
      callCenterId: Number.isFinite(id) ? id : null,
      regionId: null,
    };
  }

  return { mode: 'none', callCenterId: null, regionId: null };
}

/** SQL fragment: call center ids belonging to a region. */
function sqlCentersInRegion() {
  return 'SELECT id FROM call_centers WHERE region_id = ? AND deleted_at IS NULL';
}

/**
 * Debtor visibility for a region: stamped debtor region OR file/client call center in region.
 * Optional callCenterId further narrows to that center (must still be in region).
 */
function applyRegionDebtorSql(clauses, params, regionId, callCenterId = null) {
  if (!regionId) {
    clauses.push('1=0');
    return;
  }
  if (callCenterId) {
    clauses.push(
      `(
        COALESCE(df.call_center_id, c.call_center_id) = ?
        AND (
          d.region_id = ?
          OR COALESCE(df.call_center_id, c.call_center_id) IN (${sqlCentersInRegion()})
        )
      )`
    );
    params.push(callCenterId, regionId, regionId);
    return;
  }
  clauses.push(
    `(
      d.region_id = ?
      OR COALESCE(df.call_center_id, c.call_center_id) IN (${sqlCentersInRegion()})
    )`
  );
  params.push(regionId, regionId);
}

/** Call-center column constrained to a region (and optional center filter). */
function applyRegionCenterColumnSql(clauses, params, columnSql, regionId, callCenterId = null) {
  if (!regionId) {
    clauses.push('1=0');
    return;
  }
  if (callCenterId) {
    clauses.push(`${columnSql} = ?`);
    params.push(callCenterId);
    clauses.push(`${columnSql} IN (${sqlCentersInRegion()})`);
    params.push(regionId);
    return;
  }
  clauses.push(`${columnSql} IN (${sqlCentersInRegion()})`);
  params.push(regionId);
}

module.exports = {
  AGENT_ROLE_NAMES,
  SUPERVISOR_ROLE_NAMES,
  SENIOR_SUPERVISOR_ROLE_NAMES,
  REGIONAL_MANAGER_ROLE_NAMES,
  isAgentRole,
  isSupervisorRole,
  isSeniorSupervisorRole,
  isRegionalManagerRole,
  requiresCallCenter,
  requiresRegion,
  canAssignCases,
  resolveCallCenterScope,
  sqlCentersInRegion,
  applyRegionDebtorSql,
  applyRegionCenterColumnSql,
  normalizeRoleName,
};
