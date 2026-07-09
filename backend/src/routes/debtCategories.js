const express = require('express');
const {
  listDebtCategories,
  getDebtCategoryById,
  createDebtCategory,
  updateDebtCategory,
  deleteDebtCategory,
} = require('../services/debtCategoryService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const categories = await listDebtCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list debt categories', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const category = await getDebtCategoryById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Debt category not found' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get debt category', detail: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const category = await createDebtCategory(req.body);
    res.status(201).json(category);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'debt_category.created',
      title: 'Debt Category Created',
      subject: category.name,
      entityType: 'debt_category',
      entityId: String(category.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create debt category', detail: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const category = await updateDebtCategory(req.params.id, req.body);
    if (!category) return res.status(404).json({ message: 'Debt category not found' });
    res.json(category);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'debt_category.updated',
      title: 'Debt Category Updated',
      subject: category.name,
      entityType: 'debt_category',
      entityId: String(category.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update debt category', detail: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getDebtCategoryById(req.params.id);
    const result = await deleteDebtCategory(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Debt category not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'debt_category.deleted',
      title: 'Debt Category Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'debt_category',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to delete debt category', detail: error.message });
  }
});

module.exports = router;
