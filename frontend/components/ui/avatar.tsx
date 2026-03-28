'use client';

import type { ReactNode } from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

function resolveAvatarFallbackContent(children: ReactNode) {
  if (typeof children !== 'string' && typeof children !== 'number') {
    return {
      shouldUsePersonIcon: false,
      text: children,
    };
  }

  const rawText = String(children).trim();

  if (!rawText) {
    return {
      shouldUsePersonIcon: false,
      text: children,
    };
  }

  const normalizedText = rawText.normalize('NFKC');
  const sanitizedText = normalizedText
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 2)
    .toUpperCase();
  const hasBrokenGlyphs = /[\uFFFD\uFFFC\u25A1]|\p{M}/u.test(normalizedText);

  if (hasBrokenGlyphs || !sanitizedText) {
    return {
      shouldUsePersonIcon: true,
      text: null,
    };
  }

  return {
    shouldUsePersonIcon: false,
    text: sanitizedText,
  };
}

export function Avatar({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-border",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  );
}

export function AvatarFallback({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>) {
  const fallbackContent = resolveAvatarFallbackContent(children);

  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "flex h-full w-full items-center justify-center bg-primary-soft text-xs font-semibold text-primary",
        className,
      )}
      {...props}
    >
      {fallbackContent.shouldUsePersonIcon ? (
        <UserRound className="h-[1.05em] w-[1.05em]" aria-hidden="true" />
      ) : (
        fallbackContent.text
      )}
    </AvatarPrimitive.Fallback>
  );
}
