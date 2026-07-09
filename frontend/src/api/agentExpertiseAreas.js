import api from './client';

export async function fetchAgentExpertiseAreas() {
  const { data } = await api.get('/api/agent-expertise-areas');
  return data;
}

export async function createAgentExpertiseArea(payload) {
  const { data } = await api.post('/api/agent-expertise-areas', payload);
  return data;
}

export async function updateAgentExpertiseArea(id, payload) {
  const { data } = await api.put(`/api/agent-expertise-areas/${id}`, payload);
  return data;
}

export async function deleteAgentExpertiseArea(id) {
  const { data } = await api.delete(`/api/agent-expertise-areas/${id}`);
  return data;
}
