const cron = require('node-cron');
const { getSystemConfig } = require('./systemConfigService');
const {
  runDatabaseBackup,
  getLastBackupStatus,
} = require('./databaseBackupService');

const FREQUENCY_CRON = {
  daily: '0 2 * * *',
  weekly: '0 2 * * 0',
  monthly: '0 2 1 * *',
};

const TIMEZONE = process.env.AUTH_SESSION_TIMEZONE || 'Africa/Nairobi';

let scheduledTask = null;
let currentFrequency = null;

function normalizeFrequency(value) {
  const freq = String(value || 'daily').toLowerCase();
  return FREQUENCY_CRON[freq] ? freq : 'daily';
}

async function executeScheduledBackup() {
  try {
    const config = await getSystemConfig({ mask: false });
    const backup = config.backup || {};

    if (!backup.enabled) {
      console.info('[backup-cron] skipped — backups disabled');
      return;
    }

    if (
      !backup.googleDrive?.folderId ||
      !backup.googleDrive?.serviceAccountKey ||
      !backup.googleDrive?.ownerEmail
    ) {
      console.warn('[backup-cron] skipped — Google Drive is not fully configured');
      return;
    }

    const lastRun = await getLastBackupStatus();
    // Avoid stacking empty stubs while a previous ownership invite is unanswered.
    // runDatabaseBackup will finalize if ownership was accepted, or re-signal pending.
    if (lastRun.awaitingOwnership && lastRun.driveFileId) {
      console.info(
        `[backup-cron] resuming pending backup file ${lastRun.driveFileId} (awaiting ownership or finalize)`
      );
    }

    const result = await runDatabaseBackup({ triggeredBy: 'cron' });
    if (result?.awaitingOwnership) {
      console.warn(
        `[backup-cron] backup file created but ownership still pending for ${result.ownerEmail}. ` +
          'Accept ownership in Drive before the next successful upload. No additional stub will be created until then.'
      );
    }
  } catch (error) {
    if (error.awaitingOwnership) {
      console.warn(`[backup-cron] still awaiting ownership: ${error.message}`);
      return;
    }
    console.error('[backup-cron] run failed:', error.message);
  }
}

function stopBackupCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    currentFrequency = null;
  }
}

async function rescheduleBackupCron() {
  stopBackupCron();

  const config = await getSystemConfig({ mask: false });
  const backup = config.backup || {};
  const frequency = normalizeFrequency(backup.frequency);
  const expression = FREQUENCY_CRON[frequency];

  if (!backup.enabled) {
    console.info('[backup-cron] not scheduled — backups disabled');
    return { enabled: false, frequency, expression: null, timezone: TIMEZONE };
  }

  if (!cron.validate(expression)) {
    console.error('[backup-cron] invalid expression:', expression);
    return { enabled: false, frequency, expression: null, timezone: TIMEZONE };
  }

  scheduledTask = cron.schedule(
    expression,
    () => {
      executeScheduledBackup();
    },
    { timezone: TIMEZONE }
  );

  currentFrequency = frequency;
  console.info(
    `[backup-cron] scheduled ${frequency} (${expression}) timezone=${TIMEZONE}`
  );

  return { enabled: true, frequency, expression, timezone: TIMEZONE };
}

async function startBackupCron() {
  try {
    return await rescheduleBackupCron();
  } catch (error) {
    console.error('[backup-cron] failed to start:', error.message);
    return { enabled: false, error: error.message };
  }
}

function getBackupCronInfo() {
  return {
    scheduled: Boolean(scheduledTask),
    frequency: currentFrequency,
    timezone: TIMEZONE,
  };
}

module.exports = {
  startBackupCron,
  rescheduleBackupCron,
  stopBackupCron,
  getBackupCronInfo,
  FREQUENCY_CRON,
  normalizeFrequency,
};
