import { detectBrowser, detectOperatingSystem } from './detect';
import type { BrowserAdapter } from './types';
import type { BrowserInfo, BrowserTab } from '../types';

export class ChromiumBrowserAdapter implements BrowserAdapter {
  async getCurrentTab(): Promise<BrowserTab> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || tab.windowId === undefined) {
      throw new Error('Не удалось определить текущую вкладку.');
    }
    if (!/^https?:\/\//i.test(tab.url)) {
      throw new Error('Откройте обычную веб-страницу (http или https) и повторите попытку.');
    }
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title ?? 'Без названия',
      hostname: new URL(tab.url).hostname,
      windowId: tab.windowId,
    };
  }

  async getBrowserInfo(): Promise<BrowserInfo> {
    const userAgent = navigator.userAgent;
    const browser = detectBrowser(userAgent);
    return {
      ...browser,
      os: detectOperatingSystem(userAgent),
      userAgent,
    };
  }

  async getViewport(tabId: number): Promise<{ width: number; height: number; devicePixelRatio: number }> {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        }),
      });
      return result?.result ?? { width: 0, height: 0, devicePixelRatio: 1 };
    } catch {
      return { width: 0, height: 0, devicePixelRatio: 1 };
    }
  }

  async getMediaStreamId(tabId: number): Promise<string> {
    return chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  }

  async ensureOffscreenDocument(): Promise<void> {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Запись выбранной пользователем вкладки и локальная подготовка файлов',
    });
  }
}

export const browserAdapter = new ChromiumBrowserAdapter();
