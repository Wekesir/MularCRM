import api from './client';

export async function fetchAgentExperienceLevels() {
  const { data } = await api.get('/api/agent-experience-levels');
  return data;
}

export async function createAgentExperienceLevel(payload) {
  const { data } = await api.post('/api/agent-experience-levels', payload);
  return data;
}

export async function updateAgentExperienceLevel(id, payload) {
  const { data } = await api.put(`/api/agent-experience-levels/${id}`, payload);
  return data;
}

export async function deleteAgentExperienceLevel(id) {
  const { data } = await api.delete(`/api/agent-experience-levels/${id}`);
  return data;
}
