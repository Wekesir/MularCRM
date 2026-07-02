const ExcelJS = require('exceljs');

const {
  BUSINESS_TYPES,
  LABEL_BY_VALUE,
  resolveBusinessTypeValue,
} = require('../config/businessTypes');
const {
  createClient,
} = require('./clientService');
const { sendOnboardingNotifications } = require('./onboardingNotifications');

// Canonical column order used by both the generated template and the parser.
const COLUMNS = [
  { key: 'name', header: 'Client Name', index: 1 },
  { key: 'businessType', header: 'Business Type', index: 2 },
  { key: 'phone', header: 'Phone Number', index: 3 },
  { key: 'email', header: 'Email Address', index: 4 },
];

const EXPECTED_HEADERS = COLUMNS.map((c) => c.header.toLowerCase());

const MAX_DATA_ROWS = 500;
const TEMPLATE_FILENAME = 'client-upload-template.xlsx';

const THEME_COLOR = '3b82f6'; // matches default --theme-color accent

// ── Template generation ────────────────────────────────────────────────────

async function generateTemplateBuffer() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OMNICRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Clients', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((c) => ({
    key: c.key,
    header: c.header,
    width: c.key === 'name' ? 32 : c.key === 'email' ? 34 : 24,
  }));

  // Style the header row.
  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${THEME_COLOR}` },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Example row (greyed out) so the user can see the expected format.
  const example = sheet.getRow(2);
  example.values = [
    'Acme Bank Ltd.',
    'Bank',
    '254710595755',
    'client@example.com',
  ];
  example.eachCell((cell) => {
    cell.font = { italic: true, color: { argb: 'FF94A3B8' }, size: 11 };
    cell.alignment = { vertical: 'middle', indent: 1 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    };
  });
  example.height = 20;

  // Constrain the Business Type column to the exact accepted labels via an
  // Excel data-validation dropdown. Apply it to a generous range so users can
  // paste many rows (row 2 is the example; validation starts at row 3).
  const businessCol = sheet.getColumn('businessType');
  const businessTypeLabels = BUSINESS_TYPES.map((t) => t.label);
  // Excel formula1 must wrap the quoted list; total length stays well under the
  // 255-char limit.
  const formula = `"${businessTypeLabels.join(',')}"`;
  for (let r = 3; r <= MAX_DATA_ROWS + 2; r += 1) {
    const cell = sheet.getCell(`${businessCol.letter}${r}`);
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: 'Invalid business type',
      error: 'Please pick a value from the dropdown list.',
    };
  }

  // Light borders + autofilter for usability.
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };

  // Add a short instructions block below the example so the meaning of each
  // column is self-documenting.
  const notesStart = MAX_DATA_ROWS + 4;
  const notes = [
    ['How to use this template', ''],
    ['1.', 'Fill in one client per row starting at row 3 (row 2 is an example — overwrite or delete it).'],
    ['2.', '"Business Type" must match one of the dropdown values exactly.'],
    ['3.', '"Phone Number" should be in international format without spaces, e.g. 254710595755.'],
    ['4.', '"Email Address" must be unique — no duplicate emails within the file or against existing clients.'],
    ['5.', `Maximum ${MAX_DATA_ROWS} client rows per upload. Fully blank rows are ignored.`],
  ];
  notes.forEach((row, i) => {
    const r = sheet.getRow(notesStart + i);
    r.values = row;
    if (i === 0) {
      r.getCell(1).font = { bold: true, size: 12, color: { argb: `FF${THEME_COLOR}` } };
    } else {
      r.getCell(1).font = { bold: true, color: { argb: 'FF64748B' } };
      r.getCell(2).font = { color: { argb: 'FF475569' } };
    }
  });

  return workbook.xlsx.writeBuffer();
}

function templateHeaders() {
  return {
    'Content-Type':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${TEMPLATE_FILENAME}"`,
  };
}

// ── Parsing & import ────────────────────────────────────────────────────────

function isBlankRow(row) {
  if (!row) return true;
  return COLUMNS.every((c) => {
    const v = row.getCell(c.index)?.value;
    if (v === null || v === undefined) return true;
    return String(v).trim() === '';
  });
}

function readCellValue(cell) {
  if (cell === null || cell === undefined) return '';
  // exceljs returns { text, hyperlink } for hyperlinks and Date/objects for
  // some cells; coerce everything to a trimmed string.
  if (typeof cell === 'object') {
    if (cell.text !== undefined) return String(cell.text).trim();
    if (cell.result !== undefined) return String(cell.result).trim();
    if (cell.richText) return cell.richText.map((rt) => rt.text).join('').trim();
  }
  return String(cell).trim();
}

function headerMatches(headerRow) {
  if (!headerRow) return false;
  const actual = COLUMNS.map((c) => readCellValue(headerRow.getCell(c.index).value).toLowerCase());
  return actual.every((h, i) => h === EXPECTED_HEADERS[i]);
}

class BulkUploadError extends Error {
  constructor(message, { code = 'BULK_UPLOAD' } = {}) {
    super(message);
    this.code = code;
  }
}

async function parseAndImportClients(buffer, userId) {
  const workbook = new ExcelJS.Workbook();
  let sheet;
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw new BulkUploadError(
      'The file could not be read as a valid Excel (.xlsx) workbook. Please download the template and try again.',
      { code: 'INVALID_FILE' },
    );
  }

  sheet = workbook.getWorksheet('Clients') || workbook.worksheets[0];
  if (!sheet) {
    throw new BulkUploadError(
      'The workbook does not contain any sheets. Please use the downloaded template.',
      { code: 'INVALID_STRUCTURE' },
    );
  }

  // Row 1 is the header.
  const headerRow = sheet.getRow(1);
  if (!headerMatches(headerRow)) {
    const got = COLUMNS.map((c) => readCellValue(headerRow.getCell(c.index).value) || '(missing)').join(' | ');
    throw new BulkUploadError(
      `The sheet structure does not match the template. Expected headers "Client Name | Business Type | Phone Number | Email Address" but found "${got}". Please download and use the provided template.`,
      { code: 'INVALID_STRUCTURE' },
    );
  }

  const created = [];
  const failed = [];
  const seenEmails = new Set();
  const pendingCreates = [];
  let dataRowCount = 0;

  // Iterate rows starting at row 2 (row 2 may be the example; if it looks like a
  // real client the user left in, we still validate it like any other row).
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    if (isBlankRow(row)) return;

    dataRowCount += 1;
    if (dataRowCount > MAX_DATA_ROWS) {
      failed.push({
        row: rowNumber,
        name: '',
        message: `Upload limit exceeded — only the first ${MAX_DATA_ROWS} client rows are processed.`,
      });
      return;
    }

    const raw = {
      name: readCellValue(row.getCell(1).value),
      businessType: readCellValue(row.getCell(2).value),
      phone: readCellValue(row.getCell(3).value),
      email: readCellValue(row.getCell(4).value),
    };

    const displayName = raw.name || '(no name)';

    // Map the business type label/value to the stored value. createClient does
    // not validate the value against the known list, so we enforce it here.
    const resolvedType = resolveBusinessTypeValue(raw.businessType);
    if (!resolvedType) {
      failed.push({
        row: rowNumber,
        name: displayName,
        message: `Business type "${raw.businessType}" is not valid. Use one of the dropdown values from the template.`,
      });
      return;
    }

    const candidate = {
      name: raw.name,
      businessType: resolvedType,
      phone: raw.phone,
      email: raw.email,
    };

    const normalizedEmail = candidate.email.toLowerCase();
    if (seenEmails.has(normalizedEmail)) {
      failed.push({
        row: rowNumber,
        name: displayName,
        message: `Duplicate email "${raw.email}" within the uploaded file.`,
      });
      return;
    }
    seenEmails.add(normalizedEmail);

    // Defer the async DB work into a queue we await after the sync pass. We
    // collect an action per row and run them sequentially to preserve order and
    // to keep email-uniqueness checks accurate as rows are inserted.
    pendingCreates.push({ rowNumber, displayName, candidate, normalizedEmail });
  });

  // Sequentially create clients so in-file + DB email uniqueness stays correct.
  for (const job of pendingCreates) {
    try {
      const client = await createClient(job.candidate);
      // Fire onboarding notifications (fault-tolerant); never block creation.
      const notifications = await sendOnboardingNotifications(client, userId).catch((err) => ({
        email: { sent: false, message: err.message },
        sms: { sent: false, message: err.message },
      }));
      created.push({ ...client, notifications });
    } catch (err) {
      if (err.code === 'DUPLICATE') {
        failed.push({
          row: job.rowNumber,
          name: job.displayName,
          message: `A client with email "${job.candidate.email}" already exists.`,
        });
      } else if (err.code === 'VALIDATION') {
        failed.push({ row: job.rowNumber, name: job.displayName, message: err.message });
      } else {
        failed.push({
          row: job.rowNumber,
          name: job.displayName,
          message: err.message || 'Failed to create client.',
        });
      }
    }
  }

  return {
    createdCount: created.length,
    failedCount: failed.length,
    created,
    failed,
  };
}

module.exports = {
  generateTemplateBuffer,
  templateHeaders,
  parseAndImportClients,
  BulkUploadError,
  MAX_DATA_ROWS,
  TEMPLATE_FILENAME,
  LABEL_BY_VALUE,
};
