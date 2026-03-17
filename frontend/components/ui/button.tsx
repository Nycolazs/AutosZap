'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex touch-manipulation items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/60',
  {
    variants: {
      variant: {
        default: 'bg-primary text-white shadow-[0_18px_40px_rgba(50,151,255,0.24)] hover:bg-[#4aa6ff]',
        secondary: 'border border-border-strong bg-white/5 text-foreground hover:bg-white/8',
        ghost: 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
        danger: 'bg-danger/90 text-white hover:bg-danger',
      },
      size: {
        default: 'h-11 px-3.5',
        sm: 'h-10 rounded-lg px-3',
        lg: 'h-11 rounded-xl px-4',
        icon: 'h-11 w-11 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
