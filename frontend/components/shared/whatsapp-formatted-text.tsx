'use client';

import { Fragment, useMemo } from 'react';
import {
  normalizeWhatsAppText,
  parseWhatsAppInlineFormatting,
  splitWhatsAppTextBlocks,
  type WhatsAppInlineNode,
} from '@/lib/whatsapp-formatting';
import { cn } from '@/lib/utils';

type WhatsAppFormattedTextTone = 'outgoing' | 'incoming' | 'preview';

export function WhatsAppFormattedText({
  content,
  tone = 'incoming',
  className,
}: {
  content?: string | null;
  tone?: WhatsAppFormattedTextTone;
  className?: string;
}) {
  const normalizedContent = normalizeWhatsAppText(content);
  const blocks = useMemo(
    () => splitWhatsAppTextBlocks(normalizedContent),
    [normalizedContent],
  );

  if (!normalizedContent.trim()) {
    return null;
  }

  return (
    <div
      className={cn(
        'space-y-1 text-[14px] leading-6 tracking-[0.01em]',
        tone === 'outgoing'
          ? 'text-[var(--text-on-bubble)]'
          : tone === 'preview'
            ? 'text-[#102012]'
            : 'text-foreground/92',
        className,
      )}
    >
      {blocks.map((block, blockIndex) => {
        if (block.type === 'code') {
          return (
            <pre
              key={`wa-block-${blockIndex}-code`}
              className={cn(
                'overflow-x-auto rounded-[14px] border px-3 py-2.5 font-mono text-[13px] leading-6 whitespace-pre-wrap break-words',
                tone === 'outgoing'
                  ? 'border-white/14 bg-white/10 text-[var(--text-on-bubble)]'
                  : tone === 'preview'
                    ? 'border-[#b8d4a7] bg-[#cfe9bc] text-[#102012]'
                    : 'border-black/8 bg-black/[0.04] text-foreground/92',
              )}
            >
              {block.content || ' '}
            </pre>
          );
        }

        return block.content.split('\n').map((line, lineIndex) => (
          <div
            key={`wa-block-${blockIndex}-line-${lineIndex}`}
            className={cn('break-words whitespace-pre-wrap', !line.trim() && 'min-h-4')}
          >
            {line.trim() ? renderInlineNodes(parseWhatsAppInlineFormatting(line), tone) : <span>&nbsp;</span>}
          </div>
        ));
      })}
    </div>
  );
}

function renderInlineNodes(
  nodes: WhatsAppInlineNode[],
  tone: WhatsAppFormattedTextTone,
  keyPrefix = 'wa-inline',
) {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    if (node.type === 'text') {
      return <Fragment key={key}>{node.text}</Fragment>;
    }

    if (node.type === 'code') {
      return (
        <code
          key={key}
          className={cn(
            'rounded-[7px] border px-1.5 py-0.5 font-mono text-[0.92em]',
            tone === 'outgoing'
              ? 'border-white/14 bg-white/12 text-[var(--text-on-bubble)]'
              : tone === 'preview'
                ? 'border-[#b8d4a7] bg-[#cfe9bc] text-[#102012]'
                : 'border-black/8 bg-black/[0.04] text-foreground/92',
          )}
        >
          {node.text}
        </code>
      );
    }

    const children = renderInlineNodes(node.children, tone, key);

    if (node.type === 'bold') {
      return (
        <strong key={key} className="font-semibold tracking-[0.015em]">
          {children}
        </strong>
      );
    }

    if (node.type === 'italic') {
      return (
        <em key={key} className="italic">
          {children}
        </em>
      );
    }

    return (
      <span key={key} className="line-through">
        {children}
      </span>
    );
  });
}
