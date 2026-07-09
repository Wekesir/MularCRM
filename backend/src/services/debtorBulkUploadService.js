const {
  createDebtor,
  upsertDebtorByLoanId,
  createDebtorFile,
  updateDebtorFileStats,
  resolveBatchFileName,
} = require('./debtorService');
const { recordActivityEvent } = require('./activityService');
const paymentService = require('./paymentService');

// Canonical 31-column CSV layout — used by both the generated template and the
// strict header-format check. `bucket` is NOT here (it is auto-derived from
// dpd_level); `branch`/`branch_paybill` were dropped as not needed at debtor
// level. The Client, Debt Category, Debt Type and Currency are chosen in the
// bulk-upload form (one batch → one of each), so they are not CSV columns.
const COLUMNS = [
  { key: 'fullName', header: 'full_name' },
  { key: 'phoneNumber', header: 'phone_number' },
  { key: 'amount', header: 'amount' },
  { key: 'principalAmount', header: 'principal_amount' },
  { key: 'accountNumber', header: 'account_number' },
  { key: 'email', header: 'email' },
  { key: 'idNumber', header: 'id_number' },
  { key: 'loanId', header: 'loan_id' },
  { key: 'waivedAmount', header: 'waived_amount' },
  { key: 'dpdLevel', header: 'dpd_level' },
  { key: 'contractNumber', header: 'contract_number' },
  { key: 'amountRepaid', header: 'amount_repaid' },
  { key: 'secondaryPhoneNumber', header: 'secondary_phone_number' },
  { key: 'installmentAmount', header: 'installment_amount' },
  { key: 'arrears', header: 'arrears' },
  { key: 'penalty', header: 'penalty' },
  { key: 'loanTakenDate', header: 'loan_taken_date' },
  { key: 'loanDueDate', header: 'loan_due_date' },
  { key: 'lastPaidAmount', header: 'last_paid_amount' },
  { key: 'lastPaidDate', header: 'last_paid_date' },
  { key: 'loanCounter', header: 'loan_counter' },
  { key: 'physicalAddress', header: 'physical_address' },
  { key: 'employerAndAddress', header: 'employer_and_address' },
  { key: 'nextOfKinFullName', header: 'next_of_kin_full_name' },
  { key: 'nextOfKinRelationship', header: 'next_of_kin_relationship' },
  { key: 'nextOfKinPhoneNumber', header: 'next_of_kin_phone_number' },
  { key: 'nextOfKinEmail', header: 'next_of_kin_email' },
  { key: 'guarantorFullName', header: 'guarantor_full_name' },
  { key: 'guarantorPhones', header: 'guarantor_phones' },
  { key: 'guarantorEmail', header: 'guarantor_email' },
  { key: 'guarantorAddress', header: 'guarantor_address' },
];

// Columns that MUST be present and non-empty in every data row for it to import.
// All other columns are optional (may be left blank by the client).
const REQUIRED_COLUMNS = [
  'fullName',
  'phoneNumber',
  'idNumber',
  'loanId',
  'amount',
  'amountRepaid',
  'arrears',
  'dpdLevel',
  'loanTakenDate',
  'physicalAddress',
  'nextOfKinFullName',
  'nextOfKinPhoneNumber',
  'guarantorFullName',
  'guarantorPhones',
];

const HEADER_LABELS = {
  fullName: 'full_name',
  phoneNumber: 'phone_number',
  idNumber: 'id_number',
  loanId: 'loan_id',
  amount: 'amount',
  amountRepaid: 'amount_repaid',
  arrears: 'arrears',
  dpdLevel: 'dpd_level',
  loanTakenDate: 'loan_taken_date',
  physicalAddress: 'physical_address',
  nextOfKinFullName: 'next_of_kin_full_name',
  nextOfKinPhoneNumber: 'next_of_kin_phone_number',
  guarantorFullName: 'guarantor_full_name',
  guarantorPhones: 'guarantor_phones',
};

const EXPECTED_HEADERS = COLUMNS.map((c) => c.header.toLowerCase());

const MAX_DATA_ROWS = 1000;
const TEMPLATE_FILENAME = 'debtor-upload-template.csv';

class BulkUploadError extends Error {
  constructor(message, { code = 'BULK_UPLOAD' } = {}) {
    super(message);
    this.code = code;
  }
}

// ── Minimal RFC-4180 CSV parser (handles quoted fields, embedded commas,
//    doubled quotes, and CRLF line endings). Returns an array of string rows. ──
function parseCsv(text) {
  // Strip UTF-8 BOM if present.
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
      // Swallow — the following \n (or EOF) commits the row.
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // Commit the final field/row if there's any pending content.
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

// Derive an aging bucket from a DPD value. Bands are deliberately conservative
// and match what the debtor management UI color-codes.
function deriveBucket(dpd) {
  const n = Number(dpd);
  if (!Number.isFinite(n) || n <= 0) return 'Current';
  if (n <= 30) return '1-30';
  if (n <= 60) return '31-60';
  if (n <= 90) return '61-90';
  if (n <= 180) return '91-180';
  return '180+';
}

// ── Template generation — produces a UTF-8 CSV string with an example row. ──
function generateTemplateBuffer() {
  const escape = (val) => {
    const s = String(val);
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerLine = COLUMNS.map((c) => escape(c.header)).join(',');
  // One realistic example row (31 values, matching COLUMNS order).
  const exampleRow = [
    'Jane Mwangi',          // full_name
    '254710595755',         // phone_number
    '150000',               // amount
    '150000',               // principal_amount
    'ACC-20451',            // account_number
    'jane@example.com',     // email
    '30123456',             // id_number
    'LN-2025-0001',         // loan_id
    '0',                    // waived_amount
    '45',                   // dpd_level
    'CTR-9001',             // contract_number
    '45000',                // amount_repaid
    '254722000111',         // secondary_phone_number
    '12500',                // installment_amount
    '105000',               // arrears
    '1500',                 // penalty
    '2025-01-15',           // loan_taken_date
    '2025-06-15',           // loan_due_date
    '5000',                 // last_paid_amount
    '2025-05-30',           // last_paid_date
    '1',                    // loan_counter
    '12 MG Rd, Nairobi',    // physical_address
    'Acme Ltd, Westlands',  // employer_and_address
    'Brian Mwangi',         // next_of_kin_full_name
    'Brother',              // next_of_kin_relationship
    '254733222333',         // next_of_kin_phone_number
    'brian@example.com',    // next_of_kin_email
    'Peter Otieno',         // guarantor_full_name
    '254711444555',         // guarantor_phones
    'peter@example.com',    // guarantor_email
    '14 Riverside, Nairobi',// guarantor_address
  ];
  const exampleLine = exampleRow.map(escape).join(',');

  // Prepend BOM so Excel reads it as UTF-8.
  const csv = `\ufeff${headerLine}\r\n${exampleLine}\r\n`;
  return Buffer.from(csv, 'utf-8');
}

function templateHeaders() {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${TEMPLATE_FILENAME}"`,
  };
}

function parseNumber(val) {
  if (val == null) return 0;
  const cleaned = String(val).replace(/[,"]/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseNullableNumber(val) {
  if (val == null) return null;
  const cleaned = String(val).replace(/[,"]/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function parseAndImportDebtors(buffer, userId, options = {}) {
  // Form-level selections applied to every row in this batch.
  const batchDefaults = {
    clientId: options.clientId != null ? Number(options.clientId) || null : null,
    debtCategoryId: options.debtCategoryId != null ? Number(options.debtCategoryId) || null : null,
    debtTypeId: options.debtTypeId != null ? Number(options.debtTypeId) || null : null,
    currencyId: options.currencyId != null ? Number(options.currencyId) || null : null,
  };

  let text;
  try {
    text = buffer.toString('utf-8');
  } catch (err) {
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

  // ── Strict header-format check: the uploaded file must use the exact same
  //    headers as the downloaded template (order + spelling). If the template
  //    has been altered, reject the whole file before importing anything.
  const headerCells = allRows[0];
  if (!headerMatches(headerCells)) {
    throw new BulkUploadError(
      'The file template has been altered. Please download the template again and fill it in without changing, reordering or renaming the headers.',
      { code: 'INVALID_STRUCTURE' }
    );
  }

  // Create the batch record up front so every imported debtor can reference it
  // and share its id as the CFID. The file is named clientName_debtCategory_date
  // (e.g. Wekesir_Fintech_loans_07072026) rather than the raw uploaded filename.
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
  });
  const fileId = debtorFile.id;
  const cfid = String(fileId);

  const created = [];
  const updated = [];
  const failed = [];
  const seenLoanIds = new Set();
  const pending = [];
  let dataRowCount = 0;

  for (let r = 1; r < allRows.length; r += 1) {
    const cells = allRows[r];
    if (isBlankRow(cells)) continue;

    dataRowCount += 1;
    if (dataRowCount > MAX_DATA_ROWS) {
      failed.push({
        row: r + 1,
        name: '',
        message: `Upload limit exceeded — only the first ${MAX_DATA_ROWS} debtor rows are processed.`,
      });
      continue;
    }

    // Map cells by column key (trim strings).
    const cellsMap = {};
    COLUMNS.forEach((col, i) => {
      const v = cells[i] != null ? cells[i] : '';
      cellsMap[col.key] = String(v).trim();
    });

    const displayName = cellsMap.fullName || '(no name)';

    // ── Required-cell validation: every REQUIRED_COLUMNS cell must be present.
    const missing = REQUIRED_COLUMNS.filter((key) => !cellsMap[key]);
    if (missing.length > 0) {
      const labels = missing.map((k) => HEADER_LABELS[k] || k).join(', ');
      failed.push({
        row: r + 1,
        name: displayName,
        message: `Missing required column(s): ${labels}.`,
      });
      continue;
    }

    // Within-file dedup on the lender's loan_id (not cfid — cfid is the batch).
    const loanIdKey = cellsMap.loanId.toLowerCase();
    if (seenLoanIds.has(loanIdKey)) {
      failed.push({
        row: r + 1,
        name: displayName,
        message: `Duplicate loan_id "${cellsMap.loanId}" within the uploaded file.`,
      });
      continue;
    }
    seenLoanIds.add(loanIdKey);

    const dpd = parseInt(parseNumber(cellsMap.dpdLevel), 10) || 0;

    pending.push({
      row: r + 1,
      displayName,
      candidate: {
        name: cellsMap.fullName,
        clientId: batchDefaults.clientId,
        cfid,
        fileId,
        phone: cellsMap.phoneNumber || null,
        loanAmount: parseNumber(cellsMap.amount),
        totalPaid: parseNumber(cellsMap.amountRepaid),
        outstandingBalance: parseNumber(cellsMap.arrears),
        overdueDays: dpd,
        bucket: deriveBucket(dpd),
        borrowDate: parseDate(cellsMap.loanTakenDate),
        // Portfolio fields
        loanId: cellsMap.loanId || null,
        principalAmount: parseNullableNumber(cellsMap.principalAmount),
        accountNumber: cellsMap.accountNumber || null,
        email: cellsMap.email || null,
        idNumber: cellsMap.idNumber || null,
        waivedAmount: parseNullableNumber(cellsMap.waivedAmount),
        contractNumber: cellsMap.contractNumber || null,
        secondaryPhoneNumber: cellsMap.secondaryPhoneNumber || null,
        installmentAmount: parseNullableNumber(cellsMap.installmentAmount),
        penalty: parseNullableNumber(cellsMap.penalty),
        loanDueDate: parseDate(cellsMap.loanDueDate),
        lastPaidAmount: parseNullableNumber(cellsMap.lastPaidAmount),
        lastPaidDate: parseDate(cellsMap.lastPaidDate),
        loanCounter: cellsMap.loanCounter ? parseInt(parseNumber(cellsMap.loanCounter), 10) || null : null,
        physicalAddress: cellsMap.physicalAddress || null,
        employerAndAddress: cellsMap.employerAndAddress || null,
        nextOfKinFullName: cellsMap.nextOfKinFullName || null,
        nextOfKinRelationship: cellsMap.nextOfKinRelationship || null,
        nextOfKinPhoneNumber: cellsMap.nextOfKinPhoneNumber || null,
        nextOfKinEmail: cellsMap.nextOfKinEmail || null,
        guarantorFullName: cellsMap.guarantorFullName || null,
        guarantorPhones: cellsMap.guarantorPhones || null,
        guarantorEmail: cellsMap.guarantorEmail || null,
        guarantorAddress: cellsMap.guarantorAddress || null,
        // Batch lookups
        debtCategoryId: batchDefaults.debtCategoryId,
        debtTypeId: batchDefaults.debtTypeId,
        currencyId: batchDefaults.currencyId,
      },
    });
  }

  // Sequentially upsert so any thrown errors can be attributed to a row. Each
  // row is matched by (client_id, loan_id): new loans are inserted, while
  // re-uploaded loans update the existing debtor in place. When a re-upload
  // changes total_paid, the delta is recorded as a detected payment (the basis
  // for commissions). New debtors with an opening balance paid get a backfill
  // payment so they're commissioned consistently with the one-time snapshot.
  for (const job of pending) {
    try {
      const result = await upsertDebtorByLoanId(job.candidate);
      const { debtor, wasCreated, previousTotalPaid } = result;

      if (wasCreated) {
        created.push(debtor);
        recordActivityEvent({
          userId,
          actionType: 'debtor.created',
          title: 'Debtor Imported',
          subject: debtor.name,
          entityType: 'debtor',
          entityId: String(debtor.id),
        }).catch(() => {});

        if (Number(debtor.totalPaid) > 0) {
          await paymentService
            .recordBackfillPayment({
              debtorId: debtor.id,
              clientId: debtor.clientId,
              debtCategoryId: debtor.debtCategoryId,
              amount: Number(debtor.totalPaid) || 0,
              paymentDate: job.candidate.lastPaidDate || job.candidate.borrowDate || null,
              currencyId: debtor.currencyId,
              agentName: debtor.assignedAgent || null,
            })
            .catch((err) => {
              failed.push({
                row: job.row,
                name: job.displayName,
                message: `Imported, but opening payment could not be recorded: ${err.message}`,
              });
            });
        }
      } else {
        updated.push(debtor);
        const newTotalPaid = Number(debtor.totalPaid) || 0;
        const prev = Number(previousTotalPaid) || 0;
        if (newTotalPaid !== prev) {
          await paymentService
            .recordDetectedPayment({
              debtor,
              previousTotalPaid: prev,
              newTotalPaid,
              lastPaidDate: job.candidate.lastPaidDate || null,
              lastPaidAmount: job.candidate.lastPaidAmount != null ? Number(job.candidate.lastPaidAmount) : null,
              fileId,
              userId,
            })
            .catch((err) => {
              failed.push({
                row: job.row,
                name: job.displayName,
                message: `Updated, but payment delta could not be recorded: ${err.message}`,
              });
            });
        }
      }
    } catch (err) {
      if (err.code === 'VALIDATION') {
        failed.push({ row: job.row, name: job.displayName, message: err.message });
      } else {
        failed.push({
          row: job.row,
          name: job.displayName,
          message: err.message || 'Failed to import debtor.',
        });
      }
    }
  }

  // Update the batch stats so the file filter / history can show counts.
  await updateDebtorFileStats(fileId, {
    rowCount: dataRowCount,
    importedCount: created.length,
    skippedCount: failed.length,
  });

  return {
    createdCount: created.length,
    updatedCount: updated.length,
    failedCount: failed.length,
    created,
    updated,
    failed,
    fileId,
  };
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
