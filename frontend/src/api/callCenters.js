import api from './client';

export async function fetchCallCenters({ includeInactive = false } = {}) {
  const { data } = await api.get('/api/call-centers', {
    params: includeInactive ? { includeInactive: 1 } : undefined,
  });
  return data;
}

export async function fetchCallCenter(id) {
  const { data } = await api.get(`/api/call-centers/${id}`);
  return data;
}

export async function fetchCallCenterStaff(id) {
  const { data } = await api.get(`/api/call-centers/${id}/staff`);
  return data;
}

/** @param {number|string} id @param {'supervisor'|'agent'} kind */
export async function fetchAssignableStaff(id, kind = 'supervisor') {
  const { data } = await api.get(`/api/call-centers/${id}/assignable-staff`, {
    params: { kind },
  });
  return data;
}

export async function createCallCenter(payload) {
  const { data } = await api.post('/api/call-centers', payload);
  return data;
}

export async function updateCallCenter(id, payload) {
  const { data } = await api.put(`/api/call-centers/${id}`, payload);
  return data;
}

export async function deleteCallCenter(id) {
  const { data } = await api.delete(`/api/call-centers/${id}`);
  return data;
}

export async function transferSupervisorToCenter(callCenterId, userId) {
  const { data } = await api.post(`/api/call-centers/${callCenterId}/transfer-supervisor`, {
    userId,
  });
  return data;
}

export async function transferAgentToCenter(callCenterId, userId) {
  const { data } = await api.post(`/api/call-centers/${callCenterId}/transfer-agent`, {
    userId,
  });
  return data;
}
