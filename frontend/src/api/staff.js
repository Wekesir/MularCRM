import api from './client';

export async function fetchStaffCoverages(params = {}) {
  const { data } = await api.get('/api/staff/coverages', { params });
  return data;
}

export async function fetchActiveStaffCoverageCount() {
  const { data } = await api.get('/api/staff/coverages/active-count');
  return data;
}

export async function createStaffCoverage(payload) {
  const { data } = await api.post('/api/staff/coverages', payload);
  return data;
}

export async function endStaffCoverage(coverageId, payload = {}) {
  const { data } = await api.post(`/api/staff/coverages/${coverageId}/end`, payload);
  return data;
}

export async function fetchStaffSuccession(id) {
  const { data } = await api.get(`/api/staff/${id}/succession`);
  return data;
}

export async function handoffStaffRole(id, payload) {
  const { data } = await api.post(`/api/staff/${id}/handoff`, payload);
  return data;
}
