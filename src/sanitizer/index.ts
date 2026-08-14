import type { ConsoleEvent, HeaderEntry, NetworkEvent } from '../types';

export const REDACTED = '[REDACTED]';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
  'x-xsrf-token',
]);

const SENSITIVE_PARAMETERS = new Set([
  'password',
  'passwd',
  'pwd',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'session',
  'session_id',
  'sessionid',
  'csrf',
  'xsrf',
]);

const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, replacement: `Bearer ${REDACTED}` },
  { pattern: /\bBasic\s+[A-Za-z0-9+/=]{8,}/gi, replacement: `Basic ${REDACTED}` },
  { pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, replacement: REDACTED },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/gi, replacement: REDACTED },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, replacement: REDACTED },
  { pattern: /\b\d{8,10}:AA[A-Za-z0-9_-]{25,}\b/g, replacement: REDACTED },
  { pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, replacement: REDACTED },
  { pattern: /\b[A-Za-z0-9_-]{40,}\b/g, replacement: REDACTED },
];

export interface Sanitized<T> {
  value: T;
  redactionCount: number;
}

export function sanitizeString(input: string): Sanitized<string> {
  let value = input;
  let redactionCount = 0;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    value = value.replace(pattern, (match) => {
      if (match.includes(REDACTED)) return match;
      redactionCount += 1;
      return replacement;
    });
  }
  return { value, redactionCount };
}

export function sanitizeHeaders(headers: HeaderEntry[]): Sanitized<HeaderEntry[]> {
  let redactionCount = 0;
  const value = headers.map((header) => {
    if (SENSITIVE_HEADERS.has(header.name.toLowerCase())) {
      redactionCount += header.value === REDACTED ? 0 : 1;
      return { ...header, value: REDACTED };
    }
    const sanitized = sanitizeString(header.value);
    redactionCount += sanitized.redactionCount;
    return { ...header, value: sanitized.value };
  });
  return { value, redactionCount };
}

export function sanitizeUrl(input: string): Sanitized<string> {
  try {
    const url = new URL(input);
    let redactionCount = 0;
    const safeParameters = new URLSearchParams();
    for (const [name, rawValue] of url.searchParams.entries()) {
      if (SENSITIVE_PARAMETERS.has(name.toLowerCase())) {
        safeParameters.append(name, REDACTED);
        redactionCount += rawValue === REDACTED ? 0 : 1;
      } else {
        const sanitized = sanitizeString(rawValue);
        safeParameters.append(name, sanitized.value);
        redactionCount += sanitized.redactionCount;
      }
    }
    url.search = safeParameters.toString();
    const safeUrl = sanitizeString(url.toString());
    return {
      value: safeUrl.value.replaceAll('%5BREDACTED%5D', REDACTED),
      redactionCount: redactionCount + safeUrl.redactionCount,
    };
  } catch {
    return sanitizeString(input);
  }
}

export function sanitizeNetworkEvent(event: NetworkEvent): Sanitized<NetworkEvent> {
  const url = sanitizeUrl(event.url);
  const requestHeaders = sanitizeHeaders(event.requestHeaders);
  const responseHeaders = sanitizeHeaders(event.responseHeaders);
  const error = sanitizeString(event.error);
  const parsed = safeUrlParts(url.value);
  return {
    value: {
      ...event,
      url: url.value,
      host: parsed.host,
      path: parsed.path,
      query: parsed.query,
      requestHeaders: requestHeaders.value,
      responseHeaders: responseHeaders.value,
      error: error.value,
    },
    redactionCount: url.redactionCount + requestHeaders.redactionCount + responseHeaders.redactionCount + error.redactionCount,
  };
}

export function sanitizeConsoleEvent(event: ConsoleEvent): Sanitized<ConsoleEvent> {
  const message = sanitizeString(event.message);
  const source = sanitizeString(event.source ?? '');
  return {
    value: { ...event, message: message.value, source: source.value || undefined },
    redactionCount: message.redactionCount + source.redactionCount,
  };
}

export function safeUrlParts(input: string): { host: string; path: string; query: string } {
  try {
    const url = new URL(input);
    return { host: url.host, path: url.pathname, query: url.search.slice(1).replaceAll('%5BREDACTED%5D', REDACTED) };
  } catch {
    return { host: '', path: input, query: '' };
  }
}
