import { describe, expect, it } from 'vitest';
import { REDACTED, sanitizeHeaders, sanitizeNetworkEvent, sanitizeString, sanitizeUrl } from '../src/sanitizer';
import type { NetworkEvent } from '../src/types';

const TEST_SECRET = 'BUGCAPTURE_TEST_SECRET_123456789';

describe('sanitizer', () => {
  it('скрывает чувствительные query-параметры без изменения обычных', () => {
    const result = sanitizeUrl(`https://api.example.ru/users?id=123&token=${TEST_SECRET}&PASSWORD=qwerty`);

    expect(result.value).toBe(`https://api.example.ru/users?id=123&token=${REDACTED}&PASSWORD=${REDACTED}`);
    expect(result.redactionCount).toBe(2);
    expect(result.value).not.toContain(TEST_SECRET);
  });

  it('полностью скрывает Authorization, Cookie и API keys', () => {
    const result = sanitizeHeaders([
      { name: 'Authorization', value: `Bearer ${TEST_SECRET}` },
      { name: 'Cookie', value: `session=${TEST_SECRET}` },
      { name: 'X-API-Key', value: TEST_SECRET },
      { name: 'Content-Type', value: 'application/json' },
    ]);

    expect(result.value).toEqual([
      { name: 'Authorization', value: REDACTED },
      { name: 'Cookie', value: REDACTED },
      { name: 'X-API-Key', value: REDACTED },
      { name: 'Content-Type', value: 'application/json' },
    ]);
    expect(JSON.stringify(result.value)).not.toContain(TEST_SECRET);
  });

  it.each([
    ['Bearer abcdefghijklmnopqrstuvwxyz', `Bearer ${REDACTED}`],
    ['Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==', `Basic ${REDACTED}`],
    ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123', REDACTED],
    ['github_pat_11AA22BB33CC44DD55EE66FF77GG', REDACTED],
    ['AKIAIOSFODNN7EXAMPLE', REDACTED],
    ['123456789:AAExampleTelegramBotToken123456789', REDACTED],
  ])('скрывает известный формат секрета: %s', (input, expected) => {
    expect(sanitizeString(input).value).toBe(expected);
  });

  it('очищает Network-событие целиком', () => {
    const event: NetworkEvent = {
      requestId: '1',
      timestamp: Date.now(),
      method: 'POST',
      url: `https://api.example.ru/upload?token=${TEST_SECRET}`,
      host: 'api.example.ru',
      path: '/upload',
      query: `token=${TEST_SECRET}`,
      status: 500,
      statusText: 'Internal Server Error',
      duration: 42,
      requestHeaders: [{ name: 'Authorization', value: `Bearer ${TEST_SECRET}` }],
      responseHeaders: [{ name: 'Set-Cookie', value: `session=${TEST_SECRET}` }],
      mimeType: 'application/json',
      resourceType: 'Fetch',
      requestSize: 100,
      responseSize: 50,
      error: `Failed with Bearer ${TEST_SECRET}`,
    };

    const result = sanitizeNetworkEvent(event);

    expect(JSON.stringify(result.value)).not.toContain(TEST_SECRET);
    expect(result.value.query).toBe(`token=${REDACTED}`);
    expect(result.redactionCount).toBeGreaterThanOrEqual(4);
  });
});
