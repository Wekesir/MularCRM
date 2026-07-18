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
const {
  getReportData,
  exportReport,
  REPORT_SLUGS,
} = require('../services/reportDataService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

async function requireReportAccess(req, res, next) {
  try {
    const slug = req.params.slug;
    if (!REPORT_SLUGS.has(slug)) {
      return res.status(404).json({ message: 'Unknown report' });
    }

    const unlockToken = req.query.token || req.headers['x-report-unlock-token'] || null;
    const status = await getReportGateStatus(req.user.email, slug, unlockToken);
    if (!status.canRead) {
      return res.status(403).json({ message: 'You do not have permission to access this report' });
    }
    if (status.requiresPassword && !status.unlocked) {
      return res.status(401).json({
        message: 'Report password required',
        requiresPassword: true,
        unlocked: false,
      });
    }
    req.reportSlug = slug;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Failed to authorize report access', detail: error.message });
  }
}

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

router.get('/:slug/data', requireAuth, requireReportAccess, async (req, res) => {
  try {
    const data = await getReportData(req.params.slug, req.query, req.user);
    res.json(data);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      message: error.message || 'Failed to load report data',
      detail: status === 500 ? error.message : undefined,
    });
  }
});

router.get('/:slug/export', requireAuth, requireReportAccess, async (req, res) => {
  try {
    await exportReport(req.params.slug, req.query, req.user, res);
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    const status = error.status || 500;
    res.status(status).json({
      message: error.message || 'Failed to export report',
      detail: status === 500 ? error.message : undefined,
    });
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
