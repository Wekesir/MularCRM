import { useCallback, useEffect, useRef, useState } from 'react';
import { Target, X } from 'lucide-react';
import LoadingButton from './LoadingButton';
import { fetchAgentKpis } from '../api/agents';

const METRICS = [
  { key: 'calls', label: 'Calls', kind: 'count', hint: 'Calls made' },
  { key: 'collection', label: 'Collection', kind: 'money', hint: 'Amount collected' },
  { key: 'sms', label: 'SMS', kind: 'count', hint: 'SMS sent' },
  { key: 'emails', label: 'Emails', kind: 'count', hint: 'Emails sent' },
  { key: 'ptpVolume', label: 'PTP Volume', kind: 'count', hint: 'Successful-contact PTPs' },
];

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

function emptyForm() {
  const form = { effectiveFrom: '', notes: '' };
  for (const m of METRICS) {
    form[m.key] = { daily: '', weekly: '', monthly: '' };
  }
  return form;
}

function kpisToForm(kpis) {
  const form = emptyForm();
  if (!kpis) return form;
  for (const m of METRICS) {
    form[m.key] = {
      daily: String(kpis[m.key]?.daily ?? ''),
      weekly: String(kpis[m.key]?.weekly ?? ''),
      monthly: String(kpis[m.key]?.monthly ?? ''),
    };
  }
  form.effectiveFrom = kpis.effectiveFrom || '';
  form.notes = kpis.notes || '';
  return form;
}

function AgentKpiModal({ open, agent, onClose, onSave, isSaving, currencySymbol }) {
  const [form, setForm] = useState(emptyForm());
  const [isLoading, setIsLoading] = useState(false);
  const firstInputRef = useRef(null);

  const loadKpis = useCallback(async () => {
    if (!agent) return;
    setIsLoading(true);
    try {
      const kpis = await fetchAgentKpis(agent.id);
      setForm(kpisToForm(kpis));
    } catch {
      setForm(emptyForm());
    } finally {
      setIsLoading(false);
    }
  }, [agent]);

  useEffect(() => {
    if (!open) return;
    loadKpis();
    const t = window.setTimeout(() => firstInputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open, loadKpis]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  if (!open) return null;

  const setMetric = (key, period, value) => {
    setForm((p) => ({ ...p, [key]: { ...p[key], [period]: value } }));
  };

  const handleSave = () => {
    const payload = { effectiveFrom: form.effectiveFrom || null, notes: form.notes.trim() || null };
    for (const m of METRICS) {
      payload[m.key] = {
        daily: Number(form[m.key].daily) || 0,
        weekly: Number(form[m.key].weekly) || 0,
        monthly: Number(form[m.key].monthly) || 0,
      };
    }
    onSave(payload);
  };

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel akpi-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-kpi-modal-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <Target className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="agent-kpi-modal-title" className="cf-title">Agent KPIs</h2>
              <p className="cf-subtitle">
                {agent ? `Set performance targets for ${agent.name}` : 'Set performance targets'}
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={isSaving}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body">
          {isLoading ? (
            <p className="akpi-loading">Loading current KPIs…</p>
          ) : (
            <>
              <div className="akpi-grid-wrap">
                <table className="akpi-grid">
                  <thead>
                    <tr>
                      <th className="akpi-grid-metric">Metric</th>
                      {PERIODS.map((p) => (
                        <th key={p.key} className="akpi-grid-period">{p.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map((m) => (
                      <tr key={m.key}>
                        <td className="akpi-grid-metric-cell">
                          <span className="akpi-metric-label">{m.label}</span>
                          <span className="akpi-metric-hint">{m.hint}</span>
                        </td>
                        {PERIODS.map((p, idx) => (
                          <td key={p.key} className="akpi-grid-input-cell">
                            <div className="akpi-input-wrap">
                              {m.kind === 'money' && (
                                <span className="akpi-input-prefix">{currencySymbol}</span>
                              )}
                              <input
                                ref={idx === 0 && m.key === 'calls' ? firstInputRef : undefined}
                                type="number"
                                min="0"
                                step={m.kind === 'money' ? '0.01' : '1'}
                                className="akpi-input"
                                value={form[m.key][p.key]}
                                onChange={(e) => setMetric(m.key, p.key, e.target.value)}
                                placeholder="0"
                                inputMode="decimal"
                              />
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="cf-row">
                <div className="cf-field cf-field-half">
                  <span className="cf-label">Effective From</span>
                  <input
                    type="date"
                    className="cf-input"
                    value={form.effectiveFrom}
                    onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
                  />
                </div>
                <div className="cf-field cf-field-half">
                  <span className="cf-label">Notes</span>
                  <input
                    type="text"
                    className="cf-input"
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Optional context (e.g. review cycle)"
                    maxLength={255}
                  />
                </div>
              </div>

              <div className="cf-callout">
                <div className="cf-callout-icon" aria-hidden="true">
                  <Target className="cf-callout-icon-svg" />
                </div>
                <p className="cf-callout-text">
                  These are supervisor-set targets. Actuals are tracked from daily uploads, calls, SMS
                  and email activity. Leave a field as 0 or blank to skip that target.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="cf-footer">
          <button type="button" className="cf-btn-cancel" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <LoadingButton
            className="cf-btn-save"
            onClick={handleSave}
            loading={isSaving}
            loadingText="Saving…"
            disabled={isLoading}
          >
            Save KPIs
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default AgentKpiModal;
