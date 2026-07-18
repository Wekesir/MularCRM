import { useEffect, useMemo, useState } from 'react';
import { Mail, MessageSquare, X } from 'lucide-react';
import LoadingButton from './LoadingButton';
import { fetchEmailTemplates, fetchSmsTemplates } from '../api/templates';

function PortfolioSendModal({ open, onClose, mode = 'sms', debtor, isSaving, onSend }) {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const isSms = mode === 'sms';
  const Icon = isSms ? MessageSquare : Mail;
  const title = isSms ? 'Send SMS' : 'Send Email';
  const recipient = isSms ? debtor?.phone : debtor?.email;

  useEffect(() => {
    if (!open) return undefined;
    setTemplateId('');
    setMessage('');
    setSubject('');
    let cancelled = false;
    setLoadingTemplates(true);
    const load = isSms
      ? fetchSmsTemplates({ clientId: debtor?.clientId || null })
      : fetchEmailTemplates({ clientId: debtor?.clientId || null });
    load
      .then((rows) => {
        if (!cancelled) setTemplates(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isSms, debtor?.clientId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isSaving, onClose]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => String(t.id) === String(templateId)) || null,
    [templates, templateId]
  );

  useEffect(() => {
    if (!selectedTemplate) return;
    if (isSms) {
      setMessage(selectedTemplate.body || '');
    } else {
      setSubject(selectedTemplate.subject || '');
      setMessage(selectedTemplate.body || '');
    }
  }, [selectedTemplate, isSms]);

  if (!open || !debtor) return null;

  const canSend = Boolean(recipient) && (isSms ? Boolean(message.trim()) : Boolean(subject.trim() && message.trim()));

  const handleSend = () => {
    if (!canSend) return;
    if (isSms) {
      onSend({
        templateId: templateId || undefined,
        message: message.trim(),
      });
    } else {
      onSend({
        templateId: templateId || undefined,
        subject: subject.trim(),
        body: message.trim(),
      });
    }
  };

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div className="modal-panel modal-lg cf-panel" role="dialog" aria-modal="true" aria-labelledby="portfolio-send-title">
        <div className="cf-accent-strip" aria-hidden="true" />
        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <Icon className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="portfolio-send-title" className="cf-title">{title}</h2>
              <p className="cf-subtitle">
                To {debtor.name}
                {recipient ? ` · ${recipient}` : ' · no contact on file'}
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close" disabled={isSaving}>
            <X className="modal-close-icon" />
          </button>
        </div>

        <div className="cf-body space-y-4">
          {!recipient && (
            <p className="text-sm text-muted-foreground">
              This debtor has no {isSms ? 'phone number' : 'email address'} on file.
            </p>
          )}

          <div className="af-field">
            <span className="af-label">Template (optional)</span>
            <select
              className="af-select"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={loadingTemplates || isSaving}
            >
              <option value="">Compose manually</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {!isSms && (
            <div className="af-field">
              <span className="af-label">Subject</span>
              <input
                className="af-input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Payment reminder"
                disabled={isSaving}
              />
            </div>
          )}

          <div className="af-field">
            <span className="af-label">{isSms ? 'Message' : 'Body'}</span>
            <textarea
              className="af-input"
              rows={isSms ? 4 : 8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isSms ? 'Type your SMS…' : 'Type your email…'}
              disabled={isSaving}
            />
          </div>
        </div>

        <div className="cf-footer">
          <button type="button" className="btn-icon-outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <LoadingButton
            className="btn-primary btn-sm"
            loading={isSaving}
            loadingText="Sending…"
            disabled={!canSend}
            onClick={handleSend}
          >
            Send {isSms ? 'SMS' : 'Email'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default PortfolioSendModal;
