import type { HeaderEntry, NetworkEvent } from '../types';
import { sanitizeHeaders, sanitizeNetworkEvent, sanitizeString, sanitizeUrl } from '../sanitizer';

const MAX_NETWORK_EVENTS = 5_000;

interface PendingRequest {
  requestId: string;
  timestamp: number;
  monotonicStart: number;
  method: string;
  url: string;
  resourceType: string;
  requestHeaders: HeaderEntry[];
  responseHeaders: HeaderEntry[];
  status: number;
  statusText: string;
  mimeType: string;
  requestSize: number;
  responseSize: number;
  error: string;
  initiator?: string;
}

export class NetworkCollector {
  private tabId: number | null = null;
  private pending = new Map<string, PendingRequest>();
  private completed: NetworkEvent[] = [];
  private extraRequestHeaders = new Map<string, HeaderEntry[]>();
  private extraResponseHeaders = new Map<string, HeaderEntry[]>();
  private redactionCount = 0;
  private readonly onUnexpectedDetach?: (reason: string) => void;

  constructor(onUnexpectedDetach?: (reason: string) => void) {
    this.onUnexpectedDetach = onUnexpectedDetach;
  }

  async start(tabId: number): Promise<void> {
    this.tabId = tabId;
    this.pending.clear();
    this.completed = [];
    this.extraRequestHeaders.clear();
    this.extraResponseHeaders.clear();
    this.redactionCount = 0;
    chrome.debugger.onEvent.addListener(this.handleEvent);
    chrome.debugger.onDetach.addListener(this.handleDetach);
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {
        maxTotalBufferSize: 0,
        maxResourceBufferSize: 0,
        maxPostDataSize: 0,
      });
    } catch (error) {
      this.removeListeners();
      this.tabId = null;
      throw new Error(
        `Не удалось подключить сбор Network. Закройте DevTools для этой вкладки и повторите. ${errorMessage(error)}`,
        { cause: error },
      );
    }
  }

  async stop(): Promise<NetworkEvent[]> {
    const tabId = this.tabId;
    this.removeListeners();
    this.tabId = null;
    for (const requestId of [...this.pending.keys()]) this.finalize(requestId, performance.now() / 1000);
    if (tabId !== null) {
      try {
        await chrome.debugger.sendCommand({ tabId }, 'Network.disable');
      } catch {
        // Вкладка могла быть закрыта пользователем.
      }
      try {
        await chrome.debugger.detach({ tabId });
      } catch {
        // Соединение уже могло быть отключено браузером.
      }
    }
    return [...this.completed].sort((a, b) => a.timestamp - b.timestamp);
  }

  getStats(): { requestCount: number; httpErrorCount: number } {
    const events = [...this.completed, ...this.pending.values()];
    return {
      requestCount: events.length,
      httpErrorCount: events.filter((event) => event.status >= 400).length,
    };
  }

  getRedactionCount(): number {
    return this.redactionCount;
  }

  private readonly handleEvent = (
    source: chrome.debugger.Debuggee,
    method: string,
    params?: Record<string, any>,
  ): void => {
    if (source.tabId !== this.tabId || !params) return;
    const requestId = String(params.requestId ?? '');
    if (!requestId) return;

    if (method === 'Network.requestWillBeSent') {
      const previous = this.pending.get(requestId);
      if (previous && params.redirectResponse) {
        this.applyResponse(previous, params.redirectResponse);
        this.finalize(requestId, Number(params.timestamp));
      }
      if (!previous && this.pending.size + this.completed.length >= MAX_NETWORK_EVENTS) return;
      const request = params.request ?? {};
      this.pending.set(requestId, {
        requestId,
        timestamp: Number(params.wallTime ? params.wallTime * 1000 : Date.now()),
        monotonicStart: Number(params.timestamp ?? 0),
        method: this.cleanString(String(request.method ?? 'GET')),
        url: this.cleanUrl(String(request.url ?? '')),
        resourceType: this.cleanString(String(params.type ?? 'Other')),
        requestHeaders: this.extraRequestHeaders.get(requestId) ?? this.cleanHeaders(headersFromProtocol(request.headers)),
        responseHeaders: [],
        status: 0,
        statusText: '',
        mimeType: '',
        requestSize: estimateRequestSize(request),
        responseSize: 0,
        error: '',
        initiator: this.cleanUrlOrString(extractInitiator(params.initiator)),
      });
      this.extraRequestHeaders.delete(requestId);
      return;
    }

    if (method === 'Network.requestWillBeSentExtraInfo') {
      const headers = this.cleanHeaders(headersFromProtocol(params.headers));
      const pending = this.pending.get(requestId);
      if (pending) pending.requestHeaders = headers;
      else this.extraRequestHeaders.set(requestId, headers);
      return;
    }

    if (method === 'Network.responseReceived') {
      const pending = this.pending.get(requestId);
      if (pending) this.applyResponse(pending, params.response ?? {});
      return;
    }

    if (method === 'Network.responseReceivedExtraInfo') {
      const headers = this.cleanHeaders(headersFromProtocol(params.headers));
      const pending = this.pending.get(requestId);
      if (pending) pending.responseHeaders = mergeHeaders(pending.responseHeaders, headers);
      else this.extraResponseHeaders.set(requestId, headers);
      return;
    }

    if (method === 'Network.loadingFinished') {
      const pending = this.pending.get(requestId);
      if (pending) pending.responseSize = Number(params.encodedDataLength ?? 0);
      this.finalize(requestId, Number(params.timestamp));
      return;
    }

    if (method === 'Network.loadingFailed') {
      const pending = this.pending.get(requestId);
      if (pending) pending.error = this.cleanString(failureDescription(params));
      this.finalize(requestId, Number(params.timestamp));
    }
  };

  private readonly handleDetach = (source: chrome.debugger.Debuggee, reason: string): void => {
    if (source.tabId !== this.tabId) return;
    this.removeListeners();
    this.tabId = null;
    this.onUnexpectedDetach?.(reason);
  };

  private applyResponse(pending: PendingRequest, response: Record<string, any>): void {
    pending.status = Number(response.status ?? 0);
    pending.statusText = this.cleanString(String(response.statusText ?? ''));
    pending.mimeType = this.cleanString(String(response.mimeType ?? ''));
    pending.responseHeaders = mergeHeaders(
      this.cleanHeaders(headersFromProtocol(response.headers)),
      this.extraResponseHeaders.get(pending.requestId) ?? [],
    );
    this.extraResponseHeaders.delete(pending.requestId);
  }

  private finalize(requestId: string, monotonicEnd: number): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    const parsed = parseUrl(pending.url);
    const sanitized = sanitizeNetworkEvent({
      requestId: pending.requestId,
      timestamp: pending.timestamp,
      method: pending.method,
      url: pending.url,
      host: parsed.host,
      path: parsed.path,
      query: parsed.query,
      status: pending.status,
      statusText: pending.statusText,
      duration: Math.max(0, (monotonicEnd - pending.monotonicStart) * 1000),
      requestHeaders: pending.requestHeaders,
      responseHeaders: pending.responseHeaders,
      mimeType: pending.mimeType,
      resourceType: pending.resourceType,
      requestSize: pending.requestSize,
      responseSize: pending.responseSize,
      error: pending.error,
      initiator: pending.initiator,
    });
    this.redactionCount += sanitized.redactionCount;
    this.completed.push(sanitized.value);
  }

  private cleanHeaders(headers: HeaderEntry[]): HeaderEntry[] {
    const sanitized = sanitizeHeaders(headers);
    this.redactionCount += sanitized.redactionCount;
    return sanitized.value;
  }

  private cleanString(value: string): string {
    const sanitized = sanitizeString(value);
    this.redactionCount += sanitized.redactionCount;
    return sanitized.value;
  }

  private cleanUrl(value: string): string {
    const sanitized = sanitizeUrl(value);
    this.redactionCount += sanitized.redactionCount;
    return sanitized.value;
  }

  private cleanUrlOrString(value: string): string | undefined {
    if (!value) return undefined;
    return /^https?:\/\//i.test(value) ? this.cleanUrl(value) : this.cleanString(value);
  }

  private removeListeners(): void {
    chrome.debugger.onEvent.removeListener(this.handleEvent);
    chrome.debugger.onDetach.removeListener(this.handleDetach);
  }
}

function headersFromProtocol(headers: Record<string, unknown> | undefined): HeaderEntry[] {
  if (!headers) return [];
  return Object.entries(headers).flatMap(([name, rawValue]) => {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    return values.map((value) => ({ name, value: String(value ?? '') }));
  });
}

function mergeHeaders(primary: HeaderEntry[], extra: HeaderEntry[]): HeaderEntry[] {
  const extraNames = new Set(extra.map((header) => header.name.toLowerCase()));
  return [...primary.filter((header) => !extraNames.has(header.name.toLowerCase())), ...extra];
}

function estimateRequestSize(request: Record<string, any>): number {
  const headers = headersFromProtocol(request.headers);
  return request.method.length + String(request.url ?? '').length + headers.reduce((total, header) => total + header.name.length + header.value.length + 4, 0);
}

function extractInitiator(initiator: Record<string, any> | undefined): string {
  if (!initiator) return '';
  const directUrl = String(initiator.url ?? '');
  if (directUrl) return directUrl;
  const callFrames = initiator.stack?.callFrames;
  if (Array.isArray(callFrames)) {
    const frame = callFrames.find((candidate) => candidate?.url);
    if (frame?.url) return String(frame.url);
  }
  return String(initiator.type ?? '');
}

function failureDescription(params: Record<string, any>): string {
  const parts = [String(params.errorText ?? 'Network request failed')];
  if (params.canceled) parts.push('aborted');
  if (params.blockedReason) parts.push(`blocked: ${String(params.blockedReason)}`);
  return parts.join(' · ');
}

function parseUrl(input: string): { host: string; path: string; query: string } {
  try {
    const url = new URL(input);
    return { host: url.host, path: url.pathname, query: url.search.slice(1) };
  } catch {
    return { host: '', path: input, query: '' };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
