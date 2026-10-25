import type { FrameStudioControlProps } from './studioProps';
import { DesignSection } from './DesignSection';
import { FoundationSection } from './FoundationSection';
import { LayersSection } from './LayersSection';
import { BaseLevelSlider, DetailSlider } from './LevelDetailSection';
import { ProportionsSection } from './ProportionsSection';

export function TitleCardsPanel(props: FrameStudioControlProps) {
  return (
    <>
      <FoundationSection {...props} />
      {props.isDesignPattern && <DesignSection {...props} />}
      <LayersSection {...props} />
      <BaseLevelSlider {...props} />
      <DetailSlider {...props} />
      {props.isDesignPattern && <ProportionsSection {...props} />}
    </>
  );
}
