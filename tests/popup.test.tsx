import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('Яндекс Браузер')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать запись' })).toBeEnabled();
  });
});
