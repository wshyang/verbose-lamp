import React from 'react';

export interface TitleFieldProps {
  id: string;
  label: string;
  maxLength: number;
  value: string;
  placeholder: string;
  testId: string;
  /** Letter-spacing, as a CSS `em` value without the unit. */
  tracking: string;
  variant?: 'standard' | 'monumental';
  wrapperClassName?: string;
  onChange: (value: string) => void;
}

/** The monumental line is set larger and carries a brighter border than the rest. */
function fieldClassName(tracking: string, variant: 'standard' | 'monumental'): string {
  const shared = 'w-full bg-[#0e0b14] focus:outline-none focus:border-[#f8e29b]';
  return variant === 'monumental'
    ? `${shared} border border-[#d4af37]/45 px-3.5 py-2.5 text-base font-deco tracking-[${tracking}] text-[#fff6dc]`
    : `${shared} border border-[#d4af37]/35 px-3 py-2 text-xs tracking-[${tracking}] text-[#fff4d4]`;
}

/** One labelled text field of the title card. */
export const TitleField: React.FC<TitleFieldProps> = ({
  id,
  label,
  maxLength,
  value,
  placeholder,
  testId,
  tracking,
  variant = 'standard',
  wrapperClassName,
  onChange,
}) => (
  <div className={wrapperClassName}>
    <label htmlFor={id} className="mb-1 block text-[10px] uppercase tracking-[0.22em] text-[#d4af37]">
      {label}
    </label>
    <input
      id={id}
      type="text"
      maxLength={maxLength}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={fieldClassName(tracking, variant)}
      placeholder={placeholder}
      data-testid={testId}
    />
  </div>
);
