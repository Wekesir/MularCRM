import { Loader2 } from 'lucide-react';

function LoadingButton({
  loading = false,
  loadingText = 'Loading...',
  children,
  trailingIcon = null,
  className = '',
  type = 'button',
  disabled,
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={`loading-button ${loading ? 'is-loading' : ''} ${className}`.trim()}
      disabled={isDisabled}
      aria-busy={loading}
      {...props}
    >
      {loading && <Loader2 className="btn-spinner" aria-hidden="true" />}
      <span className="loading-button-text">{loading ? loadingText : children}</span>
      {!loading && trailingIcon}
    </button>
  );
}

export default LoadingButton;
