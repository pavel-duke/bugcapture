import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/popup/App';
import type { PopupClient } from '../src/popup/client';

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
            extensionVersion: '0.3.0',
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
});
