'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export function Switch(props: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  const { className, ...rest } = props;

  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-start overflow-hidden rounded-full border border-white/20 bg-white/[0.08] px-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] transition-all duration-200 data-[state=checked]:justify-end data-[state=checked]:border-primary/70 data-[state=checked]:bg-primary/30 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
      {...rest}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-transform duration-200" />
    </SwitchPrimitive.Root>
  );
}
