import api from './client';

export async function loginRequest(email, password) {
  const { data } = await api.post('/api/auth/login', { email, password });
  return data;
}

export async function verifyOtpRequest(challengeId, code) {
  const { data } = await api.post('/api/auth/verify-otp', { challengeId, code });
  return data;
}

export async function resendOtpRequest(challengeId) {
  const { data } = await api.post('/api/auth/resend-otp', { challengeId });
  return data;
}

export async function forgotPasswordRequest(email) {
  const { data } = await api.post('/api/auth/forgot-password', { email });
  return data;
}

export async function resetPasswordRequest(token, newPassword) {
  const { data } = await api.post('/api/auth/reset-password', { token, newPassword });
  return data;
}

export async function changePasswordRequest(currentPassword, newPassword) {
  const { data } = await api.post('/api/auth/change-password', { currentPassword, newPassword });
  return data;
}

export async function fetchCurrentUser() {
  const { data } = await api.get('/api/auth/me');
  return data;
}

export async function logoutRequest() {
  const { data } = await api.post('/api/auth/logout');
  return data;
}
