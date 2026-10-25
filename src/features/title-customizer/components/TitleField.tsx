interface TitleFieldProps {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  placeholder: string;
  testId: string;
  /** Size, weight and tracking differ per field; the border, background and focus ring do not. */
  inputClassName: string;
  /** Grid placement for the field's wrapper. */
  wrapperClassName?: string;
  onChange: (value: string) => void;
}

export function TitleField({ id, label, value, maxLength, placeholder, testId, inputClassName, wrapperClassName, onChange }: TitleFieldProps) {
  return (
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
        className={`w-full bg-[#0e0b14] border ${inputClassName} focus:outline-none focus:border-[#f8e29b]`}
        placeholder={placeholder}
        data-testid={testId}
      />
    </div>
  );
}
