import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import LoadingButton from '../../components/LoadingButton';
import { useAppDispatch } from '../../store/hooks';
import { setBranding } from '../../store/slices/systemConfigSlice';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { normalizeHex } from '../../utils/theme';

function BusinessConfig() {
  const dispatch = useAppDispatch();
  const { config, loadConfig, updateConfig } = useSystemConfig();
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [initialLogo, setInitialLogo] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const logoInputRef = useRef(null);

  useEffect(() => {
    loadConfig()
      .then((data) => {
        setForm(data);
        setInitialLogo(data.business?.logo || '');
      })
      .catch(() => toast.error('Failed to load configuration'));
  }, [loadConfig]);

  const currentLogo = form.business?.logo || '';
  const hasPendingLogoChange = currentLogo !== initialLogo;

  const updateField = (section, field, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const handleThemeColorChange = (value) => {
    const normalized = normalizeHex(value);
    if (!normalized) return;

    updateField('theme', 'color', normalized);
    dispatch(setBranding({ theme: { color: normalized } }));
  };

  const handleLogoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateField('business', 'logo', reader.result);
      setSelectedFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoRemove = () => {
    const nextLogo = hasPendingLogoChange ? initialLogo : '';
    updateField('business', 'logo', nextLogo);
    setSelectedFileName('');
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const handleChooseLogo = () => {
    logoInputRef.current?.click();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await updateConfig({
        business: form.business,
        theme: form.theme,
      });
      setForm(saved);
      setInitialLogo(saved.business?.logo || '');
      setSelectedFileName('');
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
      toast.success('Business configuration saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="config-panel">
      <div className="config-panel-header">
        <h2>Business Configs</h2>
      </div>

      <div className="config-form">
        <label>
          Business Name
          <input
            type="text"
            value={form.business?.name || ''}
            onChange={(e) => updateField('business', 'name', e.target.value)}
            placeholder="Your company name"
          />
        </label>
        <label>
          Address
          <textarea
            value={form.business?.address || ''}
            onChange={(e) => updateField('business', 'address', e.target.value)}
            placeholder="Street, city, country"
            rows={3}
          />
        </label>
        <label>
          Phone
          <input
            type="tel"
            value={form.business?.phone || ''}
            onChange={(e) => updateField('business', 'phone', e.target.value)}
            placeholder="254710595755"
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.business?.email || ''}
            onChange={(e) => updateField('business', 'email', e.target.value)}
            placeholder="kenwekesir@gmail.com"
          />
        </label>
        <label className="logo-upload-label">
          Logo
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
            className="logo-upload-input"
          />

          {currentLogo ? (
            <div className="logo-upload-preview">
              <div className="logo-upload-preview-frame">
                <img src={currentLogo} alt="Selected logo preview" className="logo-upload-image" />
              </div>
              {selectedFileName && (
                <p className="logo-upload-filename">{selectedFileName}</p>
              )}
              {hasPendingLogoChange && (
                <p className="logo-upload-hint">Preview only — save to upload this logo</p>
              )}
              <div className="logo-upload-actions">
                <button type="button" className="btn-secondary btn-inline" onClick={handleChooseLogo}>
                  Change image
                </button>
                <button type="button" className="btn-danger-sm" onClick={handleLogoRemove}>
                  {hasPendingLogoChange ? 'Remove selection' : 'Remove logo'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn-secondary logo-upload-choose" onClick={handleChooseLogo}>
              Choose image
            </button>
          )}
        </label>

        <hr className="config-divider" />

        <label>
          Theme Color
          <div className="color-picker-row">
            <input
              type="color"
              value={form.theme?.color || '#3b82f6'}
              onChange={(e) => handleThemeColorChange(e.target.value)}
            />
            <input
              type="text"
              value={form.theme?.color || '#3b82f6'}
              onChange={(e) => handleThemeColorChange(e.target.value)}
              placeholder="#3b82f6"
            />
          </div>
        </label>

        <div className="config-form-actions">
          <LoadingButton
            className="btn-primary"
            onClick={handleSave}
            loading={saving}
            loadingText="Saving..."
          >
            Save Changes
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default BusinessConfig;
