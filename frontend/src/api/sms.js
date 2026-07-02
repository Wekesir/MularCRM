import api from './client';

export async function fetchSmsLogsStats({ dateFrom, dateTo } = {}) {
  const { data } = await api.get('/api/sms-logs/stats', { params: { dateFrom, dateTo } });
  return data;
}
