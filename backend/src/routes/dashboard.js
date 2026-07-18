const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { getDashboardForUser } = require('../services/callCenterDashboardService');
const { isAgentRole } = require('../config/orgRoles');

const router = express.Router();
router.use(requireAuth);

// GET /api/dashboard — role-scoped dashboard (admin / senior / supervisor / org)
router.get('/', async (req, res) => {
  try {
    if (isAgentRole(req.user) && !req.user.isSystemAdmin) {
      return res.status(403).json({
        message: 'Agents should use the personal agent dashboard',
      });
    }
    const data = await getDashboardForUser(req.user);
    res.json(data);
  } catch (error) {
    if (error.code === 'FORBIDDEN' || error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to load dashboard', detail: error.message });
  }
});

module.exports = router;
