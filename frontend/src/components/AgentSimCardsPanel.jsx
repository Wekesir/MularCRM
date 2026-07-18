import { useCallback, useEffect, useState } from 'react';
import { Loader2, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import LoadingButton from './LoadingButton';
import {
  createAgentSimCard,
  deleteAgentSimCard,
  fetchAgentSimCards,
  updateAgentSimCard,
} from '../api/agentPortfolio';

const emptyForm = {
  label: '',
  phoneNumber: '',
  supportsOutbound: true,
  supportsInbound: true,
  isDefault: false,
};

function AgentSimCardsPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAgentSimCards();
      setItems(rows);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load SIM cards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createAgentSimCard(form);
      toast.success('SIM card added');
      setForm(emptyForm);
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to add SIM card');
    } finally {
      setSaving(false);
    }
  };

  const toggleDefault = async (sim) => {
    try {
      await updateAgentSimCard(sim.id, { isDefault: true });
      toast.success('Default SIM updated');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update SIM');
    }
  };

  const toggleActive = async (sim) => {
    try {
      await updateAgentSimCard(sim.id, { isActive: !sim.isActive });
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update SIM');
    }
  };

  const handleDelete = async (sim) => {
    if (!window.confirm(`Remove SIM ${sim.phoneNumber}?`)) return;
    try {
      await deleteAgentSimCard(sim.id);
      toast.success('SIM removed');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to remove SIM');
    }
  };

  return (
    <div className="sim-panel">
      <div className="sim-panel-header">
        <div>
          <h2 className="sim-panel-title">SIM cards</h2>
          <p className="sim-panel-desc">
            Register the phone numbers you use for Africa&apos;s Talking inbound and outbound calls.
          </p>
        </div>
      </div>

      <form className="sim-form" onSubmit={handleCreate}>
        <div className="sim-form-grid">
          <label className="cf-field">
            <span className="cf-label">Label</span>
            <input
              className="cf-input"
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              placeholder="e.g. Desk Safaricom"
            />
          </label>
          <label className="cf-field">
            <span className="cf-label">
              Phone number <span className="cf-required">*</span>
            </span>
            <input
              className="cf-input"
              value={form.phoneNumber}
              onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))}
              placeholder="254710595755"
              required
            />
          </label>
        </div>
        <div className="sim-form-checks">
          <label className="sim-check">
            <input
              type="checkbox"
              checked={form.supportsOutbound}
              onChange={(e) => setForm((p) => ({ ...p, supportsOutbound: e.target.checked }))}
            />
            Outbound
          </label>
          <label className="sim-check">
            <input
              type="checkbox"
              checked={form.supportsInbound}
              onChange={(e) => setForm((p) => ({ ...p, supportsInbound: e.target.checked }))}
            />
            Inbound
          </label>
          <label className="sim-check">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
            />
            Default
          </label>
        </div>
        <LoadingButton
          type="submit"
          className="btn-primary btn-sm"
          loading={saving}
          loadingText="Adding…"
        >
          <Plus className="icon-sm" />
          Add SIM
        </LoadingButton>
      </form>

      {loading ? (
        <div className="sim-empty">
          <Loader2 className="icon-md animate-spin" />
          <p>Loading SIM cards…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="sim-empty">
          <Phone className="icon-md" />
          <p className="sim-empty-title">No SIM cards yet</p>
          <p className="sim-empty-desc">Add the mobile numbers you will use to call debtors.</p>
        </div>
      ) : (
        <ul className="sim-list">
          {items.map((sim) => (
            <li key={sim.id} className={`sim-row${!sim.isActive ? ' is-inactive' : ''}`}>
              <div className="sim-row-main">
                <span className="sim-row-icon" aria-hidden="true">
                  <Phone className="icon-sm" />
                </span>
                <div>
                  <p className="sim-row-label">
                    {sim.label}
                    {sim.isDefault && (
                      <span className="sim-default-badge">
                        <Star className="icon-sm" /> Default
                      </span>
                    )}
                  </p>
                  <p className="sim-row-phone">{sim.phoneNumber}</p>
                  <p className="sim-row-flags">
                    {[
                      sim.supportsOutbound ? 'Outbound' : null,
                      sim.supportsInbound ? 'Inbound' : null,
                      sim.isActive ? 'Active' : 'Inactive',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
              <div className="sim-row-actions">
                {!sim.isDefault && sim.isActive && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => toggleDefault(sim)}>
                    Make default
                  </button>
                )}
                <button type="button" className="btn-secondary btn-sm" onClick={() => toggleActive(sim)}>
                  {sim.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  className="btn-icon-outline"
                  aria-label="Remove SIM"
                  onClick={() => handleDelete(sim)}
                >
                  <Trash2 className="icon-sm" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AgentSimCardsPanel;
