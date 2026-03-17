import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-border bg-background-panel px-3 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/20',
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
