import type { ReactNode } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from './Button';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  title?: string;
}

export function IconButton({
  label,
  icon,
  title = label,
  variant = 'panel',
  size = 'icon',
  ...props
}: IconButtonProps) {
  return (
    <Button {...props} aria-label={label} title={title} variant={variant} size={size}>
      {icon}
    </Button>
  );
}