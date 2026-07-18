/**
 * Organizational role helpers for the call-center hierarchy.
 * Senior Supervisor (company-wide) → Call Centers → Supervisors → Agents
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
  'Regional Manager',
  'Tenant Administrator',
];

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

/** Roles that must be bound to a call center. */
function requiresCallCenter(userOrRoleName) {
  return isAgentRole(userOrRoleName) || isSupervisorRole(userOrRoleName);
}

/** Can assign/reallocate cases (Supervisor, Senior Supervisor, Admin). */
function canAssignCases(user) {
  if (!user) return false;
  if (user.isSystemAdmin) return true;
  if (isAgentRole(user)) return false;
  return isSupervisorRole(user) || isSeniorSupervisorRole(user);
}

/**
 * Resolve the call-center scope for list/assign queries.
 * - Supervisor: forced to their own call_center_id (null = empty scope)
 * - Senior Supervisor / Admin: optional filter, or null = company-wide
 */
function resolveCallCenterScope(user, { callCenterId } = {}) {
  if (!user) return { mode: 'none', callCenterId: null };
  if (user.isSystemAdmin || isSeniorSupervisorRole(user)) {
    const id = callCenterId != null && callCenterId !== '' ? Number(callCenterId) : null;
    return {
      mode: 'company',
      callCenterId: Number.isFinite(id) ? id : null,
    };
  }
  if (isSupervisorRole(user)) {
    const id = user.callCenterId != null ? Number(user.callCenterId) : null;
    return {
      mode: 'center',
      callCenterId: Number.isFinite(id) ? id : null,
    };
  }
  return { mode: 'none', callCenterId: null };
}

module.exports = {
  AGENT_ROLE_NAMES,
  SUPERVISOR_ROLE_NAMES,
  SENIOR_SUPERVISOR_ROLE_NAMES,
  isAgentRole,
  isSupervisorRole,
  isSeniorSupervisorRole,
  requiresCallCenter,
  canAssignCases,
  resolveCallCenterScope,
  normalizeRoleName,
};
