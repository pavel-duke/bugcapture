import type { CaptureResult, HeaderEntry, NetworkEvent } from '../types';
import { sanitizeCaptureResult } from '../sanitizer';

export function createSafeHar(result: CaptureResult): string {
  const safeResult = sanitizeCaptureResult(result).value;
  const har = {
    log: {
      version: '1.2',
      creator: { name: 'BugCapture', version: safeResult.metadata.extensionVersion },
      pages: [
        {
          startedDateTime: new Date(safeResult.metadata.startTime).toISOString(),
          id: safeResult.metadata.sessionId,
          title: safeResult.metadata.pageTitle,
          pageTimings: {},
        },
      ],
      entries: safeResult.network.map((event) => toHarEntry(event, safeResult.metadata.sessionId)),
      comment: 'Safe HAR: bodies and cookies are not stored; sensitive values are redacted.',
    },
  };
  return `${JSON.stringify(har, null, 2)}\n`;
}

function toHarEntry(event: NetworkEvent, pageRef: string) {
  const startedDateTime = new Date(event.timestamp).toISOString();
  const requestHeadersSize = estimateHeadersSize(event.requestHeaders);
  const responseHeadersSize = estimateHeadersSize(event.responseHeaders);
  return {
    pageref: pageRef,
    startedDateTime,
    time: Math.max(0, event.duration),
    request: {
      method: event.method,
      url: event.url,
      httpVersion: 'HTTP/1.1',
      cookies: [],
      headers: event.requestHeaders,
      queryString: queryToHar(event.url),
      headersSize: requestHeadersSize,
      bodySize: -1,
      comment: 'Request body intentionally omitted by BugCapture.',
    },
    response: {
      status: event.status,
      statusText: event.statusText,
      httpVersion: 'HTTP/1.1',
      cookies: [],
      headers: event.responseHeaders,
      content: {
        size: event.responseSize,
        mimeType: event.mimeType || 'application/octet-stream',
        comment: 'Response body intentionally omitted by BugCapture.',
      },
      redirectURL: headerValue(event.responseHeaders, 'location'),
      headersSize: responseHeadersSize,
      bodySize: event.responseSize || -1,
      _error: event.error || undefined,
    },
    cache: {},
    timings: {
      send: 0,
      wait: Math.max(0, event.duration),
      receive: 0,
    },
    serverIPAddress: '',
    connection: '',
    _resourceType: event.resourceType,
    _initiator: event.initiator || undefined,
  };
}

function queryToHar(input: string): HeaderEntry[] {
  try {
    return [...new URL(input).searchParams.entries()].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

function estimateHeadersSize(headers: HeaderEntry[]): number {
  if (!headers.length) return -1;
  return headers.reduce((total, header) => total + header.name.length + header.value.length + 4, 2);
}

function headerValue(headers: HeaderEntry[], name: string): string {
  return headers.find((header) => header.name.toLowerCase() === name)?.value ?? '';
}
