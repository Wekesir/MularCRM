import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';

function AuthFormField({
  id,
  label,
  type = 'text',
  icon: Icon,
  hint,
  className = '',
  ...inputProps
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  const FieldIcon = Icon || (isPassword ? Lock : Mail);
  const inputType = isPassword && visible ? 'text' : type;

  return (
    <label className={`auth-field ${className}`.trim()} htmlFor={id}>
      <span className="auth-field-label">{label}</span>
      <span
        className={`auth-field-control${isPassword ? ' auth-field-control-password' : ''}`.trim()}
      >
        <FieldIcon className="auth-field-icon" aria-hidden="true" />
        <input id={id} type={inputType} className="auth-field-input" {...inputProps} />
        {isPassword ? (
          <button
            type="button"
            className="auth-field-toggle"
            onClick={() => setVisible((prev) => !prev)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
          >
            {visible ? (
              <EyeOff className="auth-field-toggle-icon" aria-hidden="true" />
            ) : (
              <Eye className="auth-field-toggle-icon" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </span>
      {hint ? <span className="auth-field-hint">{hint}</span> : null}
    </label>
  );
}

export default AuthFormField;
