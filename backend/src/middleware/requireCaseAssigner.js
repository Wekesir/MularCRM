const { canAssignCases, isAgentRole, isSupervisorRole } = require('../config/orgRoles');

/**
 * Case assignment is for Supervisors (within their call center), Senior Supervisors,
 * and System Admins. Agents cannot distribute the queue.
 */
function requireCaseAssigner(req, res, next) {
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
    return res.status(403).json({
      message: 'You must be bound to a call center before assigning cases.',
    });
  }

  return next();
}

module.exports = { requireCaseAssigner };
