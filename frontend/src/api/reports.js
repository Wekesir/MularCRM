import api from './client';

export async function fetchUserPermissions() {
  const { data } = await api.get('/api/reports/permissions');
  return data;
}

export async function fetchAccessibleReports(slugs) {
  const { data } = await api.get('/api/reports/accessible', {
    params: { slugs: slugs.join(',') },
  });
  return data;
}

export async function fetchReportGate(slug, token) {
  const { data } = await api.get(`/api/reports/${slug}/gate`, {
    params: { token: token || undefined },
  });
  return data;
}

export async function unlockReport(slug, password) {
  const { data } = await api.post(`/api/reports/${slug}/unlock`, { password });
  return data;
}

export async function fetchReportAccessSettings() {
  const { data } = await api.get('/api/reports/access-settings');
  return data;
}

export async function setReportPassword(slug, password) {
  const { data } = await api.put(`/api/reports/access-settings/${slug}/password`, { password });
  return data;
}

export async function clearReportPassword(slug) {
  const { data } = await api.delete(`/api/reports/access-settings/${slug}/password`);
  return data;
}
