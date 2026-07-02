import api from './client';

export async function fetchEmailLogsStats({ dateFrom, dateTo } = {}) {
  const { data } = await api.get('/api/email-logs/stats', { params: { dateFrom, dateTo } });
  return data;
}
