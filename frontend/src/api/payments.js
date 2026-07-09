import api from './client';

function buildParams(filters = {}) {
  const params = {};
  const keys = [
    'clientId', 'debtCategoryId', 'fileId', 'agentName', 'source',
    'dateFrom', 'dateTo', 'search',
  ];
  for (const k of keys) {
    const v = filters[k];
    if (v !== null && v !== undefined && v !== '') params[k] = v;
  }
  return params;
}

export async function fetchPayments({ page = 1, pageSize = 25, ...filters } = {}) {
  const params = { page, pageSize, ...buildParams(filters) };
  const { data } = await api.get('/api/payments', { params });
  return data;
}

export async function fetchPaymentTotals(filters = {}) {
  const params = buildParams(filters);
  const { data } = await api.get('/api/payments/totals', { params });
  return data;
}
