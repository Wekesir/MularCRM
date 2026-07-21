import { useCallback, useEffect, useRef, useState } from 'react';
import { TimerReset } from 'lucide-react';
import LoadingButton from './LoadingButton';
import { useUser } from '../context/UserContext';

const IDLE_MS = 10 * 60 * 1000;
const COUNTDOWN_SEC = 10;
const ACTIVITY_DEBOUNCE_MS = 1000;

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
];

function IdleSessionGuard() {
  const { logout } = useUser();
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SEC);
  const [staying, setStaying] = useState(false);

  const idleTimerRef = useRef(null);
  const activityDebounceRef = useRef(null);
  const warningOpenRef = useRef(false);
  const loggingOutRef = useRef(false);

  warningOpenRef.current = warningOpen;

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      setSecondsLeft(COUNTDOWN_SEC);
      setWarningOpen(true);
    }, IDLE_MS);
  }, [clearIdleTimer]);

  const staySignedIn = useCallback(() => {
    setStaying(true);
    setWarningOpen(false);
    setSecondsLeft(COUNTDOWN_SEC);
    loggingOutRef.current = false;
    armIdleTimer();
    setStaying(false);
  }, [armIdleTimer]);

  // Activity listeners — pause while the warning modal is open.
  useEffect(() => {
    const onActivity = () => {
      if (warningOpenRef.current) return;
      if (activityDebounceRef.current != null) return;
      activityDebounceRef.current = window.setTimeout(() => {
        activityDebounceRef.current = null;
      }, ACTIVITY_DEBOUNCE_MS);
      armIdleTimer();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !warningOpenRef.current) {
        onActivity();
      }
    };

    armIdleTimer();
    for (const eventName of ACTIVITY_EVENTS) {
      document.addEventListener(eventName, onActivity, { passive: true, capture: true });
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearIdleTimer();
      if (activityDebounceRef.current != null) {
        window.clearTimeout(activityDebounceRef.current);
      }
      for (const eventName of ACTIVITY_EVENTS) {
        document.removeEventListener(eventName, onActivity, { capture: true });
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [armIdleTimer, clearIdleTimer]);

  // Countdown while warning is open.
  useEffect(() => {
    if (!warningOpen) return undefined;

    if (secondsLeft <= 0) {
      if (loggingOutRef.current) return undefined;
      loggingOutRef.current = true;
      void logout({ preservePath: true });
      return undefined;
    }

    const id = window.setTimeout(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => window.clearTimeout(id);
  }, [warningOpen, secondsLeft, logout]);

  // Escape / backdrop → stay signed in.
  useEffect(() => {
    if (!warningOpen) return undefined;

    const onKey = (event) => {
      if (event.key === 'Escape') staySignedIn();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [warningOpen, staySignedIn]);

  if (!warningOpen) return null;

  const displayDigit = secondsLeft > 0 ? secondsLeft : 1;

  return (
    <div className="modal-backdrop modal-backdrop-static idle-session-backdrop" role="presentation">
      <div
        className="modal-panel confirm-panel idle-session-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-session-title"
        aria-describedby="idle-session-desc"
      >
        <div className="cf-accent-strip cf-accent-strip-danger" aria-hidden="true" />

        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon cf-header-icon-danger" aria-hidden="true">
              <TimerReset className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="idle-session-title" className="cf-title">
                Still there?
              </h2>
              <p id="idle-session-desc" className="cf-subtitle">
                Your session is about to end due to inactivity. Stay signed in to continue
                where you left off.
              </p>
            </div>
          </div>
        </div>

        <div className="cf-body idle-session-body">
          <div className="idle-countdown" aria-live="assertive" aria-atomic="true">
            <span key={displayDigit} className="idle-countdown-digit">
              {displayDigit}
            </span>
            <p className="idle-countdown-label">
              Logging out in {displayDigit} second{displayDigit === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="cf-footer">
          <LoadingButton
            type="button"
            className="btn-primary"
            loading={staying}
            loadingText="Resuming…"
            onClick={staySignedIn}
          >
            Stay signed in
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default IdleSessionGuard;
