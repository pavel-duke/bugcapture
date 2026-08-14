import { describe, expect, it } from 'vitest';
import { createSafeHar } from '../src/har';
import { createTextReport } from '../src/report/text';
import {
  REDACTED,
  TRUNCATED,
  isSensitiveFieldName,
  sanitizeConsoleValue,
  sanitizeHeaders,
  sanitizeString,
  sanitizeStructuredValue,
  sanitizeUrl,
} from '../src/sanitizer';
import type { CaptureResult } from '../src/types';

const FAKE_SECRET = 'BugCaptureFakeCredential_A1b2C3d4E5f6G7h8';

const sensitiveNames = [
  'authorization',
  'auth',
  'authentication',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'ticket',
  'service_ticket',
  'user_ticket',
  'tvm',
  'blackbox',
  'secret',
  'key',
  'api_key',
  'apikey',
  'credential',
  'password',
  'passwd',
  'session',
  'cookie',
  'csrf',
  'xsrf',
  'signature',
  'sign',
  'private',
  'bearer',
];

const fieldCases = sensitiveNames.flatMap((name) => [
  name,
  name.toUpperCase(),
  toCamelCase(name),
  `X-${toKebabCase(name)}`,
]);

describe('security regression: имена чувствительных полей', () => {
  it.each(fieldCases)('очищает поле %s', (name) => {
    expect(isSensitiveFieldName(name)).toBe(true);
    const headers = sanitizeHeaders([{ name, value: FAKE_SECRET }]);
    expect(headers.value[0]?.value).toBe(REDACTED);
    expect(JSON.stringify(headers.value)).not.toContain(FAKE_SECRET);
  });

  it.each([
    'X-Ya-Service-Ticket',
    'X-Yandex-Blackbox-Ticket',
    'X-TVM-Ticket',
    'X-Custom-Credential',
    'apiKey',
    'accessToken',
    'refresh_token',
    'service-ticket',
  ])('гарантированно очищает пример %s', (name) => {
    expect(sanitizeHeaders([{ name, value: FAKE_SECRET }]).value[0]?.value).toBe(REDACTED);
  });

  it.each([
    'accept',
    'accept-language',
    'cache-control',
    'content-length',
    'content-type',
    'etag',
    'if-none-match',
    'last-modified',
    'request-id',
    'traceparent',
    'tracestate',
    'user-agent',
    'x-correlation-id',
    'x-request-id',
  ])('не скрывает безопасное поле %s только из-за имени', (name) => {
    const value = name.includes('id') ? '123e4567-e89b-12d3-a456-426614174000' : 'safe-value';
    expect(isSensitiveFieldName(name)).toBe(false);
    expect(sanitizeHeaders([{ name, value }]).value[0]?.value).toBe(value);
  });

  it('поддерживает явный allowlist для безопасного нестандартного поля', () => {
    const result = sanitizeHeaders([{ name: 'build-signature', value: 'public-checksum' }], ['build-signature']);
    expect(result.value[0]?.value).toBe('public-checksum');
    expect(result.redactionCount).toBe(0);
  });
});

describe('security regression: форматы credential', () => {
  it.each([
    'Bearer abcdefghijklmnopqrstuvwxyz012345',
    'bearer AbCdEf.0123456789_Example-Token',
    'Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123',
    'github_pat_11AA22BB33CC44DD55EE66FF77GG88HH',
    'ghp_1234567890abcdefghijABCDEFGHIJ',
    '123456789:AAExampleTelegramBotToken1234567890',
    'AKIAIOSFODNN7EXAMPLE',
    'ASIAIOSFODNN7EXAMPLE',
    'ya29.a0AfH6SMAExampleOAuthAccessToken123456',
    '1//0gExampleOAuthRefreshToken1234567890',
    'access_token=OAuthAccessToken_Example123456',
    'refresh-token: OAuthRefreshToken_Example123456',
    FAKE_SECRET,
    encodeURIComponent(`Bearer ${FAKE_SECRET}`),
  ])('не пропускает формат %s', (value) => {
    const sanitized = sanitizeString(value);
    expect(sanitized.value).not.toContain(value.includes(FAKE_SECRET) ? FAKE_SECRET : value);
    expect(sanitized.value).toContain(REDACTED);
  });

  it.each([
    '123e4567-e89b-12d3-a456-426614174000',
    '550e8400-e29b-41d4-a716-446655440000',
    'обычная диагностическая строка',
    'GET /api/users/42 returned 404',
    'application/json; charset=utf-8',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'https://example.test/issues/BC-142',
    'public-checksum-sha256',
  ])('не маскирует безопасную строку %s', (value) => {
    expect(sanitizeString(value).value).toBe(value);
  });
});

describe('security regression: URL', () => {
  it.each(sensitiveNames)('очищает query-параметр %s', (name) => {
    const result = sanitizeUrl(`https://example.test/api?${encodeURIComponent(name)}=${encodeURIComponent(FAKE_SECRET)}&id=42`);
    expect(result.value).not.toContain(FAKE_SECRET);
    expect(result.value).toContain(`${encodeURIComponent(name)}=${REDACTED}`);
    expect(result.value).toContain('id=42');
  });

  it('очищает username и password в URL', () => {
    const result = sanitizeUrl(`https://demo:${FAKE_SECRET}@example.test/private`);
    expect(result.value).toContain(`${REDACTED}:${REDACTED}@`);
    expect(result.value).not.toContain(FAKE_SECRET);
  });

  it.each([
    `https://example.test/#access_token=${FAKE_SECRET}`,
    `https://example.test/#/callback?refresh_token=${FAKE_SECRET}&state=public`,
    `https://example.test/path#Bearer%20${FAKE_SECRET}`,
  ])('очищает fragment %s', (url) => {
    const result = sanitizeUrl(url);
    expect(result.value).not.toContain(FAKE_SECRET);
    expect(result.value).toContain(REDACTED);
  });

  it.each([
    `https://storage.test/file?X-Amz-Signature=${FAKE_SECRET}`,
    `https://storage.test/file?X-Goog-Signature=${FAKE_SECRET}`,
    `https://cdn.test/file?sig=${FAKE_SECRET}`,
    `https://cdn.test/file?signature=${FAKE_SECRET}`,
  ])('очищает signed URL %s', (url) => {
    expect(sanitizeUrl(url).value).not.toContain(FAKE_SECRET);
  });

  it('очищает вложенный URL в query-параметре', () => {
    const nested = `https://auth.test/callback?access_token=${FAKE_SECRET}`;
    const result = sanitizeUrl(`https://example.test/redirect?next=${encodeURIComponent(nested)}`);
    expect(result.value).not.toContain(FAKE_SECRET);
    expect(result.value).toContain(REDACTED);
  });

  it('очищает дважды URL-encoded вложенный URL', () => {
    const nested = encodeURIComponent(encodeURIComponent(`https://auth.test/?service-ticket=${FAKE_SECRET}`));
    const result = sanitizeUrl(`https://example.test/?next=${nested}`);
    expect(decodeURIComponent(result.value)).not.toContain(FAKE_SECRET);
    expect(decodeURIComponent(result.value)).toContain(REDACTED);
  });

  it('не считает UUID секретом без чувствительного контекста', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(sanitizeUrl(`https://example.test/items?id=${uuid}`).value).toContain(uuid);
    expect(sanitizeUrl(`https://example.test/items?session=${uuid}`).value).not.toContain(uuid);
  });
});

describe('security regression: Console и вложенные данные', () => {
  it('очищает чувствительные поля во вложенном объекте', () => {
    const result = sanitizeConsoleValue({ user: { profile: { apiKey: FAKE_SECRET, id: 42 } } });
    expect(result.value).not.toContain(FAKE_SECRET);
    expect(result.value).toContain(`"apiKey":"${REDACTED}"`);
  });

  it('не допускает обход через строку с вложенным JSON', () => {
    const input = JSON.stringify({ payload: { refreshToken: FAKE_SECRET } });
    const result = sanitizeConsoleValue(input);
    expect(result.value).not.toContain(FAKE_SECRET);
    expect(result.value).toContain(REDACTED);
  });

  it('обрабатывает массивы', () => {
    const result = sanitizeConsoleValue([{ authorization: FAKE_SECRET }, { status: 500 }]);
    expect(result.value).not.toContain(FAKE_SECRET);
    expect(result.value).toContain('500');
  });

  it('обрабатывает Error', () => {
    const result = sanitizeConsoleValue(new Error(`Bearer ${FAKE_SECRET}`));
    expect(result.value).not.toContain(FAKE_SECRET);
    expect(result.value).toContain(REDACTED);
  });

  it('обрабатывает Map и использует строковый ключ как контекст', () => {
    const result = sanitizeConsoleValue(new Map<string, unknown>([['serviceTicket', FAKE_SECRET], ['status', 401]]));
    expect(result.value).not.toContain(FAKE_SECRET);
    expect(result.value).toContain(REDACTED);
  });

  it('обрабатывает Set', () => {
    const result = sanitizeConsoleValue(new Set(['safe', `Bearer ${FAKE_SECRET}`]));
    expect(result.value).not.toContain(FAKE_SECRET);
    expect(result.value).toContain('safe');
  });

  it('останавливается на cyclic object', () => {
    const cyclic: Record<string, unknown> = { token: FAKE_SECRET };
    cyclic.self = cyclic;
    const result = sanitizeConsoleValue(cyclic);
    expect(result.value).not.toContain(FAKE_SECRET);
    expect(result.value).toContain('[Circular]');
  });

  it('ограничивает глубину', () => {
    const input = { a: { b: { c: { d: { token: FAKE_SECRET } } } } };
    const result = sanitizeConsoleValue(input, { maxDepth: 3 });
    expect(result.value).not.toContain(FAKE_SECRET);
    expect(result.value).toContain('[Max depth]');
  });

  it('ограничивает огромную строку и не пропускает секрет в начале', () => {
    const input = `Bearer ${FAKE_SECRET}${'x'.repeat(50_000)}`;
    const result = sanitizeConsoleValue(input, { maxStringLength: 1_000 });
    expect(result.value.length).toBeLessThanOrEqual(1_000 + TRUNCATED.length);
    expect(result.value).not.toContain(FAKE_SECRET);
  });

  it('не читает getter и не выполняет его код', () => {
    let called = false;
    const input = Object.defineProperty({}, 'token', {
      enumerable: true,
      get() {
        called = true;
        return FAKE_SECRET;
      },
    });
    const result = sanitizeStructuredValue(input);
    expect(called).toBe(false);
    expect(JSON.stringify(result.value)).not.toContain(FAKE_SECRET);
  });
});

describe('security regression: финальная очистка экспорта', () => {
  it('повторно очищает raw данные внутри TXT и HAR', () => {
    const result = unsafeCaptureResult();
    const text = createTextReport(result);
    const har = createSafeHar(result);

    for (const output of [text, har]) {
      expect(output).not.toContain(FAKE_SECRET);
      expect(output).toContain(REDACTED);
    }
    const parsedHar = JSON.parse(har);
    expect(parsedHar.log.entries[0].request).not.toHaveProperty('postData');
    expect(parsedHar.log.entries[0].response.content).not.toHaveProperty('text');
  });
});

describe('security regression: детерминированные fuzz-варианты', () => {
  const cases = Array.from({ length: 64 }, (_, index) => {
    const name = sensitiveNames[index % sensitiveNames.length]!;
    const separator = ['-', '_', '.'][index % 3]!;
    const decorated = `x${separator}${name.replaceAll('_', separator)}${separator}${index}`;
    return [decorated, `${FAKE_SECRET}_${index}`] as const;
  });

  it.each(cases)('не пропускает секрет для варианта %s', (name, secret) => {
    const header = sanitizeHeaders([{ name, value: secret }]).value[0];
    const query = sanitizeUrl(`https://example.test/?${encodeURIComponent(name)}=${encodeURIComponent(secret)}`).value;
    expect(JSON.stringify(header)).not.toContain(secret);
    expect(query).not.toContain(secret);
  });
});

function toCamelCase(value: string): string {
  return value
    .split(/[-_]/)
    .map((part, index) => (index === 0 ? part : `${part[0]?.toUpperCase()}${part.slice(1)}`))
    .join('');
}

function toKebabCase(value: string): string {
  return value.replaceAll('_', '-');
}

function unsafeCaptureResult(): CaptureResult {
  return {
    metadata: {
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
      startTime: 1_700_000_000_000,
      endTime: 1_700_000_001_000,
      duration: 1_000,
      pageUrl: `https://demo:${FAKE_SECRET}@example.test/?access_token=${FAKE_SECRET}`,
      pageTitle: `Ошибка Bearer ${FAKE_SECRET}`,
      browser: { name: 'Chromium', version: '120', os: 'Windows', userAgent: `token=${FAKE_SECRET}` },
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      extensionVersion: '0.4.0',
    },
    network: [
      {
        requestId: '1',
        timestamp: 1_700_000_000_100,
        method: 'GET',
        url: `https://api.test/data?service-ticket=${FAKE_SECRET}`,
        host: 'api.test',
        path: '/data',
        query: `service-ticket=${FAKE_SECRET}`,
        status: 401,
        statusText: `Unauthorized ${FAKE_SECRET}`,
        duration: 42,
        requestHeaders: [{ name: 'X-TVM-Ticket', value: FAKE_SECRET }],
        responseHeaders: [{ name: 'Location', value: `https://auth.test/?signature=${FAKE_SECRET}` }],
        mimeType: 'application/json',
        resourceType: 'Fetch',
        requestSize: 10,
        responseSize: 20,
        error: `Bearer ${FAKE_SECRET}`,
        initiator: `https://app.test/?token=${FAKE_SECRET}`,
      },
    ],
    console: [{ timestamp: 1_700_000_000_200, level: 'error', message: `{"apiKey":"${FAKE_SECRET}"}` }],
    timeline: [{ timestamp: 1_700_000_000_300, type: 'marker', text: `token=${FAKE_SECRET}` }],
    redactionCount: 0,
    baseFilename: 'bugcapture-test',
  };
}
