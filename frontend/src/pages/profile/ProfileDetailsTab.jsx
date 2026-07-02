import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
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
    </div>
  );
}

export default ProfileDetailsTab;
