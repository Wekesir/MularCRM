const { isAgentRole } = require('../services/agentService');

/**
 * Case assignment (assign / unassign / reallocate) is for non-Agent system
 * users — Managers, System Admins, and other roles that supervise collectors.
 * Agents work their own assigned cases; they do not distribute the queue.
 */
function requireCaseAssigner(req, res, next) {
  if (req.user?.isSystemAdmin) return next();
  if (isAgentRole(req.user)) {
    return res.status(403).json({
      message: 'Agents cannot assign or reallocate cases. Ask a supervisor.',
    });
  }
  return next();
}

module.exports = { requireCaseAssigner };
