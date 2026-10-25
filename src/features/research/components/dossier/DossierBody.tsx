import React from 'react';
import { GATSBY_RESEARCH_SECTIONS } from '../../data/researchSections';
import { ChamferPlate } from './ChamferPlate';
import { FigureCard } from './FigureCard';
import { PinstripePlate } from './PinstripePlate';
import { PortalPlate } from './PortalPlate';
import { ResearchSectionCard } from './ResearchSectionCard';

/** The scrollable dossier: three engraved plates, then one card per section. */
export const DossierBody: React.FC = () => (
  <div className="overflow-y-auto deco-scroll px-6 sm:px-8 py-6 space-y-7">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <FigureCard caption="Fig. I · Deco Pinstripe System" body="Like Minded Studio paired 4-stripe concentric inline glyphs with solid chiseled platinum glyphs on alternating letters.">
        <PinstripePlate />
      </FigureCard>
      <FigureCard caption="Fig. II · 3D Bevelled Gold Rail" body="Deva & Method Studios modeled every golden frame line as a 3D chamfered rail so raking spotlights glint off angled facets.">
        <ChamferPlate />
      </FigureCard>
      <FigureCard caption="Fig. III · Z-Axis Portal Sweep" body="Built natively for 3D cinema: multi-plane golden frames draw outward, hold during push-in, then part open as the lens flies through.">
        <PortalPlate />
      </FigureCard>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {GATSBY_RESEARCH_SECTIONS.map((section) => (
        <ResearchSectionCard key={section.id} section={section} />
      ))}
    </div>
  </div>
);
