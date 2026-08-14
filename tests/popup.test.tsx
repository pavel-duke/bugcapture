import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/popup/App';
import type { PopupClient } from '../src/popup/client';
import type { NetworkEvent } from '../src/types';

describe('Popup', () => {
  it('показывает текущую вкладку и браузер', async () => {
    const client: PopupClient = {
      getStatus: vi.fn().mockResolvedValue({
        status: 'idle',
        duration: 0,
        requestCount: 0,
        httpErrorCount: 0,
        consoleErrorCount: 0,
        consoleWarningCount: 0,
        currentTab: { id: 1, url: 'https://example.ru/test', title: 'Пример', hostname: 'example.ru', windowId: 1 },
        browser: { name: 'Яндекс Браузер', version: '26.6', os: 'Windows 11', userAgent: 'YaBrowser/26.6' },
      }),
      start: vi.fn(),
      stop: vi.fn(),
      markProblem: vi.fn(),
      download: vi.fn(),
    };

    render(<App client={client} />);

    expect(await screen.findByText('example.ru')).toBeInTheDocument();
    expect(screen.getByText('Браузер: Яндекс Браузер')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать запись' })).toBeEnabled();
  });

  it('показывает кнопку отметки во время записи', async () => {
    const markProblem = vi.fn().mockResolvedValue({
      status: 'recording',
      duration: 5_000,
      requestCount: 2,
      httpErrorCount: 0,
      consoleErrorCount: 0,
      consoleWarningCount: 0,
    });
    const client: PopupClient = {
      getStatus: vi.fn().mockResolvedValue({
        status: 'recording',
        duration: 5_000,
        requestCount: 2,
        httpErrorCount: 0,
        consoleErrorCount: 0,
        consoleWarningCount: 0,
        currentTab: { id: 1, url: 'https://example.ru', title: 'Пример', hostname: 'example.ru', windowId: 1 },
      }),
      start: vi.fn(),
      stop: vi.fn(),
      markProblem,
      download: vi.fn(),
    };

    render(<App client={client} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Отметить момент' }));
    await waitFor(() => expect(markProblem).toHaveBeenCalledOnce());
  });

  it('повторно скачивает весь пакет с экрана результата', async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    const client: PopupClient = {
      getStatus: vi.fn().mockResolvedValue({
        status: 'completed',
        duration: 12_000,
        requestCount: 14,
        httpErrorCount: 1,
        consoleErrorCount: 1,
        consoleWarningCount: 0,
        downloadsStarted: true,
        result: {
          metadata: {
            sessionId: 'session',
            startTime: 1,
            endTime: 12_001,
            duration: 12_000,
            pageUrl: 'https://example.ru',
            pageTitle: 'Example',
            browser: { name: 'Яндекс Браузер', version: '26.6', os: 'Windows 11', userAgent: 'test' },
            viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
            extensionVersion: '0.4.0',
          },
          network: [],
          console: [],
          timeline: [],
          redactionCount: 3,
          baseFilename: 'bugcapture-test',
        },
      }),
      start: vi.fn(),
      stop: vi.fn(),
      markProblem: vi.fn(),
      download,
    };

    render(<App client={client} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Скачать пакет повторно' }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(undefined));
  });

  it('ищет, фильтрует и повторно очищает запросы в Network Explorer', async () => {
    const secret = 'BugCapturePreviewSecret_A1b2C3d4E5f6';
    const network = [
      networkEvent({ requestId: 'ok', method: 'GET', url: 'https://api.example.ru/users', status: 200 }),
      networkEvent({ requestId: 'server', method: 'POST', url: 'https://api.example.ru/upload', status: 500 }),
      networkEvent({
        requestId: 'failed',
        method: 'GET',
        url: `https://cdn.example.ru/file?service-ticket=${secret}`,
        status: 0,
        error: 'net::ERR_TIMED_OUT',
        requestHeaders: [{ name: 'X-TVM-Ticket', value: secret }],
      }),
    ];
    const client: PopupClient = {
      getStatus: vi.fn().mockResolvedValue(completedSummary(network)),
      start: vi.fn(),
      stop: vi.fn(),
      markProblem: vi.fn(),
      download: vi.fn(),
    };

    render(<App client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Посмотреть Network' }));

    expect(screen.getByRole('heading', { name: 'Network' })).toBeInTheDocument();
    expect(screen.getByText('GET /users')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(secret);

    fireEvent.change(screen.getByPlaceholderText('URL, method, status или host'), { target: { value: 'upload' } });
    expect(screen.getByText('POST /upload')).toBeInTheDocument();
    expect(screen.queryByText('GET /users')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('URL, method, status или host'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));
    expect(screen.getByText('GET /file')).toBeInTheDocument();
    expect(screen.queryByText('POST /upload')).not.toBeInTheDocument();
  });
});

function completedSummary(network: NetworkEvent[]) {
  return {
    status: 'completed' as const,
    duration: 12_000,
    requestCount: network.length,
    httpErrorCount: network.filter((event) => event.status >= 400 || event.error).length,
    consoleErrorCount: 0,
    consoleWarningCount: 0,
    downloadsStarted: false,
    result: {
      metadata: {
        sessionId: 'session',
        startTime: 1,
        endTime: 12_001,
        duration: 12_000,
        pageUrl: 'https://example.ru',
        pageTitle: 'Example',
        browser: { name: 'Яндекс Браузер', version: '26.6', os: 'Windows 11', userAgent: 'test' },
        viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
        extensionVersion: '0.4.0',
      },
      network,
      console: [],
      timeline: [],
      redactionCount: 0,
      baseFilename: 'bugcapture-test',
    },
  };
}

function networkEvent(overrides: Partial<NetworkEvent>): NetworkEvent {
  const url = overrides.url ?? 'https://example.ru/';
  const parsed = new URL(url);
  return {
    requestId: 'request',
    timestamp: Date.now(),
    method: 'GET',
    url,
    host: parsed.host,
    path: parsed.pathname,
    query: parsed.search.slice(1),
    status: 200,
    statusText: 'OK',
    duration: 42,
    requestHeaders: [],
    responseHeaders: [],
    mimeType: 'application/json',
    resourceType: 'Fetch',
    requestSize: 10,
    responseSize: 20,
    error: '',
    ...overrides,
  };
}
