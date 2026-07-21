import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { REHYDRATE } from 'redux-persist';
import {
  changePasswordRequest,
  fetchCurrentUser,
  forgotPasswordRequest,
  loginRequest,
  logoutRequest,
  resetPasswordRequest,
  resendOtpRequest,
  verifyOtpRequest,
  webauthnAuthenticateOptionsRequest,
  webauthnAuthenticateVerifyRequest,
} from '../../api/auth';
import { startAuthentication } from '@simplewebauthn/browser';
import { fetchUserPermissions } from '../../api/reports';

const emptyUser = {
  name: '',
  email: '',
  avatar: '',
  yeastarExtension: null,
};

const defaultSession = {
  token: null,
  expiresAt: null,
  isAuthenticated: false,
};

const initialState = {
  user: emptyUser,
  userId: null,
  roleName: null,
  callCenterId: null,
  callCenterName: null,
  regionId: null,
  regionName: null,
  isSystemAdmin: false,
  mustResetPassword: false,
  permissions: null,
  permissionsLoaded: false,
  permissionsLoading: false,
  permissionsError: null,
  reportUnlocks: {},
  session: defaultSession,
  authLoading: false,
  authError: null,
};

export const login = createAsyncThunk('auth/login', async ({ email, password }, { rejectWithValue }) => {
  try {
    return await loginRequest(email, password);
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Login failed');
  }
});

export const verifyOtp = createAsyncThunk(
  'auth/verifyOtp',
  async ({ challengeId, code }, { rejectWithValue }) => {
    try {
      return await verifyOtpRequest(challengeId, code);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Verification failed');
    }
  }
);

export const resendOtp = createAsyncThunk('auth/resendOtp', async (challengeId, { rejectWithValue }) => {
  try {
    return await resendOtpRequest(challengeId);
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Failed to resend code');
  }
});

export const forgotPassword = createAsyncThunk('auth/forgotPassword', async (email, { rejectWithValue }) => {
  try {
    return await forgotPasswordRequest(email);
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Request failed');
  }
});

export const resetPassword = createAsyncThunk(
  'auth/resetPassword',
  async ({ token, newPassword }, { rejectWithValue }) => {
    try {
      return await resetPasswordRequest(token, newPassword);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Reset failed');
    }
  }
);

export const changePassword = createAsyncThunk(
  'auth/changePassword',
  async ({ currentPassword, newPassword }, { rejectWithValue }) => {
    try {
      return await changePasswordRequest(currentPassword, newPassword);
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Password change failed');
    }
  }
);

export const loginWithPasskey = createAsyncThunk(
  'auth/loginWithPasskey',
  async ({ email } = {}, { rejectWithValue }) => {
    try {
      const options = await webauthnAuthenticateOptionsRequest(email);
      const assertion = await startAuthentication({ optionsJSON: options });
      return await webauthnAuthenticateVerifyRequest(assertion);
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        return rejectWithValue('Passkey sign-in was cancelled or timed out');
      }
      return rejectWithValue(
        error.response?.data?.message || error?.message || 'Passkey sign-in failed'
      );
    }
  }
);

export const loadUserPermissions = createAsyncThunk('auth/loadUserPermissions', async () =>
  fetchUserPermissions()
);

export const bootstrapSession = createAsyncThunk('auth/bootstrapSession', async (_, { getState }) => {
  const { session } = getState().auth;
  if (!session.token || !session.isAuthenticated) {
    return null;
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new Error('Session expired');
  }

  return fetchCurrentUser();
});

function applyAuthSuccess(state, payload) {
  state.session.token = payload.token;
  state.session.expiresAt = payload.expiresAt;
  state.session.isAuthenticated = true;
  state.user = {
    name: payload.user.name,
    email: payload.user.email,
    avatar: payload.user.avatar || '',
  };
  state.userId = payload.user.id;
  state.roleName = payload.user.roleName || payload.roleName || null;
  state.callCenterId = payload.user.callCenterId ?? payload.callCenterId ?? null;
  state.callCenterName = payload.user.callCenterName ?? payload.callCenterName ?? null;
  state.regionId = payload.user.regionId ?? payload.regionId ?? null;
  state.regionName = payload.user.regionName ?? payload.regionName ?? null;
  state.isSystemAdmin = payload.isSystemAdmin;
  state.mustResetPassword = Boolean(payload.user.mustResetPassword);
  state.permissions = payload.permissions;
  state.permissionsLoaded = true;
  state.permissionsLoading = false;
  state.permissionsError = null;
  state.authError = null;
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action) {
      state.user = { ...state.user, ...action.payload };
    },
    setSession(state, action) {
      state.session = { ...state.session, ...action.payload };
    },
    clearSession(state) {
      state.session = { ...defaultSession };
      state.user = { ...emptyUser };
      state.userId = null;
      state.roleName = null;
      state.callCenterId = null;
      state.callCenterName = null;
      state.regionId = null;
      state.regionName = null;
      state.isSystemAdmin = false;
      state.mustResetPassword = false;
      state.permissions = null;
      state.permissionsLoaded = false;
      state.permissionsLoading = false;
      state.permissionsError = null;
      state.reportUnlocks = {};
      state.authError = null;
    },
    logout(state) {
      state.session = { ...defaultSession };
      state.user = { ...emptyUser };
      state.userId = null;
      state.roleName = null;
      state.callCenterId = null;
      state.callCenterName = null;
      state.regionId = null;
      state.regionName = null;
      state.isSystemAdmin = false;
      state.mustResetPassword = false;
      state.permissions = null;
      state.permissionsLoaded = false;
      state.permissionsLoading = false;
      state.permissionsError = null;
      state.reportUnlocks = {};
      state.authError = null;
    },
    setReportUnlock(state, action) {
      const { slug, token, expiresAt } = action.payload;
      if (!state.reportUnlocks) state.reportUnlocks = {};
      state.reportUnlocks[slug] = { token, expiresAt };
    },
    clearReportUnlock(state, action) {
      delete state.reportUnlocks[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(REHYDRATE, (state, action) => {
        const incoming = action.payload?.auth;
        if (!incoming) return;

        state.user = { ...emptyUser, ...incoming.user };
        state.userId = incoming.userId ?? null;
        state.roleName = incoming.roleName ?? null;
        state.callCenterId = incoming.callCenterId ?? null;
        state.callCenterName = incoming.callCenterName ?? null;
        state.regionId = incoming.regionId ?? null;
        state.regionName = incoming.regionName ?? null;
        state.isSystemAdmin = incoming.isSystemAdmin ?? false;
        state.mustResetPassword = incoming.mustResetPassword ?? false;
        state.permissions = incoming.permissions ?? null;
        state.permissionsLoaded = incoming.permissionsLoaded ?? false;
        state.permissionsLoading = incoming.permissionsLoading ?? false;
        state.permissionsError = incoming.permissionsError ?? null;
        state.reportUnlocks = incoming.reportUnlocks ?? {};
        state.session = { ...defaultSession, ...incoming.session };

        if (
          state.session.expiresAt &&
          new Date(state.session.expiresAt).getTime() <= Date.now()
        ) {
          state.session = { ...defaultSession };
          state.user = { ...emptyUser };
          state.userId = null;
          state.roleName = null;
          state.callCenterId = null;
          state.callCenterName = null;
          state.isSystemAdmin = false;
          state.mustResetPassword = false;
          state.permissions = null;
          state.permissionsLoaded = false;
        }
      })
      .addCase(login.pending, (state) => {
        state.authLoading = true;
        state.authError = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.authLoading = false;
        if (action.payload?.token) {
          applyAuthSuccess(state, action.payload);
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.authLoading = false;
        state.authError = action.payload || action.error.message || 'Login failed';
      })
      .addCase(verifyOtp.pending, (state) => {
        state.authLoading = true;
        state.authError = null;
      })
      .addCase(verifyOtp.fulfilled, (state, action) => {
        state.authLoading = false;
        applyAuthSuccess(state, action.payload);
      })
      .addCase(verifyOtp.rejected, (state, action) => {
        state.authLoading = false;
        state.authError = action.payload || action.error.message || 'Verification failed';
      })
      .addCase(loginWithPasskey.pending, (state) => {
        state.authLoading = true;
        state.authError = null;
      })
      .addCase(loginWithPasskey.fulfilled, (state, action) => {
        state.authLoading = false;
        if (action.payload?.token) {
          applyAuthSuccess(state, action.payload);
        }
      })
      .addCase(loginWithPasskey.rejected, (state, action) => {
        state.authLoading = false;
        state.authError = action.payload || action.error.message || 'Passkey sign-in failed';
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.user = {
          name: action.payload.name,
          email: action.payload.email,
          avatar: action.payload.avatar || '',
        };
        state.userId = action.payload.id;
        state.roleName = action.payload.roleName || null;
        state.callCenterId = action.payload.callCenterId ?? null;
        state.callCenterName = action.payload.callCenterName ?? null;
        state.regionId = action.payload.regionId ?? null;
        state.regionName = action.payload.regionName ?? null;
        state.isSystemAdmin = action.payload.isSystemAdmin;
        state.mustResetPassword = Boolean(action.payload.mustResetPassword);
        state.session.isAuthenticated = true;
      })
      .addCase(bootstrapSession.rejected, (state) => {
        state.session = { ...defaultSession };
        state.user = { ...emptyUser };
        state.userId = null;
        state.roleName = null;
        state.callCenterId = null;
        state.callCenterName = null;
        state.regionId = null;
        state.regionName = null;
        state.isSystemAdmin = false;
        state.mustResetPassword = false;
        state.permissions = null;
        state.permissionsLoaded = false;
      })
      .addCase(loadUserPermissions.pending, (state) => {
        state.permissionsLoading = true;
        state.permissionsError = null;
      })
      .addCase(loadUserPermissions.fulfilled, (state, action) => {
        state.userId = action.payload.userId;
        state.roleName = action.payload.roleName ?? state.roleName;
        state.isSystemAdmin = action.payload.isSystemAdmin;
        state.permissions = action.payload.permissions;
        state.permissionsLoaded = true;
        state.permissionsLoading = false;
        state.permissionsError = null;
      })
      .addCase(loadUserPermissions.rejected, (state, action) => {
        state.permissionsLoaded = true;
        state.permissionsLoading = false;
        state.isSystemAdmin = false;
        state.permissions = null;
        state.permissionsError =
          action.error?.message || 'Failed to load permissions';
      })
      .addCase(changePassword.fulfilled, (state) => {
        state.mustResetPassword = false;
      });
  },
});

export const {
  setUser,
  setSession,
  clearSession,
  logout,
  setReportUnlock,
  clearReportUnlock,
} = authSlice.actions;
export default authSlice.reducer;
