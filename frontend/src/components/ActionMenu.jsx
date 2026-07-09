import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

/**
 * Reusable kebab action menu for table rows. Renders the menu through a portal
 * with fixed positioning so it is never clipped by scrollable table containers.
 *
 * items: [{ key, label, icon, onClick, danger, disabled, title }]
 */
function ActionMenu({ items = [], ariaLabel = 'Row actions' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  const positionMenu = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Default: open below the trigger, aligned to its right edge.
    let top = rect.bottom + 6;
    let right = window.innerWidth - rect.right;

    // If the menu would overflow the bottom of the viewport, open above.
    const estHeight = Math.max(items.length * 36, 80);
    if (top + estHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estHeight - 6);
    }
    // Keep the menu within the viewport horizontally.
    const estWidth = 180;
    if (right + estWidth > window.innerWidth - 8) {
      right = Math.max(8, window.innerWidth - estWidth - 8);
    }
    setPos({ top, right });
  }, [items.length]);

  useLayoutEffect(() => {
    if (open) positionMenu();
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    const onScroll = () => close();
    const onResize = () => positionMenu();
    const onPointerDown = (e) => {
      if (
        menuRef.current?.contains(e.target) ||
        btnRef.current?.contains(e.target)
      ) {
        return;
      }
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, close, positionMenu]);

  const handleItemClick = (item) => {
    if (item.disabled) return;
    close();
    if (typeof item.onClick === 'function') item.onClick();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="ama-row-btn ama-row-btn--menu"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical className="icon-sm" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="cm-action-menu cm-action-menu--fixed"
            role="menu"
            style={{ top: pos.top, right: pos.right, left: 'auto' }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={`cm-action-menu-item${item.danger ? ' cm-action-menu-item-danger' : ''}`}
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                title={item.title}
              >
                {item.icon ? <item.icon className="cm-action-menu-icon" /> : null}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

export default ActionMenu;
