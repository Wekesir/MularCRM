import { useEffect, useState } from 'react';

function TypewriterText({
  phrases,
  typingMs = 88,
  deletingMs = 48,
  pauseMs = 4200,
  className = '',
  ariaLabel,
}) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const current = phrases[phraseIndex] ?? '';
    const isComplete = !isDeleting && text === current;
    const isEmpty = isDeleting && text === '';

    let timeout = typingMs;

    if (isComplete) {
      timeout = pauseMs;
    } else if (isEmpty) {
      timeout = 420;
    } else if (isDeleting) {
      timeout = deletingMs;
    }

    const timer = window.setTimeout(() => {
      if (isComplete) {
        setIsDeleting(true);
        return;
      }

      if (isEmpty) {
        setIsDeleting(false);
        setPhraseIndex((prev) => (prev + 1) % phrases.length);
        return;
      }

      const nextLength = isDeleting ? text.length - 1 : text.length + 1;
      setText(current.slice(0, nextLength));
    }, timeout);

    return () => window.clearTimeout(timer);
  }, [text, isDeleting, phraseIndex, phrases, typingMs, deletingMs, pauseMs]);

  return (
    <span className={className} aria-label={ariaLabel || phrases.join(', ')}>
      <span className="typewriter-text">{text}</span>
      <span className="typewriter-cursor" aria-hidden="true" />
    </span>
  );
}

export default TypewriterText;
