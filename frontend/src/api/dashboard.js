import api from './client';

/** Organisation-wide dashboard (Managers / Admins). */
export async function fetchOrgDashboard() {
  const { data } = await api.get('/api/dashboard');
  return data;
}
