export type CursorPaginatedResult<T> = {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * Builds a cursor-paginated response from a data array.
 *
 * Expects that the caller fetched `limit + 1` items so we can detect
 * whether more records exist beyond the requested page.
 */
export function cursorPaginatedResponse<T>(
  data: T[],
  limit: number,
  getCursor: (item: T) => string,
): CursorPaginatedResult<T> {
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const lastItem = items[items.length - 1];

  return {
    data: items,
    nextCursor: hasMore && lastItem ? getCursor(lastItem) : null,
    hasMore,
  };
}

/**
 * Builds a Prisma `where` clause fragment for cursor-based pagination.
 *
 * For `direction = 'before'` (fetching older records): field < cursor
 * For `direction = 'after'`  (fetching newer records): field > cursor
 *
 * The cursor is expected to be an ISO-8601 timestamp string for date-based
 * cursors, or a plain string for ID-based cursors.
 */
export function buildCursorWhere(
  cursor: string | undefined,
  direction: 'before' | 'after',
  field: string,
): Record<string, unknown> {
  if (!cursor?.trim()) {
    return {};
  }

  const operator = direction === 'before' ? 'lt' : 'gt';

  return {
    [field]: {
      [operator]: new Date(cursor),
    },
  };
}

/**
 * Builds a compound cursor `where` clause using both a timestamp field
 * and an ID field for deterministic ordering when timestamps collide.
 *
 * Uses the same `createdAt::id` format used by the existing messages
 * cursor in ConversationsService.
 */
export function buildCompoundCursorWhere(
  cursor: string | undefined,
  direction: 'before' | 'after',
  timestampField: string,
  idField: string,
): Record<string, unknown> {
  if (!cursor?.trim()) {
    return {};
  }

  const parsed = parseCompoundCursor(cursor);
  if (!parsed) {
    return {};
  }

  const tsOp = direction === 'before' ? 'lt' : 'gt';
  const idOp = direction === 'before' ? 'lt' : 'gt';

  return {
    OR: [
      {
        [timestampField]: { [tsOp]: parsed.timestamp },
      },
      {
        AND: [
          { [timestampField]: parsed.timestamp },
          { [idField]: { [idOp]: parsed.id } },
        ],
      },
    ],
  };
}

/**
 * Encodes a compound cursor from a timestamp and an ID.
 */
export function buildCompoundCursor(timestamp: Date, id: string): string {
  return `${timestamp.toISOString()}::${id}`;
}

/**
 * Parses a compound cursor string (`ISO-timestamp::id`).
 * Returns null if the cursor is malformed.
 */
export function parseCompoundCursor(
  cursor: string,
): { timestamp: Date; id: string } | null {
  const [timestampValue, id] = cursor.split('::');
  const timestamp = timestampValue ? new Date(timestampValue) : null;

  if (!id || !timestamp || Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return { timestamp, id };
}
