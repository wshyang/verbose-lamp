import { useEffect, useRef, useState } from 'react';

/**
 * ADR-258 — the kebab: a list row's actions behind one ⋮ button.
 *
 * Overflow (⋮), not a hamburger (☰): a hamburger promises navigation for the
 * whole screen, and this promises the few things that can be done to *this*
 * row — make captain, remove, hide. Where it sits is the call site's call
 * (ADR-259); the menu itself only has to be one quiet, learnable affordance.
 *
 * View state only, and it lives here: which menu is open is a fact about the
 * screen, not about the team, so no hook is involved. Choosing an item closes
 * the menu before it runs, so a confirmation the item asks for never opens
 * over an open menu. Nothing renders when there are no options — a row
 * nobody may act on has no button to wonder about.
 */

export interface KebabOption {
  label: string;
  testId: string;
  danger?: boolean;
  onSelect: () => void;
}

export function KebabMenu(props: {
  label: string;
  testId: string;
  options: KebabOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  if (props.options.length === 0) return null;

  const choose = (option: KebabOption) => {
    setIsOpen(false);
    option.onSelect();
  };

  return (
    <span className="gb-kebab" ref={rootRef}>
      <button
        type="button"
        className="gb-kebab__toggle"
        data-testid={props.testId}
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {isOpen ? (
        <span className="gb-kebab__menu" role="menu">
          {props.options.map((option) => (
            <button
              key={option.testId}
              type="button"
              role="menuitem"
              className={
                option.danger === true ? 'gb-kebab__item gb-kebab__item--danger' : 'gb-kebab__item'
              }
              data-testid={option.testId}
              onClick={() => choose(option)}
            >
              {option.label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
