import * as React from 'react';
import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'min-h-24 w-full rounded-xl border border-border bg-background-panel px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/20',
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
