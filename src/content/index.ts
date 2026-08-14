import type { ConsoleEvent, ConsoleLevel } from '../types';

interface ContentGlobal {
  __BUGCAPTURE_CONTENT_INSTALLED__?: boolean;
}

const contentGlobal = globalThis as typeof globalThis & ContentGlobal;

if (!contentGlobal.__BUGCAPTURE_CONTENT_INSTALLED__) {
  contentGlobal.__BUGCAPTURE_CONTENT_INSTALLED__ = true;
  let sessionId: string | null = null;

  window.addEventListener('bugcapture-page-event', (event) => {
    if (!sessionId) return;
    const detail = (event as CustomEvent<Record<string, unknown>>).detail;
    const consoleEvent: ConsoleEvent = {
      timestamp: Number(detail.timestamp ?? Date.now()),
      level: normalizeLevel(detail.level),
      message: String(detail.message ?? ''),
      source: detail.source ? String(detail.source) : undefined,
      line: detail.line ? Number(detail.line) : undefined,
      column: detail.column ? Number(detail.column) : undefined,
    };
    void chrome.runtime.sendMessage({ type: 'CONTENT_EVENT', sessionId, event: consoleEvent });
  });

  chrome.runtime.onMessage.addListener((message: { type?: string; sessionId?: string }, _sender, sendResponse) => {
    if (message.type === 'CONTENT_START' && message.sessionId) {
      sessionId = message.sessionId;
      window.dispatchEvent(new CustomEvent('bugcapture-control', { detail: { action: 'start' } }));
      sendResponse({ ok: true });
      return;
    }
    if (message.type === 'CONTENT_STOP') {
      window.dispatchEvent(new CustomEvent('bugcapture-control', { detail: { action: 'stop' } }));
      sessionId = null;
      sendResponse({ ok: true });
    }
  });
}

function normalizeLevel(value: unknown): ConsoleLevel {
  if (value === 'warn' || value === 'page-error' || value === 'unhandled-rejection') return value;
  return 'error';
}
