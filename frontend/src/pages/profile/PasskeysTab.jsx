import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Plus, RefreshCw, Shield, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import { toast } from 'react-toastify';
import LoadingButton from '../../components/LoadingButton';
import AuthFormField from '../../components/auth/AuthFormField';
import { usePageActions } from '../../context/PageActionsContext';
import {
  deletePasskeyRequest,
  listPasskeysRequest,
  webauthnRegisterOptionsRequest,
  webauthnRegisterVerifyRequest,
} from '../../api/auth';

function formatDate(value) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function browserSupportsPasskeys() {
  return typeof window !== 'undefined' && window.PublicKeyCredential != null;
}

function HowItWorksCard() {
  return (
    <div className="passkeys-explainer-card">
      <h3 className="passkeys-explainer-title">How it works</h3>
      <ul className="passkeys-explainer-list">
        <li className="passkeys-explainer-item">
          <span className="passkeys-explainer-num">1</span>
          <span>
            <strong>Register once</strong> — click <em>Add this device</em> and choose{' '}
            <em>this device</em> / fingerprint when prompted (not Google Password Manager).
          </span>
        </li>
        <li className="passkeys-explainer-item">
          <span className="passkeys-explainer-num">2</span>
          <span>
            <strong>Sign in faster</strong> — on the login page, enter your email, choose
            &ldquo;Sign in with fingerprint,&rdquo; and verify with your biometric. No OTP needed.
          </span>
        </li>
        <li className="passkeys-explainer-item">
          <span className="passkeys-explainer-num">3</span>
          <span>
            <strong>Password stays as fallback</strong> — email/password and OTP still work on any
            device.
          </span>
        </li>
      </ul>
      <div className="passkeys-explainer-note">
        <Shield className="passkeys-explainer-note-icon" aria-hidden="true" />
        <span>
          Synced Google passkeys unlock with a Google PIN, not your fingerprint. Remove any
          localhost passkey from Chrome Password Manager before re-registering. On Linux, Chrome
          often cannot drive the fingerprint reader for WebAuthn — password + OTP still works.
        </span>
      </div>
    </div>
  );
}

function PasskeysTab() {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const supported = browserSupportsPasskeys();
  const { setActions } = usePageActions();

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPasskeysRequest();
      setCredentials(data.credentials || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load passkeys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  useEffect(() => {
    setActions(
      <button
        type="button"
        className="btn-icon-outline"
        aria-label="Refresh passkeys"
        onClick={loadCredentials}
        disabled={loading}
      >
        <RefreshCw className={`icon-sm${loading ? ' passkeys-spin' : ''}`} aria-hidden="true" />
      </button>
    );
    return () => setActions(null);
  }, [setActions, loadCredentials, loading]);

  const handleRegister = async () => {
    if (!supported) {
      toast.error('This browser or device does not support fingerprint / passkey unlock.');
      return;
    }
    setRegistering(true);
    try {
      const options = await webauthnRegisterOptionsRequest();
      const attestation = await startRegistration({ optionsJSON: options });
      await webauthnRegisterVerifyRequest(attestation, deviceName.trim() || undefined);
      toast.success('Device unlock enabled for this account');
      setDeviceName('');
      await loadCredentials();
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        toast.error('Registration was cancelled or timed out');
      } else {
        toast.error(
          error.response?.data?.message || error?.message || 'Failed to register passkey'
        );
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleRemove = async (id) => {
    setRemovingId(id);
    try {
      await deletePasskeyRequest(id);
      toast.success('Passkey removed');
      setCredentials((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove passkey');
    } finally {
      setRemovingId(null);
    }
  };

  const count = credentials.length;

  return (
    <div className="space-y-6 min-h-[50vh]">
      {!supported && (
        <div className="passkeys-unsupported-banner">
          <Shield className="passkeys-unsupported-icon" aria-hidden="true" />
          <div>
            <p className="passkeys-unsupported-title">Passkeys not available</p>
            <p className="passkeys-unsupported-desc">
              This browser or device does not support biometric unlock. Try Chrome, Edge, Safari, or
              Firefox on a device with fingerprint or face unlock, over HTTPS (or localhost).
            </p>
          </div>
        </div>
      )}

      <div className="passkeys-top-grid">
        <div className="passkeys-add-card">
          <div className="passkeys-add-card-header">
            <span className="passkeys-add-card-badge">
              <Fingerprint className="icon-sm" aria-hidden="true" />
            </span>
            <div>
              <h3 className="passkeys-add-card-title">Add this device</h3>
              <p className="passkeys-add-card-desc">
                Name the device, then click below. Prefer this device&apos;s fingerprint when
                prompted — not Google Password Manager. If you already have a synced passkey, remove
                it first and register again.
              </p>
            </div>
          </div>

          <div className="passkeys-add-card-body">
            <AuthFormField
              id="passkey-device-name"
              label="Device name (optional)"
              type="text"
              icon={Smartphone}
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g. Work laptop · iPhone 16"
              maxLength={255}
              disabled={!supported || registering}
            />
            <LoadingButton
              type="button"
              className="btn-primary btn-sm passkeys-add-btn"
              loading={registering}
              loadingText="Waiting for device…"
              onClick={handleRegister}
              disabled={!supported}
            >
              <Plus className="icon-sm" aria-hidden="true" />
              Add this device
            </LoadingButton>
          </div>
        </div>

        <HowItWorksCard />
      </div>

      <div>
        <div className="section-header">
          <div className="section-header-left">
            <span className="section-header-icon">
              <ShieldCheck className="icon-sm" aria-hidden="true" />
            </span>
            <h2 className="section-header-title">
              Registered devices <span className="section-header-count">({count})</span>
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="passkeys-loading">
            <RefreshCw className="passkeys-loading-icon passkeys-spin" aria-hidden="true" />
            <span>Loading passkeys…</span>
          </div>
        ) : count === 0 ? (
          <div className="empty-state-card">
            <div className="empty-state-icon">
              <Fingerprint className="empty-state-icon-svg" aria-hidden="true" />
            </div>
            <h2 className="empty-state-title">No devices registered yet</h2>
            <p className="empty-state-description">
              Register a device above to enable fingerprint or face unlock on this account.
            </p>
          </div>
        ) : (
          <ul className="passkeys-device-list">
            {credentials.map((cred) => {
              const addedDate = formatDate(cred.createdAt);
              const usedDate = formatDate(cred.lastUsedAt);
              return (
                <li key={cred.id} className="passkeys-device-item">
                  <span className="passkeys-device-icon">
                    <Fingerprint className="icon-sm" aria-hidden="true" />
                  </span>
                  <div className="passkeys-device-info">
                    <p className="passkeys-device-name">{cred.deviceName}</p>
                    <p className="passkeys-device-meta">
                      {addedDate ? `Added ${addedDate}` : 'Registered'}
                      {usedDate ? ` · Last used ${usedDate}` : ' · Never used'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="passkeys-device-remove"
                    aria-label={`Remove ${cred.deviceName}`}
                    disabled={removingId === cred.id}
                    onClick={() => handleRemove(cred.id)}
                  >
                    <Trash2 className="icon-sm" aria-hidden="true" />
                    <span>Remove</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default PasskeysTab;
