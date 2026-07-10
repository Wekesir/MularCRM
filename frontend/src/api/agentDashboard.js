import api from './client';

/**
 * Personal agent dashboard (self-scoped).
 * @param {{ period?: 'daily' | 'weekly' | 'monthly' }} [params]
 */
export async function fetchAgentDashboard(params = {}) {
  const { data } = await api.get('/api/agents/me/dashboard', { params });
  return data;
}
