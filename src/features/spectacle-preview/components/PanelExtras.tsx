import { useState } from 'react';
import { Gem, Shuffle } from 'lucide-react';
import { GildedNavBar, resolveActiveId } from '@/features/gilded-ui';
import type { SpectaclePreview } from '../hooks/useSpectaclePreview';
import { Section, SliderRow } from './PanelBits';

/** Live gilded nav bar built from editable emoji,label lines. */
export function GoldUiSection({ preview }: { preview: SpectaclePreview }) {
  const [activeId, setActiveId] = useState('');
  const items = preview.navItems;
  const resolvedActive = resolveActiveId(items, activeId);
  return (
    <Section title="GOLD UI KIT">
      <textarea
        value={preview.navText}
        onChange={(e) => preview.setNavText(e.target.value)}
        rows={5}
        spellCheck={false}
        data-testid="spectacle-preview__nav-lines"
        className="w-full resize-none border border-[#8a6a2f]/40 bg-[#171006] px-2 py-1.5 font-mono text-[11px] leading-5 text-[#e9c877] outline-none focus:border-[#d9b264]"
        aria-label="Nav items, one emoji,label per line"
      />
      {!preview.navValidation.ok && (
        <ul className="space-y-0.5 text-[10px] text-[#d98a6a]" data-testid="spectacle-preview__nav-issues">
          {preview.navValidation.issues.map((issue) => (
            <li key={issue}>· {issue}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5 text-[10px] tracking-widest text-[#9a7c48]">
        <Gem size={11} aria-hidden /> LIVE PREVIEW — SAME KIT AS THE BOTTOM BAR
      </div>
      <div className="overflow-x-auto pb-1">
        <GildedNavBar items={items} activeId={resolvedActive} onSelect={setActiveId} ariaLabel="Gold UI sample" />
      </div>
    </Section>
  );
}

/** Deco Lattice controls — the title medallion regenerates live. */
export function LatticeSection({ preview }: { preview: SpectaclePreview }) {
  return (
    <Section title="DECO LATTICE">
      <SliderRow label="Density" value={preview.latticeDensity} min={0} max={1} step={0.05} onChange={preview.setLatticeDensity} testId="spectacle-preview__lattice-density" />
      <label className="flex items-center justify-between gap-2 text-[11px] tracking-wider text-[#c8a86a]">
        <span className="w-20 shrink-0">Layers</span>
        <select
          value={preview.latticeLevel}
          onChange={(e) => preview.setLatticeLevel(Number(e.target.value))}
          data-testid="spectacle-preview__lattice-level"
          className="w-full border border-[#8a6a2f]/40 bg-[#171006] px-2 py-1 text-[#e9c877] outline-none"
        >
          {[1, 2, 3, 4].map((l) => (
            <option key={l} value={l}>L1–L{l}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={preview.rerollLattice}
        data-testid="spectacle-preview__lattice-reroll"
        className="flex items-center gap-2 border border-[#8a6a2f]/50 px-2.5 py-1.5 text-[11px] tracking-wider text-[#d8b878] transition hover:bg-[#8a6a2f]/20"
      >
        <Shuffle size={12} aria-hidden /> Reroll pattern · seed {preview.latticeSeed}
      </button>
      <p className="text-[10px] leading-4 text-[#9a7c48]">
        Octilinear bundles on a 45° lattice, D4 symmetry, octagram centre, reed rows — the film's line style, from rules and a seed.
      </p>
    </Section>
  );
}