import { useMemo, useState } from 'react';
import { parseNavLines, validateNavItems } from '@/features/gilded-ui';
import { DEFAULT_NAV_LINES } from '../data/navLines';

/** Editable "emoji,label" lines → validated nav items (falls back to the defaults). */
export function useGoldUiLines() {
  const [navText, setNavText] = useState(DEFAULT_NAV_LINES);
  const navValidation = useMemo(() => validateNavItems(parseNavLines(navText)), [navText]);
  const navItems = useMemo(
    () => (navValidation.ok ? navValidation.items : parseNavLines(DEFAULT_NAV_LINES)),
    [navValidation],
  );
  return { navText, setNavText, navValidation, navItems };
}
