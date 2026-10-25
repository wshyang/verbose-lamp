import type { FormEvent } from 'react';
import { RotateCcw, Wand2 } from 'lucide-react';
import type { HeroTitleConfig } from '@/features/premiere/model/types';
import { Button } from '@/shared/ui';
import { TitleField } from './TitleField';

interface TitleFormProps {
  draft: HeroTitleConfig;
  onText: (field: 'keystone' | 'preTitle' | 'mainTitle' | 'subCredit', value: string) => void;
  onPinstripe: (enabled: boolean) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent) => void;
}

function FormActions({ onReset }: Pick<TitleFormProps, 'onReset'>) {
  return (
    <div className="flex items-center justify-between pt-4 border-t border-[#d4af37]/25">
      <Button
        type="button"
        onClick={onReset}
        variant="quiet"
        size="compact"
        className="py-2 text-xs tracking-[0.16em]"
        data-testid="title-customizer__reset"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Reset</span>
      </Button>

      <Button
        type="submit"
        variant="accent"
        size="control"
        className="gap-2 px-5 font-semibold"
        data-testid="title-customizer__apply"
      >
        <Wand2 className="w-3.5 h-3.5" />
        <span>Render in WebGL</span>
      </Button>
    </div>
  );
}

export function TitleForm({ draft, onText, onPinstripe, onReset, onSubmit }: TitleFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <TitleField
          id="title-keystone" label="Upper Keystone" value={draft.keystone} maxLength={8} placeholder="THE"
          testId="title-customizer__keystone"
          inputClassName="border-[#d4af37]/35 px-3 py-2 text-xs tracking-[0.2em] text-[#fff4d4]"
          onChange={(value) => onText('keystone', value)}
        />
        <TitleField
          id="title-pre-title" label="Upper Frieze Line" value={draft.preTitle} maxLength={18} placeholder="GREAT"
          testId="title-customizer__pre-title" wrapperClassName="col-span-2"
          inputClassName="border-[#d4af37]/35 px-3 py-2 text-xs tracking-[0.25em] text-[#fff4d4]"
          onChange={(value) => onText('preTitle', value)}
        />
      </div>

      <TitleField
        id="title-main" label="Monumental Center Title (Auto-Sizes Golden Frame)" value={draft.mainTitle}
        maxLength={16} placeholder="GATSBY" testId="title-customizer__main-title"
        inputClassName="border-[#d4af37]/45 px-3.5 py-2.5 text-base font-deco tracking-[0.22em] text-[#fff6dc]"
        onChange={(value) => onText('mainTitle', value)}
      />

      <TitleField
        id="title-credit" label="Lower Pediment Credit" value={draft.subCredit} maxLength={46}
        placeholder="FROM THE NOVEL BY F. SCOTT FITZGERALD" testId="title-customizer__credit"
        inputClassName="border-[#d4af37]/35 px-3 py-2 text-xs tracking-[0.16em] text-[#fff4d4]"
        onChange={(value) => onText('subCredit', value)}
      />

      <label className="flex items-center gap-3 pt-1 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={draft.pinstripeAlternation}
          onChange={(event) => onPinstripe(event.target.checked)}
          className="accent-[#d4af37] w-4 h-4"
          data-testid="title-customizer__pinstripe"
        />
        <span className="text-xs text-[#e6d6b5]">
          Enable Like Minded Studio Alternating 4-Line Deco Pinstripe Glyphs
        </span>
      </label>

      <FormActions onReset={onReset} />
    </form>
  );
}
