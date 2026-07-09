const express = require('express');
const {
  getPermissionRegistry,
  listRoles,
  listRolesPaginated,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
} = require('../services/accessControlService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

function getSearchValue(query) {
  if (query.search && typeof query.search === 'object') {
    return query.search.value || '';
  }
  return query['search[value]'] || '';
}

router.get('/permission-registry', (_req, res) => {
  res.json(getPermissionRegistry());
});

router.get('/roles', async (req, res) => {
  try {
    if (req.query.draw !== undefined) {
      const result = await listRolesPaginated({
        draw: req.query.draw,
        start: req.query.start,
        length: req.query.length,
        search: getSearchValue(req.query),
      });
      return res.json(result);
    }

    const roles = await listRoles();
    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list roles', detail: error.message });
  }
});

router.get('/roles/:id', async (req, res) => {
  try {
    const role = await getRoleById(req.params.id);
    if (!role) return res.status(404).json({ message: 'Role not found' });
    res.json(role);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get role', detail: error.message });
  }
});

router.post('/roles', async (req, res) => {
  try {
    const role = await createRole(req.body);
    res.status(201).json(role);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'role.created',
      title: 'Role Created',
      subject: role.name,
      entityType: 'role',
      entityId: String(role.id),
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to create role', detail: error.message });
  }
});

router.put('/roles/:id', async (req, res) => {
  try {
    const role = await updateRole(req.params.id, req.body);
    if (!role) return res.status(404).json({ message: 'Role not found' });
    res.json(role);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'role.updated',
      title: 'Role Updated',
      subject: role.name,
      entityType: 'role',
      entityId: String(role.id),
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to update role', detail: error.message });
  }
});

router.delete('/roles/:id', async (req, res) => {
  try {
    const existing = await getRoleById(req.params.id);
    const result = await deleteRole(req.params.id);
    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'role.deleted',
      title: 'Role Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'role',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete role', detail: error.message });
  }
});

module.exports = router;
