require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');
const { initDatabase } = require('./db/init');
const { ensureBackendUp, markBackendReady } = require('./middleware/ensureBackendUp');
const { ensureDatabaseUp } = require('./middleware/ensureDatabaseUp');
const systemConfigRouter = require('./routes/systemConfig');
const accessControlRouter = require('./routes/accessControl');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', backend: 'up', database: 'connected' });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      backend: 'up',
      database: 'disconnected',
      message: error.message,
    });
  }
});

app.use('/api', ensureBackendUp, ensureDatabaseUp(pool));

app.get('/api', (_req, res) => {
  res.json({ message: 'Welcome to OMNICRM API' });
});

app.use('/api/system-config', systemConfigRouter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/access', accessControlRouter);
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/sms-logs', require('./routes/smsLogs'));
app.use('/api/email-logs', require('./routes/emailLogs'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/template-variables', require('./routes/templateVariables'));
app.use('/api/templates', require('./routes/templates'));

async function start() {
  try {
    await initDatabase();
  } catch (error) {
    console.error('Failed to initialize database:', error.message);
  }

  app.listen(PORT, () => {
    markBackendReady();
    console.log(`Backend running on port ${PORT}`);
  });
}

start();
