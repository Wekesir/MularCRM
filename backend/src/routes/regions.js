const express = require('express');
const {
  listRegions,
  getRegionById,
  createRegion,
  updateRegion,
  deleteRegion,
} = require('../services/regionService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const includeInactive = String(_req.query.includeInactive || 'true') !== 'false';
    const regions = await listRegions({ includeInactive });
    res.json(regions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list regions', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const region = await getRegionById(req.params.id);
    if (!region) return res.status(404).json({ message: 'Region not found' });
    res.json(region);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get region', detail: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const region = await createRegion(req.body);
    res.status(201).json(region);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'region.created',
      title: 'Region Created',
      subject: region.name,
      entityType: 'region',
      entityId: String(region.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create region', detail: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const region = await updateRegion(req.params.id, req.body);
    if (!region) return res.status(404).json({ message: 'Region not found' });
    res.json(region);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'region.updated',
      title: 'Region Updated',
      subject: region.name,
      entityType: 'region',
      entityId: String(region.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update region', detail: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getRegionById(req.params.id);
    const result = await deleteRegion(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Region not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'region.deleted',
      title: 'Region Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'region',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'IN_USE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to delete region', detail: error.message });
  }
});

module.exports = router;
