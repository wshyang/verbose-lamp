import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type RangeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const RangeInput = forwardRef<HTMLInputElement, RangeInputProps>(function RangeInput(
  { className, ...props },
  ref
) {
  return <input ref={ref} type="range" className={cn('ui-range w-full', className)} {...props} />;
});