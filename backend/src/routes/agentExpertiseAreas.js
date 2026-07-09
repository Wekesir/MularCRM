const express = require('express');
const {
  listAgentExpertiseAreas,
  getAgentExpertiseAreaById,
  createAgentExpertiseArea,
  updateAgentExpertiseArea,
  deleteAgentExpertiseArea,
} = require('../services/agentExpertiseAreaService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    res.json(await listAgentExpertiseAreas());
  } catch (error) {
    res.status(500).json({ message: 'Failed to list expertise areas', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const area = await getAgentExpertiseAreaById(req.params.id);
    if (!area) return res.status(404).json({ message: 'Expertise area not found' });
    res.json(area);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get expertise area', detail: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const area = await createAgentExpertiseArea(req.body);
    res.status(201).json(area);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'agent_expertise.created',
      title: 'Agent Expertise Area Created',
      subject: area.name,
      entityType: 'agent_expertise_area',
      entityId: String(area.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create expertise area', detail: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const area = await updateAgentExpertiseArea(req.params.id, req.body);
    if (!area) return res.status(404).json({ message: 'Expertise area not found' });
    res.json(area);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'agent_expertise.updated',
      title: 'Agent Expertise Area Updated',
      subject: area.name,
      entityType: 'agent_expertise_area',
      entityId: String(area.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update expertise area', detail: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getAgentExpertiseAreaById(req.params.id);
    const result = await deleteAgentExpertiseArea(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Expertise area not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'agent_expertise.deleted',
      title: 'Agent Expertise Area Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'agent_expertise_area',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to delete expertise area', detail: error.message });
  }
});

module.exports = router;
