const pool = require('../db/pool');
const {
  createDebtorFile,
  resolveBatchFileName,
} = require('./debtorService');
const {
  COLUMNS,
  REQUIRED_COLUMNS,
  MAX_DATA_ROWS,
  importDebtorRows,
} = require('./debtorImportShared');
const { getClientById, assignClientCallCenter } = require('./clientService');
const { isSeniorSupervisorRole, isRegionalManagerRole } = require('../config/orgRoles');
const { recordActivityEvent } = require('./activityService');

const TEMPLATE_FILENAME = 'debtor-upload-template.csv';
const EXPECTED_HEADERS = COLUMNS.map((c) => c.header.toLowerCase());

class BulkUploadError extends Error {
  constructor(message, { code = 'BULK_UPLOAD' } = {}) {
    super(message);
    this.code = code;
  }
}

/**
 * Resolve call center for a bulk upload:
 * - Prefer client's existing call_center_id (automatic).
 * - Else require explicit callCenterId (Senior/Admin).
 * - Reject mismatch unless forceOverride (Senior/Admin).
 * Optionally assigns the client to the center when unbound.
 */
async function resolveUploadCallCenter({
  clientId,
  callCenterId,
  performedBy = null,
  forceOverride = false,
} = {}) {
  const client = clientId ? await getClientById(clientId) : null;
  if (!client) {
    throw new BulkUploadError('Select a valid client before uploading.', {
      code: 'INVALID_STRUCTURE',
    });
  }

  const clientCenterId = client.callCenterId != null ? Number(client.callCenterId) : null;
  const requestedCenterId =
    callCenterId != null && callCenterId !== '' ? Number(callCenterId) : null;

  let resolvedCenterId = clientCenterId;
  if (!resolvedCenterId) {
    if (!Number.isFinite(requestedCenterId)) {
      throw new BulkUploadError(
        'This client is not assigned to a call center. Select a call center to bind this upload.',
        { code: 'INVALID_STRUCTURE' }
      );
    }
    resolvedCenterId = requestedCenterId;
  } else if (
    Number.isFinite(requestedCenterId) &&
    requestedCenterId !== clientCenterId
  ) {
    // Client already bound — keep that center unless Senior/Admin forces override.
    const canForce =
      Boolean(forceOverride) &&
      (Boolean(performedBy?.isSystemAdmin) ||
        isSeniorSupervisorRole(performedBy) ||
        isRegionalManagerRole(performedBy));
    if (canForce) {
      resolvedCenterId = requestedCenterId;
    }
  }

  const [centers] = await pool.query(
    `SELECT id, name, status FROM call_centers
     WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [resolvedCenterId]
  );
  if (!centers[0]) {
    throw new BulkUploadError('Selected call center was not found.', {
      code: 'INVALID_STRUCTURE',
    });
  }
  if (centers[0].status !== 'active') {
    throw new BulkUploadError('Selected call center is inactive.', {
      code: 'INVALID_STRUCTURE',
    });
  }

  // Keep client ↔ center aligned when the client was unbound.
  if (!clientCenterId) {
    await assignClientCallCenter(clientId, resolvedCenterId, {
      performedBy,
      force: false,
    });
  } else if (
    Number.isFinite(requestedCenterId) &&
    requestedCenterId !== clientCenterId &&
    forceOverride
  ) {
    await assignClientCallCenter(clientId, resolvedCenterId, {
      performedBy,
      force: true,
    });
  }

  return {
    callCenterId: resolvedCenterId,
    callCenterName: centers[0].name,
    clientName: client.name,
    autoBound: Boolean(clientCenterId),
  };
}

function parseCsv(text) {
  const raw = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // swallow
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function isBlankRow(cells) {
  return cells.every((c) => c === '' || c == null);
}

function headerMatches(headerCells) {
  if (!headerCells || headerCells.length !== COLUMNS.length) return false;
  return headerCells.every((h, i) => String(h).trim().toLowerCase() === EXPECTED_HEADERS[i]);
}

function generateTemplateBuffer() {
  const escape = (val) => {
    const s = String(val);
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerLine = COLUMNS.map((c) => escape(c.header)).join(',');
  const exampleRow = [
    'Jane Mwangi',
    '254710595755',
    '150000',
    '150000',
    'ACC-20451',
    'jane@example.com',
    '30123456',
    'LN-2025-0001',
    '0',
    '45',
    'CTR-9001',
    '45000',
    '254722000111',
    '12500',
    '105000',
    '1500',
    '2025-01-15',
    '2025-06-15',
    '5000',
    '2025-05-30',
    '1',
    '12 MG Rd, Nairobi',
    'Acme Ltd, Westlands',
    'Brian Mwangi',
    'Brother',
    '254733222333',
    'brian@example.com',
    'Peter Otieno',
    '254711444555',
    'peter@example.com',
    '14 Riverside, Nairobi',
  ];
  const exampleLine = exampleRow.map(escape).join(',');
  const csv = `\ufeff${headerLine}\r\n${exampleLine}\r\n`;
  return Buffer.from(csv, 'utf-8');
}

function templateHeaders() {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${TEMPLATE_FILENAME}"`,
  };
}

async function parseAndImportDebtors(buffer, userId, options = {}) {
  const batchDefaults = {
    clientId: options.clientId != null ? Number(options.clientId) || null : null,
    debtCategoryId: options.debtCategoryId != null ? Number(options.debtCategoryId) || null : null,
    debtTypeId: options.debtTypeId != null ? Number(options.debtTypeId) || null : null,
    currencyId: options.currencyId != null ? Number(options.currencyId) || null : null,
  };

  const performedBy = options.performedBy || (userId ? { id: userId } : null);

  let text;
  try {
    text = buffer.toString('utf-8');
  } catch {
    throw new BulkUploadError(
      'The file could not be read as a valid CSV document. Please download the template and try again.',
      { code: 'INVALID_FILE' }
    );
  }

  if (!text.trim()) {
    throw new BulkUploadError(
      'The uploaded file is empty. Please download the template, fill it in, and upload again.',
      { code: 'INVALID_STRUCTURE' }
    );
  }

  const allRows = parseCsv(text);
  if (allRows.length === 0) {
    throw new BulkUploadError(
      'The CSV file does not contain any rows. Please use the downloaded template.',
      { code: 'INVALID_STRUCTURE' }
    );
  }

  const headerCells = allRows[0];
  if (!headerMatches(headerCells)) {
    throw new BulkUploadError(
      'The file template has been altered. Please download the template again and fill it in without changing, reordering or renaming the headers.',
      { code: 'INVALID_STRUCTURE' }
    );
  }

  // Resolve after CSV validation so a bad file never mutates client↔center mapping.
  const centerInfo = await resolveUploadCallCenter({
    clientId: batchDefaults.clientId,
    callCenterId: options.callCenterId,
    performedBy,
    forceOverride: Boolean(options.forceCallCenter),
  });

  const fileName = await resolveBatchFileName({
    clientId: batchDefaults.clientId,
    debtCategoryId: batchDefaults.debtCategoryId,
  });
  const debtorFile = await createDebtorFile({
    clientId: batchDefaults.clientId,
    fileName,
    debtCategoryId: batchDefaults.debtCategoryId,
    debtTypeId: batchDefaults.debtTypeId,
    currencyId: batchDefaults.currencyId,
    uploadedBy: userId,
    source: 'csv',
    callCenterId: centerInfo.callCenterId,
    callCenterAssignedBy: userId,
  });
  const fileId = debtorFile.id;
  const cfid = String(fileId);

  const rowObjects = [];
  for (let r = 1; r < allRows.length; r += 1) {
    const cells = allRows[r];
    if (isBlankRow(cells)) continue;
    const cellsMap = {};
    COLUMNS.forEach((col, i) => {
      const v = cells[i] != null ? cells[i] : '';
      cellsMap[col.key] = String(v).trim();
    });
    rowObjects.push(cellsMap);
  }

  const result = await importDebtorRows(rowObjects, {
    ...batchDefaults,
    userId,
    fileId,
    cfid,
    maxRows: MAX_DATA_ROWS,
    replaceStats: true,
  });

  recordActivityEvent({
    userId: performedBy?.id ?? userId ?? null,
    userName: performedBy?.name ?? null,
    actionType: 'debtor_file.uploaded',
    title: 'Debtor Batch Uploaded',
    subject: fileName || `Batch #${fileId}`,
    entityType: 'debtor_file',
    entityId: String(fileId),
    metadata: {
      fileId,
      clientId: batchDefaults.clientId,
      clientName: centerInfo.clientName,
      callCenterId: centerInfo.callCenterId,
      callCenterName: centerInfo.callCenterName,
      autoBound: centerInfo.autoBound,
      importedCount: result.createdCount,
      updatedCount: result.updatedCount,
      failedCount: result.failedCount,
    },
  }).catch(() => {});

  return {
    ...result,
    callCenterId: centerInfo.callCenterId,
    callCenterName: centerInfo.callCenterName,
    fileName,
  };
}

module.exports = {
  generateTemplateBuffer,
  templateHeaders,
  parseAndImportDebtors,
  resolveUploadCallCenter,
  BulkUploadError,
  MAX_DATA_ROWS,
  TEMPLATE_FILENAME,
  COLUMNS,
  REQUIRED_COLUMNS,
};
