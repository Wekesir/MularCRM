import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import LoadingButton from '../components/LoadingButton';

const ConfirmContext = createContext(null);

const DEFAULT_OPTIONS = {
  title: 'Confirm action',
  message: 'Are you sure you want to continue?',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  danger: true,
  confirmLoadingText: 'Deleting…',
};

export function ConfirmProvider({ children }) {
  const [options, setOptions] = useState(null);
  const [isResolving, setIsResolving] = useState(false);
  const resolverRef = useRef(null);

  const close = useCallback((settled) => {
    setOptions(null);
    setIsResolving(false);
    const resolver = resolverRef.current;
    resolverRef.current = null;
    if (resolver) resolver(settled);
  }, []);

  const confirm = useCallback((userOptions) => {
    const merged = { ...DEFAULT_OPTIONS, ...userOptions };
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOptions(merged);
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    const onConfirm = options?.onConfirm;
    if (typeof onConfirm !== 'function') {
      close(true);
      return;
    }
    setIsResolving(true);
    try {
      await onConfirm();
      close(true);
    } catch {
      // onConfirm is responsible for surfacing the error (e.g. toast).
      // Keep the dialog open so the user can retry or cancel.
      setIsResolving(false);
    }
  }, [options, close]);

  const handleCancel = useCallback(() => {
    if (isResolving) return;
    close(false);
  }, [isResolving, close]);

  const value = { confirm };

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {options && (
        <ConfirmDialog
          options={options}
          isResolving={isResolving}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Graceful fallback for components rendered outside the provider.
    return {
      confirm: (opts) => {
        if (opts?.onConfirm) {
          return Promise.resolve(opts.onConfirm());
        }
        return Promise.resolve(true);
      },
    };
  }
  return ctx;
}

function ConfirmDialog({ options, isResolving, onConfirm, onCancel }) {
  const { title, message, confirmText, cancelText, danger, confirmLoadingText, detail } = options;

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel confirm-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className={danger ? 'cf-accent-strip cf-accent-strip-danger' : 'cf-accent-strip'} aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div
              className={danger ? 'cf-header-icon cf-header-icon-danger' : 'cf-header-icon'}
              aria-hidden="true"
            >
              <AlertTriangle className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="confirm-title" className="cf-title">{title}</h2>
              <p className="cf-subtitle">{message}</p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onCancel}
            aria-label="Close"
            disabled={isResolving}
          >
            <X className="modal-close-icon" />
          </button>
        </div>

        {detail && (
          <div className="cf-body">
            <div className="cf-callout">
              <div className="cf-callout-icon" aria-hidden="true">
                <AlertTriangle className="cf-callout-icon-svg" />
              </div>
              <p className="cf-callout-text">{detail}</p>
            </div>
          </div>
        )}

        <div className="cf-footer">
          <button
            type="button"
            className="cf-btn-cancel"
            onClick={onCancel}
            disabled={isResolving}
          >
            {cancelText}
          </button>
          <LoadingButton
            className={danger ? 'cf-btn-save cf-btn-danger' : 'cf-btn-save'}
            onClick={onConfirm}
            loading={isResolving}
            loadingText={confirmLoadingText}
          >
            {confirmText}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
