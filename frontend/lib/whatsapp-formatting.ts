export type WhatsAppInlineNode =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'bold' | 'italic' | 'strikethrough';
      children: WhatsAppInlineNode[];
    }
  | {
      type: 'code';
      text: string;
    };

export type WhatsAppTextBlock =
  | {
      type: 'text';
      content: string;
    }
  | {
      type: 'code';
      content: string;
    };

const INLINE_MARKERS = new Set(['*', '_', '~']);

export function normalizeWhatsAppText(value?: string | null) {
  return (value ?? '').replace(/\r\n/g, '\n');
}

export function splitWhatsAppTextBlocks(value: string) {
  const content = normalizeWhatsAppText(value);
  const blocks: WhatsAppTextBlock[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const codeStart = content.indexOf('```', cursor);

    if (codeStart === -1) {
      blocks.push({
        type: 'text',
        content: content.slice(cursor),
      });
      break;
    }

    const codeEnd = content.indexOf('```', codeStart + 3);

    if (codeEnd === -1) {
      blocks.push({
        type: 'text',
        content: content.slice(cursor),
      });
      break;
    }

    if (codeStart > cursor) {
      blocks.push({
        type: 'text',
        content: content.slice(cursor, codeStart),
      });
    }

    blocks.push({
      type: 'code',
      content: content.slice(codeStart + 3, codeEnd),
    });

    cursor = codeEnd + 3;
  }

  if (!blocks.length) {
    blocks.push({
      type: 'text',
      content,
    });
  }

  return blocks;
}

export function parseWhatsAppInlineFormatting(value: string): WhatsAppInlineNode[] {
  const nodes: WhatsAppInlineNode[] = [];
  let buffer = '';
  let cursor = 0;

  const flushBuffer = () => {
    if (!buffer) {
      return;
    }

    nodes.push({
      type: 'text',
      text: buffer,
    });
    buffer = '';
  };

  while (cursor < value.length) {
    const marker = value[cursor];

    if (marker === '`' && value.slice(cursor, cursor + 3) !== '```') {
      const closingIndex = findClosingMarker(value, marker, cursor + 1);

      if (closingIndex !== -1) {
        flushBuffer();
        nodes.push({
          type: 'code',
          text: value.slice(cursor + 1, closingIndex),
        });
        cursor = closingIndex + 1;
        continue;
      }
    }

    if (INLINE_MARKERS.has(marker)) {
      const closingIndex = findClosingMarker(value, marker, cursor + 1);

      if (closingIndex !== -1) {
        flushBuffer();
        const innerContent = value.slice(cursor + 1, closingIndex);

        nodes.push({
          type:
            marker === '*'
              ? 'bold'
              : marker === '_'
                ? 'italic'
                : 'strikethrough',
          children: parseWhatsAppInlineFormatting(innerContent),
        });

        cursor = closingIndex + 1;
        continue;
      }
    }

    buffer += marker;
    cursor += 1;
  }

  flushBuffer();

  return nodes;
}

function findClosingMarker(value: string, marker: string, startIndex: number) {
  for (let index = startIndex; index < value.length; index += 1) {
    if (value[index] !== marker) {
      continue;
    }

    const innerContent = value.slice(startIndex, index);

    if (!innerContent.length) {
      continue;
    }

    if (!innerContent.trim().length) {
      continue;
    }

    return index;
  }

  return -1;
}
