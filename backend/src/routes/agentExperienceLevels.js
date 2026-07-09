const express = require('express');
const {
  listAgentExperienceLevels,
  getAgentExperienceLevelById,
  createAgentExperienceLevel,
  updateAgentExperienceLevel,
  deleteAgentExperienceLevel,
} = require('../services/agentExperienceLevelService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    res.json(await listAgentExperienceLevels());
  } catch (error) {
    res.status(500).json({ message: 'Failed to list experience levels', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const level = await getAgentExperienceLevelById(req.params.id);
    if (!level) return res.status(404).json({ message: 'Experience level not found' });
    res.json(level);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get experience level', detail: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const level = await createAgentExperienceLevel(req.body);
    res.status(201).json(level);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'agent_experience.created',
      title: 'Agent Experience Level Created',
      subject: level.name,
      entityType: 'agent_experience_level',
      entityId: String(level.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create experience level', detail: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const level = await updateAgentExperienceLevel(req.params.id, req.body);
    if (!level) return res.status(404).json({ message: 'Experience level not found' });
    res.json(level);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'agent_experience.updated',
      title: 'Agent Experience Level Updated',
      subject: level.name,
      entityType: 'agent_experience_level',
      entityId: String(level.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update experience level', detail: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getAgentExperienceLevelById(req.params.id);
    const result = await deleteAgentExperienceLevel(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Experience level not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'agent_experience.deleted',
      title: 'Agent Experience Level Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'agent_experience_level',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to delete experience level', detail: error.message });
  }
});

module.exports = router;
