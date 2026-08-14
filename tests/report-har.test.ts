import { describe, expect, it } from 'vitest';
import { createSafeHar } from '../src/har';
import { createTextReport } from '../src/report/text';
import { sanitizeConsoleEvent, sanitizeNetworkEvent } from '../src/sanitizer';
import type { CaptureResult, ConsoleEvent, NetworkEvent } from '../src/types';

const TEST_SECRET = 'BUGCAPTURE_TEST_SECRET_123456789';

function fixture(): CaptureResult {
  const rawNetwork: NetworkEvent = {
    requestId: '42',
    timestamp: Date.UTC(2026, 7, 14, 9, 14, 12),
    method: 'POST',
    url: `https://example.ru/api/attachments?token=${TEST_SECRET}`,
    host: 'example.ru',
    path: '/api/attachments',
    query: `token=${TEST_SECRET}`,
    status: 500,
    statusText: 'Internal Server Error',
    duration: 1482,
    requestHeaders: [
      { name: 'content-type', value: 'application/json' },
      { name: 'authorization', value: `Bearer ${TEST_SECRET}` },
      { name: 'cookie', value: `session=${TEST_SECRET}` },
    ],
    responseHeaders: [{ name: 'set-cookie', value: `session=${TEST_SECRET}` }],
    mimeType: 'application/json',
    resourceType: 'Fetch',
    requestSize: 100,
    responseSize: 80,
    error: '',
  };
  const rawConsole: ConsoleEvent = {
    timestamp: Date.UTC(2026, 7, 14, 9, 14, 12, 412),
    level: 'error',
    message: `Failed to fetch with Bearer ${TEST_SECRET}`,
  };
  const network = sanitizeNetworkEvent(rawNetwork);
  const console = sanitizeConsoleEvent(rawConsole);
  return {
    metadata: {
      sessionId: 'test-session',
      startTime: Date.UTC(2026, 7, 14, 9, 14, 3),
      endTime: Date.UTC(2026, 7, 14, 9, 14, 41),
      duration: 38_000,
      pageUrl: 'https://example.ru/tickets/123',
      pageTitle: 'Тикет 123',
      browser: { name: 'Яндекс Браузер', version: '26.6', os: 'Windows 11', userAgent: 'test' },
      viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
      extensionVersion: '0.4.0',
    },
    network: [network.value],
    console: [console.value],
    timeline: [
      { timestamp: Date.UTC(2026, 7, 14, 9, 14, 3), type: 'recording', text: 'Запись началась' },
      { timestamp: Date.UTC(2026, 7, 14, 9, 14, 41), type: 'recording', text: 'Запись остановлена' },
    ],
    redactionCount: network.redactionCount + console.redactionCount,
    baseFilename: 'bugcapture-2026-08-14-121403',
  };
}

describe('экспорт диагностики', () => {
  it('создаёт понятный TXT без тестового секрета', () => {
    const report = createTextReport(fixture());

    expect(report).toContain('Браузер: Яндекс Браузер');
    expect(report).toContain('POST /api/attachments?token=[REDACTED]');
    expect(report).toContain('authorization: [REDACTED]');
    expect(report).not.toContain(TEST_SECRET);
  });

  it('создаёт валидный HAR 1.2 без bodies, cookies и тестового секрета', () => {
    const text = createSafeHar(fixture());
    const har = JSON.parse(text);

    expect(har.log.version).toBe('1.2');
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0].request.cookies).toEqual([]);
    expect(har.log.entries[0].request).not.toHaveProperty('postData');
    expect(har.log.entries[0].response.content).not.toHaveProperty('text');
    expect(text).not.toContain(TEST_SECRET);
  });
});
