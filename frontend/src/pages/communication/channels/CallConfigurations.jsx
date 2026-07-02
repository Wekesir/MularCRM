import { PhoneCall, Save } from 'lucide-react';

function CallConfigurations() {
  return (
    <div className="cc-section">
      <div className="cc-section-header">
        <div className="cc-section-header-left">
          <span className="cc-section-icon"><PhoneCall className="cc-section-icon-svg" /></span>
          <div>
            <h2 className="cc-section-title">Call Configurations</h2>
            <p className="cc-section-subtitle">GOIP lines, retry rules and call-recording preferences.</p>
          </div>
        </div>
        <button type="button" className="btn-primary btn-sm">
          <Save className="icon-sm" />
          Save Changes
        </button>
      </div>

      <div className="cc-config-grid">
        <div className="cc-config-card">
          <h3 className="cc-config-card-title">GOIP Lines</h3>
          <label className="cc-config-label">
            Active lines
            <input type="text" defaultValue="Line 01 — 0712000000, Line 02 — 0712000001" readOnly />
          </label>
          <label className="cc-config-label">
            Simultaneous calls per line
            <input type="number" defaultValue={3} min={1} max={10} />
          </label>
        </div>

        <div className="cc-config-card">
          <h3 className="cc-config-card-title">Retry Rules</h3>
          <label className="cc-config-label">
            Max attempts per debtor
            <input type="number" defaultValue={5} min={1} max={20} />
          </label>
          <label className="cc-config-label">
            Cooldown between attempts (hours)
            <input type="number" defaultValue={4} min={1} max={72} />
          </label>
        </div>

        <div className="cc-config-card">
          <h3 className="cc-config-card-title">Recording</h3>
          <label className="cc-checkbox-label">
            <input type="checkbox" defaultChecked />
            Record outbound calls
          </label>
          <label className="cc-checkbox-label">
            <input type="checkbox" defaultChecked />
            Play compliance disclaimer on connect
          </label>
        </div>
      </div>
    </div>
  );
}

export default CallConfigurations;
