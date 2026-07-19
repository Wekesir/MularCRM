import api from './client';

function buildParams(filters = {}) {
  const params = {};
  const keys = ['clientId', 'agentId', 'status', 'search', 'debtorId', 'callCenterId'];
  for (const k of keys) {
    const v = filters[k];
    if (v !== null && v !== undefined && v !== '') params[k] = v;
  }
  return params;
}

/** Client-side monthly schedule (mirrors backend generateSchedule). */
export function buildSchedulePreview({ installmentAmount, installmentCount, firstDueDate }) {
  const amount = Number(installmentAmount) || 0;
  const count = Math.floor(Number(installmentCount) || 0);
  const start = String(firstDueDate || '').trim();
  if (!start || count < 1) {
    return { schedule: [], totalPlanAmount: 0 };
  }

  const schedule = [];
  for (let i = 0; i < count; i += 1) {
    schedule.push({
      sequence: i + 1,
      amount,
      dueDate: addMonths(start, i),
    });
  }
  return { schedule, totalPlanAmount: amount * count };
}

function addMonths(dateStr, months) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const year = y + Math.floor(targetMonthIndex / 12);
  let month = targetMonthIndex % 12;
  if (month < 0) month += 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export async function fetchLoanRestructures({ page = 1, pageSize = 25, ...filters } = {}) {
  const params = { page, pageSize, ...buildParams(filters) };
  const { data } = await api.get('/api/loan-restructures', { params });
  return data;
}

export async function fetchLoanRestructureTotals(filters = {}) {
  const params = buildParams(filters);
  const { data } = await api.get('/api/loan-restructures/totals', { params });
  return data;
}

export async function fetchLoanRestructure(id) {
  const { data } = await api.get(`/api/loan-restructures/${id}`);
  return data;
}

export async function createLoanRestructure(payload) {
  const { data } = await api.post('/api/loan-restructures', payload);
  return data;
}

export async function approveLoanRestructure(id) {
  const { data } = await api.post(`/api/loan-restructures/${id}/approve`);
  return data;
}

export async function rejectLoanRestructure(id, rejectionReason) {
  const { data } = await api.post(`/api/loan-restructures/${id}/reject`, { rejectionReason });
  return data;
}

export async function cancelLoanRestructure(id) {
  const { data } = await api.post(`/api/loan-restructures/${id}/cancel`);
  return data;
}

export async function updateRestructureInstallment(restructureId, installmentId, status) {
  const { data } = await api.patch(
    `/api/loan-restructures/${restructureId}/installments/${installmentId}`,
    { status }
  );
  return data;
}
