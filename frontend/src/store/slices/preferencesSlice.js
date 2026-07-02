import { createSlice } from '@reduxjs/toolkit';

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState: {
    colorMode: 'dark',
  },
  reducers: {
    setColorMode(state, action) {
      state.colorMode = action.payload;
    },
    toggleColorMode(state) {
      state.colorMode = state.colorMode === 'dark' ? 'light' : 'dark';
    },
  },
});

export const { setColorMode, toggleColorMode } = preferencesSlice.actions;
export default preferencesSlice.reducer;
