function ensureDatabaseUp(pool) {
  return async (_req, res, next) => {
    try {
      await pool.query('SELECT 1');
      next();
    } catch (error) {
      res.status(503).json({
        status: 'error',
        service: 'database',
        message: 'Database is unavailable',
        detail: error.message,
      });
    }
  };
}

module.exports = { ensureDatabaseUp };
