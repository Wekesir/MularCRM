const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { getOrgDashboard } = require('../services/orgDashboardService');

const router = express.Router();
router.use(requireAuth);

// GET /api/dashboard — organisation-wide dashboard (non-agents)
router.get('/', async (req, res) => {
  try {
    const data = await getOrgDashboard(req.user);
    res.json(data);
  } catch (error) {
    if (error.code === 'FORBIDDEN' || error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to load dashboard', detail: error.message });
  }
});

module.exports = router;
