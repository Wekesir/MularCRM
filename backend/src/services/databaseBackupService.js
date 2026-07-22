const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { google } = require('googleapis');
const { getSystemConfig, updateSystemConfig } = require('./systemConfigService');
const {
  hasOwnerOAuth,
  getOwnerDriveClient,
  acceptOwnershipAsOwner,
} = require('./backupGoogleOAuthService');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const OWNERSHIP_ACCEPT_HINT =
  'Connect the backup owner Google account (or search Drive for pendingowner:me and accept), then click Complete upload / Run now again.';

let lastStatus = {
  ok: null,
  running: false,
  phase: 'idle',
  awaitingOwnership: false,
  startedAt: null,
  finishedAt: null,
  fileName: null,
  driveFileId: null,
  ownerEmail: null,
  message: 'No backup has run yet',
};

function setStatus(patch) {
  lastStatus = { ...lastStatus, ...patch };
}

function readPendingUpload(backup) {
  const pending = backup?.pendingUpload;
  if (!pending?.driveFileId) return null;
  return {
    driveFileId: String(pending.driveFileId),
    fileName: pending.fileName || null,
    ownerEmail: pending.ownerEmail || null,
    createdAt: pending.createdAt || null,
  };
}

async function persistPendingUpload(pending) {
  await updateSystemConfig({
    backup: {
      pendingUpload: pending
        ? {
            driveFileId: pending.driveFileId,
            fileName: pending.fileName || null,
            ownerEmail: pending.ownerEmail || null,
            createdAt: pending.createdAt || new Date().toISOString(),
          }
        : null,
    },
  });
}

async function hydratePendingFromConfig() {
  try {
    const config = await getSystemConfig({ mask: false });
    const pending = readPendingUpload(config.backup);
    if (!pending) return null;

    if (!lastStatus.running) {
      setStatus({
        ok: false,
        phase: 'awaiting_ownership',
        awaitingOwnership: true,
        driveFileId: pending.driveFileId,
        fileName: pending.fileName,
        ownerEmail: pending.ownerEmail,
        message:
          lastStatus.awaitingOwnership && lastStatus.message
            ? lastStatus.message
            : `Empty backup file is waiting for ownership acceptance (${pending.fileName || pending.driveFileId}). ${OWNERSHIP_ACCEPT_HINT}`,
      });
    }
    return pending;
  } catch (error) {
    console.warn('[backup] failed to hydrate pending upload:', error.message);
    return null;
  }
}

async function getLastBackupStatus() {
  await hydratePendingFromConfig();
  return { ...lastStatus };
}

function httpError(message, status = 400, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
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

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
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

function escapeCnfValue(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function resolveDumpBinary() {
  for (const candidate of ['mariadb-dump', 'mysqldump']) {
    const result = spawnSync('sh', ['-c', `command -v ${candidate}`], {
      encoding: 'utf8',
    });
    if (result.status === 0 && result.stdout.trim()) {
      return candidate;
    }
  }
  return 'mysqldump';
}

function formatDumpError(stderr, code) {
  const text = (stderr || '').trim() || `Database dump exited with code ${code}`;
  if (/caching_sha2_password/i.test(text)) {
    return (
      'Database dump failed: the backup client cannot authenticate to MySQL 8 ' +
      '(missing caching_sha2_password plugin). Rebuild the backend image so it includes ' +
      'mariadb-connector-c, then retry.'
    );
  }
  return (
    text
      .replace(/^mysqldump:\s*Deprecated program name\.[^\n]*\n?/i, '')
      .replace(/^WARNING:\s*option --ssl-verify-server-cert[^\n]*\n?/i, '')
      .trim() || text
  );
}

function isSaQuotaError(error) {
  const apiMessage =
    error?.errors?.[0]?.message ||
    error?.response?.data?.error?.message ||
    error?.message ||
    '';
  const reason = error?.errors?.[0]?.reason || error?.response?.data?.error?.errors?.[0]?.reason;
  return (
    reason === 'storageQuotaExceeded' ||
    /storage quota/i.test(apiMessage) ||
    /service accounts do not have storage quota/i.test(apiMessage)
  );
}

function mapDriveError(error) {
  const apiMessage =
    error?.errors?.[0]?.message ||
    error?.response?.data?.error?.message ||
    error?.message ||
    'Google Drive request failed';

  if (isSaQuotaError(error)) {
    return httpError(
      'Google Drive storage quota exceeded for the service account. ' +
        'Empty files must be owned by your Gmail before content can be uploaded. ' +
        OWNERSHIP_ACCEPT_HINT,
      403
    );
  }
  if (/insufficientPermissions|insufficient authentication|accessNotConfigured/i.test(apiMessage)) {
    return httpError(
      'Google Drive permission error. Ensure the Drive API is enabled and the service account JSON key is valid.',
      403
    );
  }
  return httpError(apiMessage, error?.code === 404 ? 404 : 500);
}

async function runMysqldump(filePath) {
  const db = getDbEnv();
  const dumpBin = resolveDumpBinary();
  const cnfPath = path.join(
    os.tmpdir(),
    `omnicrm-mysqldump-${process.pid}-${Date.now()}.cnf`
  );

  const cnf = [
    '[client]',
    `host="${escapeCnfValue(db.host)}"`,
    `port=${Number(db.port) || 3306}`,
    `user="${escapeCnfValue(db.user)}"`,
    `password="${escapeCnfValue(db.password)}"`,
    '',
  ].join('\n');

  await fsp.writeFile(cnfPath, cnf, { mode: 0o600 });

  try {
    await new Promise((resolve, reject) => {
      const args = [
        `--defaults-extra-file=${cnfPath}`,
        process.env.DB_DUMP_SSL_VERIFY === '1'
          ? '--ssl-verify-server-cert'
          : '--ssl-verify-server-cert=false',
        '--no-tablespaces',
        '--single-transaction',
        '--routines',
        '--triggers',
        '--databases',
        db.database,
      ];

      const child = spawn(dumpBin, args, {
        env: process.env,
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
              'Database dump client is not installed. Install mysql-client (and mariadb-connector-c on Alpine) in the backend image.',
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
          reject(httpError(formatDumpError(stderr, code), 500));
          return;
        }
        resolve();
      });
    });
  } finally {
    await fsp.unlink(cnfPath).catch(() => {});
  }
}

function createDriveClient(serviceAccountKey) {
  const credentials = parseServiceAccountKey(serviceAccountKey);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [DRIVE_SCOPE],
  });
  return {
    drive: google.drive({ version: 'v3', auth }),
    serviceAccountEmail: credentials.client_email,
  };
}

async function createEmptyDriveFile(drive, { fileName, folderId }) {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/sql',
        parents: folderId ? [folderId] : undefined,
      },
      fields: 'id,name',
      supportsAllDrives: true,
    });
    return {
      driveFileId: response.data.id,
      driveFileName: response.data.name,
    };
  } catch (error) {
    throw mapDriveError(error);
  }
}

async function requestOwnershipTransfer(drive, fileId, ownerEmail, { notify = true } = {}) {
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        type: 'user',
        role: 'writer',
        emailAddress: ownerEmail,
        pendingOwner: true,
      },
      sendNotificationEmail: Boolean(notify),
      supportsAllDrives: true,
      fields: 'id',
    });
  } catch (error) {
    throw mapDriveError(error);
  }
}

async function getDriveFileMeta(drive, fileId) {
  try {
    const response = await drive.files.get({
      fileId,
      fields: 'id,name,owners,size,capabilities',
      supportsAllDrives: true,
    });
    return response.data;
  } catch (error) {
    throw mapDriveError(error);
  }
}

async function isOwnedByTarget(drive, fileId, ownerEmail) {
  const meta = await getDriveFileMeta(drive, fileId);
  const owners = Array.isArray(meta.owners) ? meta.owners : [];
  const target = normalizeEmail(ownerEmail);
  return owners.some((owner) => normalizeEmail(owner.emailAddress) === target);
}

async function uploadContentToFile(drive, { fileId, filePath }) {
  const stat = await fsp.stat(filePath);
  if (!stat.size) {
    throw httpError('Database dump file is empty; refusing to upload', 500);
  }

  try {
    const response = await drive.files.update({
      fileId,
      requestBody: {
        mimeType: 'application/sql',
      },
      media: {
        mimeType: 'application/sql',
        body: fs.createReadStream(filePath),
      },
      fields: 'id,name,size',
      supportsAllDrives: true,
    });

    const size = Number(response.data.size || 0);
    if (!size) {
      throw httpError(
        'Google Drive accepted the update but the file is still 0 bytes. Accept ownership of the empty file, then retry Complete upload.',
        500
      );
    }

    return {
      driveFileId: response.data.id,
      driveFileName: response.data.name,
      size,
    };
  } catch (error) {
    if (error.status) throw error;
    throw mapDriveError(error);
  }
}

function assertBackupConfig(backup) {
  if (!backup?.googleDrive?.folderId?.trim()) {
    throw httpError('Google Drive folder ID is required', 400);
  }
  if (!backup?.googleDrive?.serviceAccountKey?.trim()) {
    throw httpError('Google Drive service account JSON key is required', 400);
  }
  const ownerEmail = backup?.googleDrive?.ownerEmail?.trim();
  if (!ownerEmail) {
    throw httpError(
      'Backup owner Gmail is required. Service accounts have 0 bytes of Drive quota; your personal Gmail must own each backup file.',
      400
    );
  }
  if (!isValidEmail(ownerEmail)) {
    throw httpError('Backup owner Gmail must be a valid email address', 400);
  }
}

async function autoAcceptAndUpload({
  saDrive,
  googleDrive,
  fileId,
  fileName,
  filePath,
  targetOwner,
  serviceAccountEmail,
}) {
  const ownerDrive = await getOwnerDriveClient(googleDrive);
  await acceptOwnershipAsOwner(ownerDrive, fileId, targetOwner);

  // Upload as the owner so quota is charged to Gmail (not the 0-byte SA).
  const uploaded = await uploadContentToFile(ownerDrive, { fileId, filePath });
  return {
    phase: 'done',
    awaitingOwnership: false,
    driveFileId: uploaded.driveFileId,
    driveFileName: uploaded.driveFileName || fileName,
    serviceAccountEmail,
    ownerEmail: targetOwner,
    finalized: true,
    autoAccepted: true,
    size: uploaded.size,
  };
}

/**
 * Personal Gmail workaround for SA 0-byte quota:
 * 1) Create empty metadata file (SA)
 * 2) Request ownership transfer (pendingOwner)
 * 3) Auto-accept via connected owner OAuth when available, else wait for manual accept
 * 4) Upload content as the owner (preferred) or SA after ownership flips
 */
async function uploadToGoogleDrive({
  filePath,
  fileName,
  folderId,
  serviceAccountKey,
  ownerEmail,
  googleDrive = {},
  pendingDriveFileId = null,
}) {
  const { drive, serviceAccountEmail } = createDriveClient(serviceAccountKey);
  const targetOwner = ownerEmail.trim();
  const canAutoAccept = hasOwnerOAuth(googleDrive);

  if (pendingDriveFileId) {
    if (canAutoAccept) {
      try {
        return await autoAcceptAndUpload({
          saDrive: drive,
          googleDrive,
          fileId: pendingDriveFileId,
          fileName,
          filePath,
          targetOwner,
          serviceAccountEmail,
        });
      } catch (error) {
        // Fall through to SA upload / manual awaiting path.
        console.warn('[backup] auto-accept/upload failed, falling back:', error.message);
      }
    }

    try {
      const uploaded = await uploadContentToFile(drive, {
        fileId: pendingDriveFileId,
        filePath,
      });

      return {
        phase: 'done',
        awaitingOwnership: false,
        driveFileId: uploaded.driveFileId,
        driveFileName: uploaded.driveFileName || fileName,
        serviceAccountEmail,
        ownerEmail: targetOwner,
        finalized: true,
        size: uploaded.size,
      };
    } catch (error) {
      if (!isSaQuotaError(error) && error.status !== 403) {
        throw error.status ? error : mapDriveError(error);
      }

      try {
        await requestOwnershipTransfer(drive, pendingDriveFileId, targetOwner, {
          notify: !canAutoAccept,
        });
      } catch {
        // Ignore duplicate-permission errors.
      }

      if (canAutoAccept) {
        return autoAcceptAndUpload({
          saDrive: drive,
          googleDrive,
          fileId: pendingDriveFileId,
          fileName,
          filePath,
          targetOwner,
          serviceAccountEmail,
        });
      }

      throw httpError(
        `Ownership of backup file is still pending for ${targetOwner}. ${OWNERSHIP_ACCEPT_HINT}`,
        409,
        {
          awaitingOwnership: true,
          driveFileId: pendingDriveFileId,
          fileName,
          ownerEmail: targetOwner,
          phase: 'awaiting_ownership',
        }
      );
    }
  }

  const created = await createEmptyDriveFile(drive, { fileName, folderId });
  try {
    await requestOwnershipTransfer(drive, created.driveFileId, targetOwner, {
      notify: !canAutoAccept,
    });
  } catch (error) {
    throw httpError(
      `${error.message}. Empty file ${created.driveFileName || fileName} was created; retry after fixing sharing/permissions.`,
      error.status || 500,
      {
        awaitingOwnership: true,
        driveFileId: created.driveFileId,
        fileName: created.driveFileName || fileName,
        ownerEmail: targetOwner,
        phase: 'awaiting_ownership',
      }
    );
  }

  if (canAutoAccept) {
    return autoAcceptAndUpload({
      saDrive: drive,
      googleDrive,
      fileId: created.driveFileId,
      fileName: created.driveFileName || fileName,
      filePath,
      targetOwner,
      serviceAccountEmail,
    });
  }

  return {
    phase: 'awaiting_ownership',
    awaitingOwnership: true,
    driveFileId: created.driveFileId,
    driveFileName: created.driveFileName,
    serviceAccountEmail,
    ownerEmail: targetOwner,
    finalized: false,
  };
}

async function runDatabaseBackup({ triggeredBy = 'cron' } = {}) {
  if (lastStatus.running) {
    throw httpError('A backup is already running', 409);
  }

  const config = await getSystemConfig({ mask: false });
  const backup = config.backup || {};
  const persistedPending = readPendingUpload(backup);
  const pendingDriveFileId =
    persistedPending?.driveFileId ||
    (lastStatus.awaitingOwnership && lastStatus.driveFileId ? lastStatus.driveFileId : null);
  const pendingFileName =
    persistedPending?.fileName || (pendingDriveFileId ? lastStatus.fileName : null);

  const startedAt = new Date().toISOString();
  setStatus({
    running: true,
    ok: null,
    phase: pendingDriveFileId ? 'uploading' : 'dumping',
    startedAt,
    finishedAt: null,
    message: pendingDriveFileId
      ? `Finalizing pending backup (${triggeredBy})…`
      : `Backup started (${triggeredBy})…`,
    ...(pendingDriveFileId
      ? {
          driveFileId: pendingDriveFileId,
          fileName: pendingFileName,
          awaitingOwnership: true,
        }
      : {
          driveFileId: null,
          fileName: null,
          awaitingOwnership: false,
        }),
  });

  const ownerEmail = backup.googleDrive?.ownerEmail?.trim() || null;

  let tempDir;
  let filePath;

  try {
    assertBackupConfig(backup);

    const fileName = pendingFileName || `omnicrm-${formatTimestamp()}.sql`;
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'omnicrm-backup-'));
    filePath = path.join(tempDir, `${path.basename(fileName, '.sql')}-dump.sql`);

    setStatus({ phase: 'dumping', message: `Creating database dump (${triggeredBy})…` });
    await runMysqldump(filePath);

    const autoAccept = hasOwnerOAuth(backup.googleDrive || {});
    setStatus({
      phase: pendingDriveFileId || autoAccept ? 'uploading' : 'awaiting_ownership',
      message: autoAccept
        ? 'Creating Drive file, auto-accepting ownership, and uploading…'
        : pendingDriveFileId
          ? 'Uploading backup content to Google Drive…'
          : 'Creating empty Drive file and requesting ownership transfer…',
      fileName,
      ownerEmail,
    });

    const upload = await uploadToGoogleDrive({
      filePath,
      fileName,
      folderId: backup.googleDrive.folderId.trim(),
      serviceAccountKey: backup.googleDrive.serviceAccountKey,
      ownerEmail,
      googleDrive: backup.googleDrive || {},
      pendingDriveFileId,
    });

    const finishedAt = new Date().toISOString();

    if (upload.awaitingOwnership) {
      const result = {
        ok: false,
        running: false,
        phase: 'awaiting_ownership',
        awaitingOwnership: true,
        startedAt,
        finishedAt,
        fileName: upload.driveFileName || fileName,
        driveFileId: upload.driveFileId,
        ownerEmail: upload.ownerEmail,
        serviceAccountEmail: upload.serviceAccountEmail || null,
        message:
          `Empty backup file created (${upload.driveFileName || fileName}). ` +
          `Accept ownership for ${upload.ownerEmail}, then click Complete upload. ` +
          OWNERSHIP_ACCEPT_HINT,
        triggeredBy,
        statusCode: 202,
      };
      await persistPendingUpload({
        driveFileId: result.driveFileId,
        fileName: result.fileName,
        ownerEmail: result.ownerEmail,
        createdAt: startedAt,
      });
      setStatus(result);
      console.info(
        `[backup] awaiting ownership for ${result.fileName} (id=${result.driveFileId}) owner=${result.ownerEmail}`
      );
      return result;
    }

    await persistPendingUpload(null);

    const result = {
      ok: true,
      running: false,
      phase: 'done',
      awaitingOwnership: false,
      startedAt,
      finishedAt,
      fileName: upload.driveFileName || fileName,
      driveFileId: upload.driveFileId,
      ownerEmail: upload.ownerEmail,
      serviceAccountEmail: upload.serviceAccountEmail || null,
      message: `Backup uploaded to Google Drive as ${upload.driveFileName || fileName}${
        upload.size ? ` (${upload.size} bytes)` : ''
      }`,
      triggeredBy,
    };
    setStatus(result);
    console.info(`[backup] ${result.message} (id=${upload.driveFileId})`);
    return result;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const keepPending =
      Boolean(error.awaitingOwnership && error.driveFileId) || Boolean(pendingDriveFileId);

    const result = {
      ok: false,
      running: false,
      phase: keepPending ? 'awaiting_ownership' : 'failed',
      awaitingOwnership: keepPending,
      startedAt,
      finishedAt,
      fileName: keepPending ? error.fileName || pendingFileName || lastStatus.fileName : null,
      driveFileId: keepPending
        ? error.driveFileId || pendingDriveFileId || lastStatus.driveFileId
        : null,
      ownerEmail: ownerEmail || lastStatus.ownerEmail,
      message: error.message || 'Backup failed',
      triggeredBy,
    };

    if (keepPending && result.driveFileId) {
      await persistPendingUpload({
        driveFileId: result.driveFileId,
        fileName: result.fileName,
        ownerEmail: result.ownerEmail,
        createdAt: startedAt,
      }).catch((persistError) => {
        console.warn('[backup] failed to persist pending upload:', persistError.message);
      });
    }

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
