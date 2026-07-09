import api from './client';

export async function fetchUsers() {
  const { data } = await api.get('/api/users');
  return data;
}

export async function fetchUserById(id) {
  const { data } = await api.get(`/api/users/${id}`);
  return data;
}

export async function fetchUserPermissions(id) {
  const { data } = await api.get(`/api/users/${id}/permissions`);
  return data;
}

export async function createUser(payload) {
  const { data } = await api.post('/api/users', payload);
  return data;
}

export async function updateUser(id, payload) {
  const { data } = await api.put(`/api/users/${id}`, payload);
  return data;
}

export async function deleteUser(id) {
  const { data } = await api.delete(`/api/users/${id}`);
  return data;
}

export async function fetchDeletedUsers() {
  const { data } = await api.get('/api/users/deleted');
  return data;
}

export async function restoreUser(id) {
  const { data } = await api.post(`/api/users/${id}/restore`);
  return data;
}
