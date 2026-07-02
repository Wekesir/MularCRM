import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { fetchBranding, fetchSystemConfig, saveSystemConfig } from '../../api/systemConfig';
import { emptyConfig } from '../../utils/theme';

export const loadBranding = createAsyncThunk('systemConfig/loadBranding', async () => {
  return fetchBranding();
});

export const loadConfig = createAsyncThunk('systemConfig/loadConfig', async () => {
  return fetchSystemConfig();
});

export const updateConfig = createAsyncThunk(
  'systemConfig/updateConfig',
  async (updates) => saveSystemConfig(updates)
);

const systemConfigSlice = createSlice({
  name: 'systemConfig',
  initialState: {
    config: emptyConfig,
    loading: false,
    error: null,
  },
  reducers: {
    setBranding(state, action) {
      const { business, theme } = action.payload;
      if (business) state.config.business = business;
      if (theme) state.config.theme = theme;
    },
    setConfig(state, action) {
      state.config = action.payload;
    },
  },
  extraReducers: (builder) => {
    const applyConfig = (state, action) => {
      state.config = action.payload;
      state.loading = false;
      state.error = null;
    };

    builder
      .addCase(loadBranding.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadBranding.fulfilled, applyConfig)
      .addCase(loadBranding.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load branding';
      })
      .addCase(loadConfig.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadConfig.fulfilled, applyConfig)
      .addCase(loadConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load configuration';
      })
      .addCase(updateConfig.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateConfig.fulfilled, applyConfig)
      .addCase(updateConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to save configuration';
      });
  },
});

export const { setBranding, setConfig } = systemConfigSlice.actions;
export default systemConfigSlice.reducer;
