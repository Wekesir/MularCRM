/**
 * Shared debtor import helpers used by CSV bulk upload and live payments API.
 * Field contract matches the 31-column CSV template (snake_case headers).
 */
const pool = require('../db/pool');
const { upsertDebtorByLoanId, updateDebtorFileStats } = require('./debtorService');
const { recordActivityEvent } = require('./activityService');
const paymentService = require('./paymentService');

const NON_PAYMENT_UPDATE_FIELDS = new Set([
  'name',
  'phone',
  'email',
  'secondaryPhone',
  'loanAmount',
  'outstandingBalance',
  'overdueDays',
  'bucket',
  'waivedAmount',
  'installmentAmount',
  'penalty',
  'accountNumber',
  'idNumber',
  'contractNumber',
  'physicalAddress',
]);

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

const HEADER_LABELS = Object.fromEntries(COLUMNS.map((c) => [c.key, c.header]));
const HEADER_TO_KEY = Object.fromEntries(COLUMNS.map((c) => [c.header, c.key]));

const MAX_DATA_ROWS = 1000;

function deriveBucket(dpd) {
  const n = Number(dpd);
  if (!Number.isFinite(n) || n <= 0) return 'Current';
  if (n <= 30) return '1-30';
  if (n <= 60) return '31-60';
  if (n <= 90) return '61-90';
  if (n <= 180) return '91-180';
  return '180+';
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

/**
 * Normalize a raw object (CSV cells map or API JSON) into internal column keys.
 * Accepts snake_case CSV headers and camelCase keys.
 */
function normalizeRowObject(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const cellsMap = {};
  for (const col of COLUMNS) {
    let v = raw[col.key];
    if (v == null) v = raw[col.header];
    cellsMap[col.key] = v != null ? String(v).trim() : '';
  }
  return cellsMap;
}

function buildCandidateFromCells(cellsMap, {
  clientId,
  cfid,
  fileId,
  debtCategoryId,
  debtTypeId,
  currencyId,
  regionId,
}) {
  const dpd = parseInt(parseNumber(cellsMap.dpdLevel), 10) || 0;
  return {
    name: cellsMap.fullName,
    clientId,
    cfid,
    fileId,
    phone: cellsMap.phoneNumber || null,
    loanAmount: parseNumber(cellsMap.amount),
    totalPaid: parseNumber(cellsMap.amountRepaid),
    outstandingBalance: parseNumber(cellsMap.arrears),
    overdueDays: dpd,
    bucket: deriveBucket(dpd),
    borrowDate: parseDate(cellsMap.loanTakenDate),
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
    loanCounter: cellsMap.loanCounter
      ? parseInt(parseNumber(cellsMap.loanCounter), 10) || null
      : null,
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
    debtCategoryId,
    debtTypeId,
    currencyId,
    regionId,
  };
}

/**
 * Import normalized row objects into an existing case file (fileId/cfid).
 * @param {object[]} rows - Each row is either a cellsMap (camelCase keys) or raw API/CSV object
 * @param {object} options
 */
async function importDebtorRows(rows, {
  clientId,
  debtCategoryId = null,
  debtTypeId = null,
  currencyId = null,
  regionId = null,
  userId = null,
  fileId,
  cfid,
  maxRows = MAX_DATA_ROWS,
  replaceStats = false,
} = {}) {
  const created = [];
  const updated = [];
  const failed = [];
  const seenLoanIds = new Set();
  const pending = [];
  let dataRowCount = 0;

  const list = Array.isArray(rows) ? rows : [];

  for (let i = 0; i < list.length; i += 1) {
    dataRowCount += 1;
    if (dataRowCount > maxRows) {
      failed.push({
        row: i + 1,
        name: '',
        message: `Import limit exceeded — only the first ${maxRows} debtor rows are processed.`,
      });
      continue;
    }

    const cellsMap = normalizeRowObject(list[i]);
    const displayName = cellsMap.fullName || '(no name)';

    const missing = REQUIRED_COLUMNS.filter((key) => !cellsMap[key]);
    if (missing.length > 0) {
      const labels = missing.map((k) => HEADER_LABELS[k] || k).join(', ');
      failed.push({
        row: i + 1,
        name: displayName,
        message: `Missing required column(s): ${labels}.`,
      });
      continue;
    }

    const loanIdKey = cellsMap.loanId.toLowerCase();
    if (seenLoanIds.has(loanIdKey)) {
      failed.push({
        row: i + 1,
        name: displayName,
        message: `Duplicate loan_id "${cellsMap.loanId}" within this import.`,
      });
      continue;
    }
    seenLoanIds.add(loanIdKey);

    pending.push({
      row: i + 1,
      displayName,
      candidate: buildCandidateFromCells(cellsMap, {
        clientId,
        cfid,
        fileId,
        debtCategoryId,
        debtTypeId,
        currencyId,
        regionId,
      }),
    });
  }

  for (const job of pending) {
    try {
      const result = await upsertDebtorByLoanId(job.candidate);
      const { debtor, wasCreated, previousTotalPaid, changedFields = [] } = result;

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
              debtorName: debtor.name,
              userId,
              recordActivity: true,
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
              lastPaidAmount:
                job.candidate.lastPaidAmount != null ? Number(job.candidate.lastPaidAmount) : null,
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

        const materialChanges = changedFields.filter((f) => NON_PAYMENT_UPDATE_FIELDS.has(f));
        if (materialChanges.length > 0) {
          recordActivityEvent({
            userId,
            actionType: 'debtor.updated',
            title: 'Debtor Details Updated',
            subject: debtor.name,
            entityType: 'debtor',
            entityId: String(debtor.id),
            metadata: {
              source: 'import',
              fileId: Number(fileId) || null,
              changedFields: materialChanges,
            },
          }).catch(() => {});
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

  if (replaceStats) {
    await updateDebtorFileStats(fileId, {
      rowCount: dataRowCount,
      importedCount: created.length,
      skippedCount: failed.length,
    });
  } else {
    // Append mode (API re-pull same day): increment counters.
    const [[stats]] = await pool.query(
      'SELECT row_count, imported_count, skipped_count FROM debtor_files WHERE id = ? LIMIT 1',
      [fileId]
    );
    await updateDebtorFileStats(fileId, {
      rowCount: (Number(stats?.row_count) || 0) + dataRowCount,
      importedCount: (Number(stats?.imported_count) || 0) + created.length,
      skippedCount: (Number(stats?.skipped_count) || 0) + failed.length,
    });
  }

  return {
    createdCount: created.length,
    updatedCount: updated.length,
    failedCount: failed.length,
    created,
    updated,
    failed,
    fileId,
    cfid: String(cfid),
  };
}

module.exports = {
  COLUMNS,
  REQUIRED_COLUMNS,
  HEADER_LABELS,
  HEADER_TO_KEY,
  MAX_DATA_ROWS,
  deriveBucket,
  parseNumber,
  parseDate,
  parseNullableNumber,
  normalizeRowObject,
  buildCandidateFromCells,
  importDebtorRows,
};
