const express = require('express');
const { listAgents, getAgentById, upsertAgentProfile, setAgentActiveStatus } = require('../services/agentService');
const { getKpisByUserId, upsertKpis } = require('../services/agentKpiService');
const { getAgentDashboard } = require('../services/agentDashboardService');
const {
  listPortfolio,
  getPortfolioTotals,
  sendPortfolioSms,
  sendPortfolioEmail,
  logPortfolioResponse,
  getPortfolioActivity,
  startPortfolioCall,
} = require('../services/agentPortfolioService');
const {
  listSimCards,
  createSimCard,
  updateSimCard,
  deleteSimCard,
} = require('../services/agentSimCardService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireSystemAdmin } = require('../middleware/requireSystemAdmin');

function portfolioErrorStatus(error) {
  return (
    error.status ||
    (error.code === 'FORBIDDEN'
      ? 403
      : error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'BAD_REQUEST'
          ? 400
          : error.code === 'SEND_FAILED'
            ? 502
            : 500)
  );
}

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
      callCenterId: req.query.callCenterId || undefined,
      user: req.user,
    });
    res.json(agents);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list agents', detail: error.message });
  }
});

// Personal agent dashboard — must be registered before /:id
router.get('/me/dashboard', async (req, res) => {
  try {
    const data = await getAgentDashboard(req.user, { period: req.query.period });
    res.json(data);
  } catch (error) {
    if (error.code === 'FORBIDDEN' || error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    if (error.code === 'NOT_FOUND' || error.status === 404) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to load agent dashboard', detail: error.message });
  }
});

// Agent portfolio — must be registered before /:id
router.get('/me/portfolio', async (req, res) => {
  try {
    const data = await listPortfolio(req.user, req.query);
    res.json(data);
  } catch (error) {
    if (error.code === 'FORBIDDEN' || error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to load portfolio', detail: error.message });
  }
});

router.get('/me/portfolio/totals', async (req, res) => {
  try {
    const data = await getPortfolioTotals(req.user, req.query);
    res.json(data);
  } catch (error) {
    if (error.code === 'FORBIDDEN' || error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to load portfolio totals', detail: error.message });
  }
});

router.post('/me/portfolio/:debtorId/sms', async (req, res) => {
  try {
    const result = await sendPortfolioSms(req.user, req.params.debtorId, req.body || {});
    res.json(result);
  } catch (error) {
    const status =
      error.status ||
      (error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'BAD_REQUEST'
            ? 400
            : error.code === 'SEND_FAILED'
              ? 502
              : 500);
    if (status !== 500) return res.status(status).json({ message: error.message });
    res.status(500).json({ message: 'Failed to send SMS', detail: error.message });
  }
});

router.post('/me/portfolio/:debtorId/email', async (req, res) => {
  try {
    const result = await sendPortfolioEmail(req.user, req.params.debtorId, req.body || {});
    res.json(result);
  } catch (error) {
    const status =
      error.status ||
      (error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'BAD_REQUEST'
            ? 400
            : 500);
    if (status !== 500) return res.status(status).json({ message: error.message });
    res.status(500).json({ message: 'Failed to send email', detail: error.message });
  }
});

router.post('/me/portfolio/:debtorId/responses', async (req, res) => {
  try {
    const result = await logPortfolioResponse(req.user, req.params.debtorId, req.body || {});
    res.status(201).json(result);
  } catch (error) {
    const status = portfolioErrorStatus(error);
    if (status !== 500) return res.status(status).json({ message: error.message });
    res.status(500).json({ message: 'Failed to log response', detail: error.message });
  }
});

router.get('/me/portfolio/:debtorId/activity', async (req, res) => {
  try {
    const data = await getPortfolioActivity(req.user, req.params.debtorId, {
      channel: req.query.channel,
      limit: req.query.limit,
    });
    res.json(data);
  } catch (error) {
    const status = portfolioErrorStatus(error);
    if (status !== 500) return res.status(status).json({ message: error.message });
    res.status(500).json({ message: 'Failed to load debtor activity', detail: error.message });
  }
});

router.post('/me/portfolio/:debtorId/calls', async (req, res) => {
  try {
    const result = await startPortfolioCall(req.user, req.params.debtorId, req.body || {});
    res.status(201).json(result);
  } catch (error) {
    const status = portfolioErrorStatus(error);
    if (status !== 500) return res.status(status).json({ message: error.message });
    res.status(500).json({ message: 'Failed to start call', detail: error.message });
  }
});

// ── Agent SIM cards (Africa's Talking voice lines) ──
router.get('/me/sim-cards', async (req, res) => {
  try {
    const items = await listSimCards(req.user.id);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load SIM cards', detail: error.message });
  }
});

router.post('/me/sim-cards', async (req, res) => {
  try {
    const item = await createSimCard(req.user.id, req.body || {});
    res.status(201).json(item);
  } catch (error) {
    const status = portfolioErrorStatus(error);
    if (status !== 500) return res.status(status).json({ message: error.message });
    res.status(500).json({ message: 'Failed to add SIM card', detail: error.message });
  }
});

router.patch('/me/sim-cards/:id', async (req, res) => {
  try {
    const item = await updateSimCard(req.user.id, req.params.id, req.body || {});
    res.json(item);
  } catch (error) {
    const status = portfolioErrorStatus(error);
    if (status !== 500) return res.status(status).json({ message: error.message });
    res.status(500).json({ message: 'Failed to update SIM card', detail: error.message });
  }
});

router.delete('/me/sim-cards/:id', async (req, res) => {
  try {
    const result = await deleteSimCard(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    const status = portfolioErrorStatus(error);
    if (status !== 500) return res.status(status).json({ message: error.message });
    res.status(500).json({ message: 'Failed to delete SIM card', detail: error.message });
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
