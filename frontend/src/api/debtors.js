import api from './client';

// Build query params from an advanced-filter object, omitting empty values.
function buildFilterParams(filters = {}) {
  const params = {};
  const keys = [
    'fileId', 'clientId', 'bucket', 'agent', 'contactStatusId',
    'assignmentStatus', 'closed', 'ptp', 'discounted',
    'dpdMin', 'dpdMax', 'balanceMin', 'balanceMax',
    'lastContactedFrom', 'lastContactedTo', 'nextActionFrom', 'nextActionTo',
    'search',
  ];
  for (const k of keys) {
    const v = filters[k];
    if (v !== null && v !== undefined && v !== '') params[k] = v;
  }
  return params;
}

// Paginated debtor list. Returns { items, total, page, pageSize, hasMore }.
export async function fetchDebtors({
  page = 1,
  pageSize = 25,
  ...filters
} = {}) {
  const params = { page, pageSize, ...buildFilterParams(filters) };
  const { data } = await api.get('/api/debtors', { params });
  return data;
}

// Aggregate totals for the stat cards (respects the same filters as the list).
export async function fetchDebtorTotals(filters = {}) {
  const params = buildFilterParams(filters);
  const { data } = await api.get('/api/debtors/totals', { params });
  return data;
}

export async function fetchDebtorFiles() {
  const { data } = await api.get('/api/debtors/files');
  return data;
}

export async function deleteDebtorFile(id) {
  const { data } = await api.delete(`/api/debtors/files/${id}`);
  return data;
}

// Distinct buckets for the filter dropdown (respects current filters).
export async function fetchDebtorBuckets(filters = {}) {
  const params = buildFilterParams(filters);
  const { data } = await api.get('/api/debtors/buckets', { params });
  return data;
}

// Distinct assigned-agent values for the Agent filter dropdown.
export async function fetchDebtorAgents(filters = {}) {
  const params = buildFilterParams(filters);
  const { data } = await api.get('/api/debtors/agents', { params });
  return data;
}

// Full filtered set for CSV/Excel export (unpaginated).
export async function fetchDebtorsForExport(filters = {}) {
  const params = buildFilterParams(filters);
  const { data } = await api.get('/api/debtors/export', { params });
  return data;
}

export async function fetchDebtorById(id) {
  const { data } = await api.get(`/api/debtors/${id}`);
  return data;
}

export async function fetchDebtorHistory(id) {
  const { data } = await api.get(`/api/debtors/${id}/history`);
  return data;
}

export async function closeDebtorCase(id, reason) {
  const { data } = await api.post(`/api/debtors/${id}/close`, { reason });
  return data;
}

export async function reopenDebtorCase(id) {
  const { data } = await api.post(`/api/debtors/${id}/reopen`);
  return data;
}

export async function downloadDebtorTemplate() {
  const response = await api.get('/api/debtors/template', {
    responseType: 'blob',
  });
  const filename =
    response.headers['content-disposition']
      ?.match(/filename="?([^";]+)"?/i)?.[1] || 'debtor-upload-template.csv';

  const url = window.URL.createObjectURL(
    new Blob([response.data], { type: 'text/csv;charset=utf-8' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function bulkUploadDebtors(file, selections = {}) {
  const formData = new FormData();
  formData.append('file', file);
  if (selections.clientId) formData.append('clientId', String(selections.clientId));
  if (selections.debtCategoryId) formData.append('debtCategoryId', String(selections.debtCategoryId));
  if (selections.debtTypeId) formData.append('debtTypeId', String(selections.debtTypeId));
  if (selections.currencyId) formData.append('currencyId', String(selections.currencyId));
  const { data } = await api.post('/api/debtors/bulk-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
