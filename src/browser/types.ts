import type { BrowserInfo, BrowserTab } from '../types';

export interface BrowserAdapter {
  getCurrentTab(): Promise<BrowserTab>;
  getBrowserInfo(): Promise<BrowserInfo>;
  getViewport(tabId: number): Promise<{ width: number; height: number; devicePixelRatio: number }>;
  getMediaStreamId(tabId: number): Promise<string>;
  ensureOffscreenDocument(): Promise<void>;
  downloadUrl(url: string, filename: string): Promise<number>;
}
