const { canAssignCases, isAgentRole, isSupervisorRole } = require('../config/orgRoles');

/**
 * Case assignment is for Supervisors (within their call center), Senior Supervisors,
 * and System Admins. Agents cannot distribute the queue.
 * Supervisors actively covering a call center may assign even if unbound from a center.
 */
async function requireCaseAssigner(req, res, next) {
  try {
    if (!canAssignCases(req.user)) {
      if (isAgentRole(req.user)) {
        return res.status(403).json({
          message: 'Agents cannot assign or reallocate cases. Ask a supervisor.',
        });
      }
      return res.status(403).json({
        message: 'You do not have permission to assign or reallocate cases.',
      });
    }

    if (isSupervisorRole(req.user) && !req.user.isSystemAdmin && !req.user.callCenterId) {
      const { getActiveCoveredCallCenterIds } = require('../services/staffCoverageService');
      const covered = await getActiveCoveredCallCenterIds(req.user.id);
      if (!covered.length) {
        return res.status(403).json({
          message: 'You must be bound to a call center before assigning cases.',
        });
      }
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to verify case assignment permission',
      detail: error.message,
    });
  }
}

module.exports = { requireCaseAssigner };
