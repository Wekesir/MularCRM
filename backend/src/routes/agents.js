const express = require('express');
const { listAgents, getAgentById, upsertAgentProfile, setAgentActiveStatus } = require('../services/agentService');
const { getKpisByUserId, upsertKpis } = require('../services/agentKpiService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireSystemAdmin } = require('../middleware/requireSystemAdmin');

const router = express.Router();

router.use(requireAuth);

// GET /api/agents?experience=&expertise=&workload=&search=
router.get('/', async (req, res) => {
  try {
    const agents = await listAgents({
      experience: req.query.experience || undefined,
      expertise: req.query.expertise || undefined,
      workload: req.query.workload || undefined,
      search: req.query.search || undefined,
    });
    res.json(agents);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list agents', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const agent = await getAgentById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get agent', detail: error.message });
  }
});

router.put('/:id/profile', async (req, res) => {
  try {
    const agent = await upsertAgentProfile(req.params.id, req.body || {});
    res.json(agent);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'agent.profile_updated',
      title: 'Agent Profile Updated',
      subject: agent.name,
      entityType: 'agent',
      entityId: String(agent.id),
      metadata: {
        experience: agent.experience,
        expertise: agent.expertise,
        workload: agent.workload,
      },
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update agent profile', detail: error.message });
  }
});

// GET /api/agents/:id/kpis — KPI targets for an agent (auth-only; visible to any signed-in user).
router.get('/:id/kpis', async (req, res) => {
  try {
    const kpis = await getKpisByUserId(req.params.id);
    if (!kpis) return res.json(null);
    res.json(kpis);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load agent KPIs', detail: error.message });
  }
});

// PUT /api/agents/:id/kpis  { calls:{daily,weekly,monthly}, collection:{...}, sms, emails, ptpVolume, effectiveFrom, notes }
router.put('/:id/kpis', requireSystemAdmin, async (req, res) => {
  try {
    const kpis = await upsertKpis(req.params.id, req.body || {}, req.user?.id);
    const agent = await getAgentById(req.params.id);
    res.json(kpis);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'agent.kpis_updated',
      title: 'Agent KPIs Updated',
      subject: agent?.name,
      entityType: 'agent',
      entityId: String(req.params.id),
      metadata: {
        calls: kpis.calls,
        collection: kpis.collection,
        sms: kpis.sms,
        emails: kpis.emails,
        ptpVolume: kpis.ptpVolume,
        effectiveFrom: kpis.effectiveFrom,
      },
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update agent KPIs', detail: error.message });
  }
});

// PATCH /api/agents/:id/status  { isActive: boolean }  — system admins only
router.patch('/:id/status', requireSystemAdmin, async (req, res) => {
  try {
    const isActive = Boolean(req.body?.isActive);
    const agent = await setAgentActiveStatus(req.params.id, isActive);
    res.json(agent);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: isActive ? 'agent.activated' : 'agent.deactivated',
      title: isActive ? 'Agent Activated' : 'Agent Deactivated',
      subject: agent.name,
      entityType: 'agent',
      entityId: String(agent.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update agent status', detail: error.message });
  }
});

module.exports = router;
