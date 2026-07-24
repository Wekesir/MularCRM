import api from './client';

export async function fetchAgents(params = {}) {
  const { data } = await api.get('/api/agents', { params });
  return data;
}

export async function fetchAgentById(id) {
  const { data } = await api.get(`/api/agents/${id}`);
  return data;
}

export async function updateAgentProfile(id, payload) {
  const { data } = await api.put(`/api/agents/${id}/profile`, payload);
  return data;
}

export async function setAgentStatus(id, isActive) {
  const { data } = await api.patch(`/api/agents/${id}/status`, { isActive });
  return data;
}

export async function fetchAgentKpis(id) {
  const { data } = await api.get(`/api/agents/${id}/kpis`);
  return data;
}

export async function updateAgentKpis(id, payload) {
  const { data } = await api.put(`/api/agents/${id}/kpis`, payload);
  return data;
}

export async function fetchAgentCoverages(params = {}) {
  const { data } = await api.get('/api/agents/coverages', { params });
  return data;
}

export async function fetchActiveCoverageCount() {
  const { data } = await api.get('/api/agents/coverages/active-count');
  return data;
}

export async function createAgentCoverage(payload) {
  const { data } = await api.post('/api/agents/coverages', payload);
  return data;
}

export async function endAgentCoverage(coverageId, payload = {}) {
  const { data } = await api.post(`/api/agents/coverages/${coverageId}/end`, payload);
  return data;
}

export async function fetchAgentPortfolioCount(id) {
  const { data } = await api.get(`/api/agents/${id}/portfolio-count`);
  return data;
}

export async function handoffAgentPortfolio(id, payload) {
  const { data } = await api.post(`/api/agents/${id}/handoff`, payload);
  return data;
}
