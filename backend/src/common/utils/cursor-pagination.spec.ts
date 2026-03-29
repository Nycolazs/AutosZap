import {
  cursorPaginatedResponse,
  buildCursorWhere,
  buildCompoundCursor,
  parseCompoundCursor,
  buildCompoundCursorWhere,
} from './cursor-pagination';

describe('cursorPaginatedResponse', () => {
  it('should indicate hasMore when data exceeds limit', () => {
    const items = [
      { id: '1', createdAt: new Date() },
      { id: '2', createdAt: new Date() },
      { id: '3', createdAt: new Date() },
    ];

    const result = cursorPaginatedResponse(items, 2, (item) => item.id);

    expect(result.data).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('2');
  });

  it('should indicate no more when data fits within limit', () => {
    const items = [
      { id: '1', createdAt: new Date() },
      { id: '2', createdAt: new Date() },
    ];

    const result = cursorPaginatedResponse(items, 3, (item) => item.id);

    expect(result.data).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('should handle empty data', () => {
    const result = cursorPaginatedResponse([], 10, () => '');

    expect(result.data).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });
});

describe('buildCursorWhere', () => {
  it('should return empty object for undefined cursor', () => {
    const result = buildCursorWhere(undefined, 'before', 'createdAt');
    expect(result).toEqual({});
  });

  it('should return lt operator for before direction', () => {
    const cursor = '2026-01-15T12:00:00.000Z';
    const result = buildCursorWhere(cursor, 'before', 'createdAt');

    expect(result).toEqual({
      createdAt: { lt: new Date(cursor) },
    });
  });

  it('should return gt operator for after direction', () => {
    const cursor = '2026-01-15T12:00:00.000Z';
    const result = buildCursorWhere(cursor, 'after', 'createdAt');

    expect(result).toEqual({
      createdAt: { gt: new Date(cursor) },
    });
  });
});

describe('compound cursor', () => {
  it('should encode and decode a compound cursor', () => {
    const timestamp = new Date('2026-03-29T10:00:00.000Z');
    const id = 'msg-abc123';

    const cursor = buildCompoundCursor(timestamp, id);
    const parsed = parseCompoundCursor(cursor);

    expect(parsed).not.toBeNull();
    expect(parsed!.timestamp.toISOString()).toBe(timestamp.toISOString());
    expect(parsed!.id).toBe(id);
  });

  it('should return null for malformed cursors', () => {
    expect(parseCompoundCursor('')).toBeNull();
    expect(parseCompoundCursor('not-a-valid-cursor')).toBeNull();
    expect(parseCompoundCursor('invalid:::')).toBeNull();
  });

  it('buildCompoundCursorWhere should return OR clause for before', () => {
    const ts = new Date('2026-03-29T10:00:00.000Z');
    const cursor = buildCompoundCursor(ts, 'id-1');

    const result = buildCompoundCursorWhere(
      cursor,
      'before',
      'createdAt',
      'id',
    );

    expect(result).toHaveProperty('OR');
    expect((result as any).OR).toHaveLength(2);
  });
});
