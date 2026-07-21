import api from './client';

export async function fetchRegions({ includeInactive = true } = {}) {
  const { data } = await api.get('/api/regions', {
    params: { includeInactive: includeInactive ? 'true' : 'false' },
  });
  return data;
}

export async function createRegion(payload) {
  const { data } = await api.post('/api/regions', payload);
  return data;
}

export async function updateRegion(id, payload) {
  const { data } = await api.put(`/api/regions/${id}`, payload);
  return data;
}

export async function deleteRegion(id) {
  const { data } = await api.delete(`/api/regions/${id}`);
  return data;
}
