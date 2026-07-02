import { combineReducers, configureStore } from '@reduxjs/toolkit';
import {
  FLUSH,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  REHYDRATE,
  persistReducer,
  persistStore,
} from 'redux-persist';
import createTransform from 'redux-persist/es/createTransform';
import storage from 'redux-persist/lib/storage';
import { emptyConfig } from '../utils/theme';
import authReducer from './slices/authSlice';
import preferencesReducer from './slices/preferencesSlice';
import systemConfigReducer from './slices/systemConfigSlice';

const systemConfigTransform = createTransform(
  (inbound) => ({
    config: {
      business: inbound.config?.business ?? emptyConfig.business,
      theme: inbound.config?.theme ?? emptyConfig.theme,
    },
    loading: false,
    error: null,
  }),
  (outbound) => ({
    config: {
      ...emptyConfig,
      business: outbound.config?.business ?? emptyConfig.business,
      theme: outbound.config?.theme ?? emptyConfig.theme,
    },
    loading: false,
    error: null,
  }),
  { whitelist: ['systemConfig'] }
);

const persistConfig = {
  key: 'omnicrm',
  storage,
  whitelist: ['systemConfig', 'auth', 'preferences'],
  transforms: [systemConfigTransform],
};

const rootReducer = combineReducers({
  systemConfig: systemConfigReducer,
  auth: authReducer,
  preferences: preferencesReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);
