import api from './client';

export async function fetchPermissionRegistry() {
  const { data } = await api.get('/api/access/permission-registry');
  return data;
}

export async function fetchRoles() {
  const { data } = await api.get('/api/access/roles');
  return data;
}

export async function createRole(payload) {
  const { data } = await api.post('/api/access/roles', payload);
  return data;
}

export async function updateRole(id, payload) {
  const { data } = await api.put(`/api/access/roles/${id}`, payload);
  return data;
}

export async function deleteRole(id) {
  const { data } = await api.delete(`/api/access/roles/${id}`);
  return data;
}

export async function fetchUsers() {
  const { data } = await api.get('/api/access/users');
  return data;
}

export async function createUser(payload) {
  const { data } = await api.post('/api/access/users', payload);
  return data;
}

export async function updateUser(id, payload) {
  const { data } = await api.put(`/api/access/users/${id}`, payload);
  return data;
}

export async function deleteUser(id) {
  const { data } = await api.delete(`/api/access/users/${id}`);
  return data;
}
