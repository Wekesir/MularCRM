const express = require('express');
const {
  getReportGateStatus,
  unlockReport,
  listReportAccessSettings,
  setReportPassword,
  clearReportPassword,
  getUserPermissionsByEmail,
  canReadReport,
  slugToPermissionKey,
} = require('../services/reportAccessService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/permissions', requireAuth, async (req, res) => {
  try {
    const result = await getUserPermissionsByEmail(req.user.email);
    if (!result) return res.status(404).json({ message: 'User not found' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get permissions', detail: error.message });
  }
});

router.get('/access-settings', requireAuth, async (_req, res) => {
  try {
    const settings = await listReportAccessSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list report access settings', detail: error.message });
  }
});

router.put('/access-settings/:slug/password', requireAuth, async (req, res) => {
  try {
    const result = await setReportPassword(req.params.slug, req.body.password);
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'report.password_set',
      title: 'Report Password Set',
      subject: req.params.slug,
      entityType: 'report_access',
      entityId: req.params.slug,
    }).catch(() => {});
  } catch (error) {
    res.status(400).json({ message: error.message || 'Failed to set report password' });
  }
});

router.delete('/access-settings/:slug/password', requireAuth, async (req, res) => {
  try {
    const result = await clearReportPassword(req.params.slug);
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'report.password_cleared',
      title: 'Report Password Cleared',
      subject: req.params.slug,
      entityType: 'report_access',
      entityId: req.params.slug,
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to clear report password', detail: error.message });
  }
});

router.get('/:slug/gate', requireAuth, async (req, res) => {
  try {
    const status = await getReportGateStatus(
      req.user.email,
      req.params.slug,
      req.query.token
    );
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get report gate status', detail: error.message });
  }
});

router.post('/:slug/unlock', requireAuth, async (req, res) => {
  try {
    const result = await unlockReport(req.user.email, req.params.slug, req.body.password);
    if (!result.ok) {
      return res.status(result.error?.includes('permission') ? 403 : 401).json({
        message: result.error,
      });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to unlock report', detail: error.message });
  }
});

router.get('/accessible', requireAuth, async (req, res) => {
  try {
    const context = await getUserPermissionsByEmail(req.user.email);
    if (!context) return res.status(404).json({ message: 'User not found' });

    const settings = await listReportAccessSettings();
    const passwordMap = Object.fromEntries(
      settings.map((item) => [item.slug, item.passwordSet])
    );

    const slugs = req.query.slugs ? req.query.slugs.split(',') : [];
    const accessible = slugs
      .filter((slug) => canReadReport(context, slug))
      .map((slug) => ({
        slug,
        permissionKey: slugToPermissionKey(slug),
        requiresPassword: Boolean(passwordMap[slug]),
      }));

    res.json({ accessible });
  } catch (error) {
    res.status(500).json({ message: 'Failed to list accessible reports', detail: error.message });
  }
});

module.exports = router;
