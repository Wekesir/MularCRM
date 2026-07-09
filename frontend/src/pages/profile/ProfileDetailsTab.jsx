import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Fingerprint, KeyRound } from 'lucide-react';
import LoadingButton from '../../components/LoadingButton';
import { useUser } from '../../context/UserContext';

function ProfileDetailsTab() {
  const { user, updateProfile } = useUser();
  const [form, setForm] = useState({ name: user.name, email: user.email });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({ name: user.name, email: user.email });
  }, [user.name, user.email]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      updateProfile(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="config-panel">
      <div className="config-panel-header">
        <h2>Profile Details</h2>
      </div>

      <form className="config-form" onSubmit={handleSubmit}>
        <label>
          Name
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="kenwekesir@gmail.com"
            required
          />
        </label>

        <div className="config-form-actions">
          <LoadingButton
            type="submit"
            className="btn-primary"
            loading={saving}
            loadingText="Saving..."
          >
            Save Changes
          </LoadingButton>
        </div>
      </form>

      <div className="profile-security-links">
        <h3 className="profile-security-links-title">Account security</h3>
        <div className="profile-security-links-grid">
          <Link to="/profile/passkeys" className="profile-security-link-card">
            <span className="profile-security-link-icon">
              <Fingerprint className="icon-sm" aria-hidden="true" />
            </span>
            <span>
              <span className="profile-security-link-label">Device Unlock</span>
              <span className="profile-security-link-desc">
                Set up fingerprint, Face ID, or Windows Hello for faster sign-in
              </span>
            </span>
          </Link>
          <Link to="/profile/password" className="profile-security-link-card">
            <span className="profile-security-link-icon">
              <KeyRound className="icon-sm" aria-hidden="true" />
            </span>
            <span>
              <span className="profile-security-link-label">Change Password</span>
              <span className="profile-security-link-desc">Update the password for this account</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ProfileDetailsTab;
