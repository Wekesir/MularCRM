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

const TEMPLATE_FILENAME = 'debtor-upload-template.csv';
const EXPECTED_HEADERS = COLUMNS.map((c) => c.header.toLowerCase());

class BulkUploadError extends Error {
  constructor(message, { code = 'BULK_UPLOAD' } = {}) {
    super(message);
    this.code = code;
  }
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

  return importDebtorRows(rowObjects, {
    ...batchDefaults,
    userId,
    fileId,
    cfid,
    maxRows: MAX_DATA_ROWS,
    replaceStats: true,
  });
}

module.exports = {
  generateTemplateBuffer,
  templateHeaders,
  parseAndImportDebtors,
  BulkUploadError,
  MAX_DATA_ROWS,
  TEMPLATE_FILENAME,
  COLUMNS,
  REQUIRED_COLUMNS,
};
