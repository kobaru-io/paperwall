import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-2 border-[var(--border)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[4px_4px_0_var(--border)] hover:shadow-[6px_6px_0_var(--border)] hover:bg-[var(--primary-hover)]',
        secondary:
          'border-2 border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)] shadow-[4px_4px_0_var(--border)] hover:shadow-[6px_6px_0_var(--border)]',
        accent:
          'border-2 border-[var(--border)] bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[4px_4px_0_var(--border)] hover:shadow-[6px_6px_0_var(--border)]',
        outline:
          'border-2 border-[var(--border)] bg-transparent text-[var(--foreground)] shadow-[4px_4px_0_var(--border)] hover:shadow-[6px_6px_0_var(--border)] hover:bg-[var(--muted)]',
        ghost:
          'text-[var(--foreground)] hover:bg-[var(--muted)]',
        link:
          'text-[var(--muted-foreground)] underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm rounded-none',
        md: 'h-10 px-5 text-base rounded-none',
        lg: 'h-12 px-8 text-lg rounded-none',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
