import { useCallback } from 'react';
import { toast } from 'react-toastify';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loadConfig, updateConfig as updateConfigThunk } from '../store/slices/systemConfigSlice';

export function useSystemConfig() {
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.systemConfig.config);
  const loading = useAppSelector((state) => state.systemConfig.loading);

  const loadConfigFn = useCallback(() => dispatch(loadConfig()).unwrap(), [dispatch]);

  const updateConfigFn = useCallback(
    (updates) => dispatch(updateConfigThunk(updates)).unwrap(),
    [dispatch]
  );

  return {
    config,
    loading,
    loadConfig: loadConfigFn,
    updateConfig: updateConfigFn,
    businessName: config.business?.name || 'OMNICRM',
    businessLogo: config.business?.logo || '',
    themeColor: config.theme?.color || '#3b82f6',
    currencyCode: config.business?.currency?.code || 'KES',
    currencySymbol: config.business?.currency?.symbol || 'KSh',
  };
}

/** @deprecated Provider no longer required — Redux store is used instead. */
export function SystemConfigProvider({ children }) {
  return children;
}
