const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { google } = require('googleapis');
const { getSystemConfig } = require('./systemConfigService');

let lastStatus = {
  ok: null,
  running: false,
  startedAt: null,
  finishedAt: null,
  fileName: null,
  driveFileId: null,
  message: 'No backup has run yet',
};

function getLastBackupStatus() {
  return { ...lastStatus };
}

function setStatus(patch) {
  lastStatus = { ...lastStatus, ...patch };
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function parseServiceAccountKey(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    throw httpError('Google Drive service account JSON key is required', 400);
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('missing client_email or private_key');
    }
    return parsed;
  } catch {
    throw httpError('Service account key must be valid Google JSON credentials', 400);
  }
}

function getDbEnv() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: String(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || process.env.MYSQL_USER || 'omnicrm',
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'omnicrm',
  };
}

function runMysqldump(filePath) {
  const db = getDbEnv();
  return new Promise((resolve, reject) => {
    const args = [
      `-h${db.host}`,
      `-P${db.port}`,
      `-u${db.user}`,
      `--single-transaction`,
      `--routines`,
      `--triggers`,
      `--databases`,
      db.database,
    ];

    const child = spawn('mysqldump', args, {
      env: { ...process.env, MYSQL_PWD: db.password },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const out = fs.createWriteStream(filePath);
    let stderr = '';

    child.stdout.pipe(out);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      out.close();
      if (error.code === 'ENOENT') {
        reject(
          httpError(
            'mysqldump is not installed. Install mysql-client in the backend image.',
            500
          )
        );
        return;
      }
      reject(error);
    });

    child.on('close', (code) => {
      out.close();
      if (code !== 0) {
        reject(
          httpError(
            stderr.trim() || `mysqldump exited with code ${code}`,
            500
          )
        );
        return;
      }
      resolve();
    });
  });
}

async function uploadToGoogleDrive({ filePath, fileName, folderId, serviceAccountKey }) {
  const credentials = parseServiceAccountKey(serviceAccountKey);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: folderId ? [folderId] : undefined,
    },
    media: {
      mimeType: 'application/sql',
      body: fs.createReadStream(filePath),
    },
    fields: 'id,name',
    supportsAllDrives: true,
  });

  return {
    driveFileId: response.data.id,
    driveFileName: response.data.name,
    serviceAccountEmail: credentials.client_email,
  };
}

function assertBackupConfig(backup) {
  if (!backup?.googleDrive?.folderId?.trim()) {
    throw httpError('Google Drive folder ID is required', 400);
  }
  if (!backup?.googleDrive?.serviceAccountKey?.trim()) {
    throw httpError('Google Drive service account JSON key is required', 400);
  }
}

async function runDatabaseBackup({ triggeredBy = 'cron' } = {}) {
  if (lastStatus.running) {
    throw httpError('A backup is already running', 409);
  }

  const startedAt = new Date().toISOString();
  setStatus({
    running: true,
    ok: null,
    startedAt,
    finishedAt: null,
    fileName: null,
    driveFileId: null,
    message: `Backup started (${triggeredBy})…`,
  });

  const config = await getSystemConfig({ mask: false });
  const backup = config.backup || {};

  let tempDir;
  let filePath;

  try {
    assertBackupConfig(backup);

    const fileName = `omnicrm-${formatTimestamp()}.sql`;
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'omnicrm-backup-'));
    filePath = path.join(tempDir, fileName);

    await runMysqldump(filePath);

    const upload = await uploadToGoogleDrive({
      filePath,
      fileName,
      folderId: backup.googleDrive.folderId.trim(),
      serviceAccountKey: backup.googleDrive.serviceAccountKey,
    });

    const finishedAt = new Date().toISOString();
    const result = {
      ok: true,
      running: false,
      startedAt,
      finishedAt,
      fileName,
      driveFileId: upload.driveFileId,
      serviceAccountEmail: upload.serviceAccountEmail || null,
      message: `Backup uploaded to Google Drive as ${fileName}`,
      triggeredBy,
    };
    setStatus(result);
    console.info(`[backup] ${result.message} (id=${upload.driveFileId})`);
    return result;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const result = {
      ok: false,
      running: false,
      startedAt,
      finishedAt,
      fileName: null,
      driveFileId: null,
      message: error.message || 'Backup failed',
      triggeredBy,
    };
    setStatus(result);
    console.error(`[backup] failed: ${result.message}`);
    throw error;
  } finally {
    if (filePath) {
      await fsp.unlink(filePath).catch(() => {});
    }
    if (tempDir) {
      await fsp.rmdir(tempDir).catch(() => {});
    }
  }
}

module.exports = {
  runDatabaseBackup,
  getLastBackupStatus,
  parseServiceAccountKey,
};
