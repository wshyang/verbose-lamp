import React from 'react';
import type { HeroTitleConfig } from '@/features/premiere/model/types';
import type { TitleTextKey } from '../../hooks/useTitleDraft';
import { ModalFooter } from './ModalFooter';
import { PinstripeToggle } from './PinstripeToggle';
import { TitleField } from './TitleField';

interface TitleFormProps {
  draft: HeroTitleConfig;
  onText: (key: TitleTextKey, value: string) => void;
  onPinstripe: (enabled: boolean) => void;
  onReset: () => void;
  onSubmit: (event: React.FormEvent) => void;
}

/** The three lines above and below "GATSBY", in the order the frame stacks them. */
const FIELDS = [
  { key: 'mainTitle', id: 'title-main', label: 'Monumental Center Title (Auto-Sizes Golden Frame)', maxLength: 16, placeholder: 'GATSBY', testId: 'title-customizer__main-title', tracking: '0.22em', variant: 'monumental' },
  { key: 'subCredit', id: 'title-credit', label: 'Lower Pediment Credit', maxLength: 46, placeholder: 'FROM THE NOVEL BY F. SCOTT FITZGERALD', testId: 'title-customizer__credit', tracking: '0.16em', variant: 'standard' },
] as const;

/** The editable lockup: keystone, frieze, monumental title, credit, and the flags that style them. */
export const TitleForm: React.FC<TitleFormProps> = ({ draft, onText, onPinstripe, onReset, onSubmit }) => (
  <form onSubmit={onSubmit} className="space-y-4">
    <div className="grid grid-cols-3 gap-3">
      <TitleField
        id="title-keystone"
        label="Upper Keystone"
        maxLength={8}
        value={draft.keystone}
        placeholder="THE"
        testId="title-customizer__keystone"
        tracking="0.2em"
        onChange={(value) => onText('keystone', value)}
      />
      <TitleField
        id="title-pre-title"
        label="Upper Frieze Line"
        maxLength={18}
        value={draft.preTitle}
        placeholder="GREAT"
        testId="title-customizer__pre-title"
        tracking="0.25em"
        wrapperClassName="col-span-2"
        onChange={(value) => onText('preTitle', value)}
      />
    </div>

    {FIELDS.map((field) => (
      <TitleField
        key={field.key}
        id={field.id}
        label={field.label}
        maxLength={field.maxLength}
        value={draft[field.key]}
        placeholder={field.placeholder}
        testId={field.testId}
        tracking={field.tracking}
        variant={field.variant}
        onChange={(value) => onText(field.key, value)}
      />
    ))}

    <PinstripeToggle enabled={draft.pinstripeAlternation} onChange={onPinstripe} />

    <ModalFooter onReset={onReset} />
  </form>
);
