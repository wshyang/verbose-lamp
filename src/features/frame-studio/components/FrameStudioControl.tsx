import React from 'react';
import { ScreenBorderPanel } from './ScreenBorderPanel';
import { StudioHeader } from './StudioHeader';
import { SurfaceSwitch } from './SurfaceSwitch';
import { TitleCardsPanel } from './TitleCardsPanel';
import type { FrameStudioControlProps } from './studioProps';

export type { FrameStudioControlProps } from './studioProps';

export const FrameStudioControl: React.FC<FrameStudioControlProps> = (props) => {
  if (!props.isOpen) return null;

  return (
    <section
      className="absolute right-3 sm:right-9 top-28 z-[70] w-[min(19rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-8.5rem)] overflow-y-auto deco-scroll flex flex-col gap-3 px-3.5 py-3 bg-[#09070d]/93 border border-[#d4af37]/45 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.62)]"
      data-testid="frame-studio__panel"
      aria-label="Frame Studio"
    >
      <StudioHeader onReset={props.onReset} onDismiss={props.onDismiss} />
      <SurfaceSwitch surface={props.surface} onSurfaceChange={props.onSurfaceChange} />
      {props.surface === 'title-cards' ? <TitleCardsPanel {...props} /> : <ScreenBorderPanel {...props} />}
    </section>
  );
};
