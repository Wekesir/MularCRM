function requireSystemAdmin(req, res, next) {
  if (!req.user?.isSystemAdmin) {
    return res.status(403).json({ message: 'System administrator access required' });
  }
  return next();
}

module.exports = { requireSystemAdmin };
