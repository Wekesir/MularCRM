import { createSlice } from '@reduxjs/toolkit';

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState: {
    colorMode: 'dark',
    sidebarCollapsed: false,
  },
  reducers: {
    setColorMode(state, action) {
      state.colorMode = action.payload;
    },
    toggleColorMode(state) {
      state.colorMode = state.colorMode === 'dark' ? 'light' : 'dark';
    },
    setSidebarCollapsed(state, action) {
      state.sidebarCollapsed = Boolean(action.payload);
    },
    toggleSidebarCollapsed(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
  },
});

export const { setColorMode, toggleColorMode, setSidebarCollapsed, toggleSidebarCollapsed } =
  preferencesSlice.actions;
export default preferencesSlice.reducer;
