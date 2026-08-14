import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChromiumBrowserAdapter } from '../src/browser/chromium';

describe('скачивание файлов', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('вызывает downloads API из browser adapter', async () => {
    const download = vi.fn().mockResolvedValue(42);
    vi.stubGlobal('chrome', { downloads: { download } });
    const adapter = new ChromiumBrowserAdapter();

    await expect(adapter.downloadUrl('blob:chrome-extension://video', 'bugcapture.webm')).resolves.toBe(42);
    expect(download).toHaveBeenCalledWith({
      url: 'blob:chrome-extension://video',
      filename: 'bugcapture.webm',
      saveAs: false,
      conflictAction: 'uniquify',
    });
  });

  it('возвращает понятную ошибку, если API недоступен', async () => {
    vi.stubGlobal('chrome', {});
    const adapter = new ChromiumBrowserAdapter();

    await expect(adapter.downloadUrl('blob:test', 'bugcapture.txt')).rejects.toThrow(
      'Браузер не предоставил API для скачивания файлов.',
    );
  });
});
