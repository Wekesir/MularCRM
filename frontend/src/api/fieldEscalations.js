import api from './client';

function buildParams(filters = {}) {
  const params = {};
  const keys = [
    'clientId',
    'status',
    'statusIn',
    'search',
    'debtorId',
    'callCenterId',
    'page',
    'pageSize',
  ];
  for (const k of keys) {
    const v = filters[k];
    if (v !== null && v !== undefined && v !== '') params[k] = v;
  }
  return params;
}

export async function fetchEligibleDebtors(filters = {}) {
  const { data } = await api.get('/api/field-escalations/eligible', { params: buildParams(filters) });
  return data;
}

export async function fetchFieldEscalations(filters = {}) {
  const { data } = await api.get('/api/field-escalations', { params: buildParams(filters) });
  return data;
}

export async function fetchFieldEscalationTotals(filters = {}) {
  const { data } = await api.get('/api/field-escalations/totals', { params: buildParams(filters) });
  return data;
}

export async function fetchFieldEscalation(id) {
  const { data } = await api.get(`/api/field-escalations/${id}`);
  return data;
}

export async function requestFieldEscalation(payload) {
  const { data } = await api.post('/api/field-escalations', payload);
  return data;
}

export async function approveFieldEscalation(id, payload = {}) {
  const { data } = await api.post(`/api/field-escalations/${id}/approve`, payload);
  return data;
}

export async function rejectFieldEscalation(id, payload = {}) {
  const { data } = await api.post(`/api/field-escalations/${id}/reject`, payload);
  return data;
}

export async function assignFieldEscalation(id, fieldAgentUserId) {
  const { data } = await api.post(`/api/field-escalations/${id}/assign`, { fieldAgentUserId });
  return data;
}

export async function cancelFieldEscalation(id) {
  const { data } = await api.post(`/api/field-escalations/${id}/cancel`);
  return data;
}

export async function fetchFieldAgents(callCenterId) {
  const params = {};
  if (callCenterId != null && callCenterId !== '') params.callCenterId = callCenterId;
  const { data } = await api.get('/api/field-escalations/field-agents', { params });
  return data;
}

export async function fetchFieldEscalationConfig() {
  const { data } = await api.get('/api/field-escalations/config');
  return data;
}

export async function updateFieldEscalationConfig(payload) {
  const { data } = await api.put('/api/field-escalations/config', payload);
  return data;
}
