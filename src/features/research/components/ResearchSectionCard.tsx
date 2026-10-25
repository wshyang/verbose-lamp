import type { ResearchSection } from '../model/types';

export function ResearchSectionCard({ section }: { section: ResearchSection }) {
  return (
    <div className="border border-[#d4af37]/25 bg-[#0c0910]/90 p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2 border-b border-[#d4af37]/20 pb-2">
        <span className="text-xs font-deco tracking-[0.28em] text-[#f8e29b]">SECTION {section.numeral}</span>
        <span className="text-[10px] tracking-[0.16em] uppercase text-[#d4af37]/75 text-right">{section.subtitle}</span>
      </div>
      <h3 className="text-base font-deco tracking-[0.1em] text-[#fff4d4]">{section.title}</h3>
      <p className="text-[11px] uppercase tracking-[0.14em] text-[#d4af37]/90">{section.credits}</p>
      <p className="text-sm font-editorial text-[#eadbc0]/90 leading-relaxed">{section.summary}</p>
      <ul className="space-y-1.5 pt-1">
        {section.bulletPoints.map((point, index) => (
          <li
            key={index}
            className="text-xs font-editorial text-[#d9c7a3]/85 flex items-start gap-2 leading-relaxed"
          >
            <span className="mt-1.5 w-1.5 h-1.5 rotate-45 bg-[#d4af37] shrink-0" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
