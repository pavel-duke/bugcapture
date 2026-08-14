import type { CaptureResult, ConsoleEvent, HeaderEntry, NetworkEvent, TimelineEvent } from '../types';

export const REDACTED = '[REDACTED]';
export const TRUNCATED = '[TRUNCATED]';

const MAX_STRING_LENGTH = 20_000;
const MAX_DEPTH = 6;
const MAX_COLLECTION_ITEMS = 60;
const MAX_TOTAL_ITEMS = 400;

const SENSITIVE_FIELD_TERMS = new Set([
  'authorization',
  'auth',
  'authentication',
  'token',
  'ticket',
  'tvm',
  'blackbox',
  'secret',
  'key',
  'credential',
  'password',
  'passwd',
  'pwd',
  'session',
  'cookie',
  'csrf',
  'xsrf',
  'signature',
  'sign',
  'private',
  'bearer',
]);

const SENSITIVE_COMPOUND_NAMES = new Set([
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'serviceticket',
  'userticket',
  'apikey',
  'sessionid',
]);

export const SAFE_FIELD_ALLOWLIST = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'content-length',
  'content-type',
  'etag',
  'if-modified-since',
  'if-none-match',
  'last-modified',
  'request-id',
  'traceparent',
  'tracestate',
  'user-agent',
  'x-correlation-id',
  'x-request-id',
]);

const URL_VALUE_HEADERS = new Set(['location', 'origin', 'referer', 'referrer']);

const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: `Bearer ${REDACTED}` },
  { pattern: /\bBasic\s+[A-Za-z0-9+/=]{8,}/gi, replacement: `Basic ${REDACTED}` },
  { pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, replacement: REDACTED },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/gi, replacement: REDACTED },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, replacement: REDACTED },
  { pattern: /\b\d{8,10}:AA[A-Za-z0-9_-]{25,}\b/g, replacement: REDACTED },
  { pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, replacement: REDACTED },
  { pattern: /\bya29\.[A-Za-z0-9_-]{20,}\b/g, replacement: REDACTED },
  { pattern: /\b1\/\/[A-Za-z0-9_-]{20,}\b/g, replacement: REDACTED },
  {
    pattern: /\b((?:access|refresh)[_-]?token\s*[:=]\s*)[A-Za-z0-9._~+/=-]{12,}/gi,
    replacement: `$1${REDACTED}`,
  },
];

export interface Sanitized<T> {
  value: T;
  redactionCount: number;
}

export interface StructuredSanitizerOptions {
  maxDepth?: number;
  maxCollectionItems?: number;
  maxTotalItems?: number;
  maxStringLength?: number;
  safeFieldAllowlist?: Iterable<string>;
}

interface SanitizerState {
  readonly seen: WeakSet<object>;
  readonly options: Required<Omit<StructuredSanitizerOptions, 'safeFieldAllowlist'>>;
  readonly safeFieldAllowlist: Set<string>;
  redactionCount: number;
  remainingItems: number;
}

export function isSensitiveFieldName(name: string, safeFieldAllowlist: Iterable<string> = SAFE_FIELD_ALLOWLIST): boolean {
  const normalized = normalizeFieldName(name);
  const allowlist = safeFieldAllowlist instanceof Set ? safeFieldAllowlist : new Set(safeFieldAllowlist);
  if ([...allowlist].some((safeName) => normalizeFieldName(safeName) === normalized)) return false;

  const tokens = splitFieldName(name);
  const compact = tokens.join('');
  return tokens.some((token) => SENSITIVE_FIELD_TERMS.has(token)) || SENSITIVE_COMPOUND_NAMES.has(compact);
}

export function sanitizeString(input: string): Sanitized<string> {
  let value = truncate(input, MAX_STRING_LENGTH);
  let redactionCount = 0;

  const direct = sanitizeKnownPatterns(value);
  value = direct.value;
  redactionCount += direct.redactionCount;

  if (/%[0-9a-f]{2}/i.test(value)) {
    const decoded = safelyDecode(value);
    if (decoded !== value) {
      const encoded = sanitizeKnownPatterns(decoded);
      if (encoded.redactionCount > 0) {
        value = encoded.value;
        redactionCount += encoded.redactionCount;
      }
    }
  }

  const random = value.replace(/\b[A-Za-z0-9_+/=-]{32,256}\b/g, (candidate) => {
    if (candidate.includes(REDACTED) || !looksLikeRandomCredential(candidate)) return candidate;
    redactionCount += 1;
    return REDACTED;
  });

  return { value: random, redactionCount };
}

export function sanitizeHeaders(
  headers: HeaderEntry[],
  safeFieldAllowlist: Iterable<string> = SAFE_FIELD_ALLOWLIST,
): Sanitized<HeaderEntry[]> {
  let redactionCount = 0;
  const value = headers.slice(0, MAX_COLLECTION_ITEMS).map((header) => {
    const name = truncate(String(header.name), 256);
    const rawValue = truncate(String(header.value), MAX_STRING_LENGTH);
    if (isSensitiveFieldName(name, safeFieldAllowlist)) {
      redactionCount += rawValue === REDACTED ? 0 : 1;
      return { name, value: REDACTED };
    }
    const sanitized = URL_VALUE_HEADERS.has(name.toLowerCase()) ? sanitizeUrl(rawValue) : sanitizeString(rawValue);
    redactionCount += sanitized.redactionCount;
    return { name, value: sanitized.value };
  });
  return { value, redactionCount };
}

export function sanitizeUrl(input: string, nestingDepth = 0): Sanitized<string> {
  const limitedInput = truncate(input, MAX_STRING_LENGTH);
  try {
    const url = new URL(limitedInput);
    let redactionCount = 0;

    if (url.username) {
      redactionCount += url.username === REDACTED ? 0 : 1;
      url.username = REDACTED;
    }
    if (url.password) {
      redactionCount += url.password === REDACTED ? 0 : 1;
      url.password = REDACTED;
    }

    const query = sanitizeParameters(url.searchParams, nestingDepth);
    url.search = query.value.toString();
    redactionCount += query.redactionCount;

    const fragment = sanitizeFragment(url.hash.slice(1), nestingDepth);
    url.hash = fragment.value ? `#${fragment.value}` : '';
    redactionCount += fragment.redactionCount;

    const safeUrl = sanitizeKnownPatterns(url.toString());
    return {
      value: restoreRedactionMarker(safeUrl.value),
      redactionCount: redactionCount + safeUrl.redactionCount,
    };
  } catch {
    return sanitizeString(limitedInput);
  }
}

export function sanitizeStructuredValue(input: unknown, options: StructuredSanitizerOptions = {}): Sanitized<unknown> {
  const state = createState(options);
  const value = normalizeUnknown(input, state, 0);
  return { value, redactionCount: state.redactionCount };
}

export function sanitizeConsoleValue(input: unknown, options: StructuredSanitizerOptions = {}): Sanitized<string> {
  const sanitized = sanitizeStructuredValue(input, options);
  const maxLength = options.maxStringLength ?? MAX_STRING_LENGTH;
  const value = typeof sanitized.value === 'string' ? sanitized.value : safeJsonStringify(sanitized.value);
  return { value: truncate(value, maxLength), redactionCount: sanitized.redactionCount };
}

export function sanitizeNetworkEvent(event: NetworkEvent): Sanitized<NetworkEvent> {
  const url = sanitizeUrl(event.url);
  const requestHeaders = sanitizeHeaders(event.requestHeaders);
  const responseHeaders = sanitizeHeaders(event.responseHeaders);
  const statusText = sanitizeString(event.statusText);
  const mimeType = sanitizeString(event.mimeType);
  const resourceType = sanitizeString(event.resourceType);
  const error = sanitizeString(event.error);
  const initiator = sanitizeUrlOrString(event.initiator ?? '');
  const parsed = safeUrlParts(url.value);
  return {
    value: {
      ...event,
      method: truncate(event.method, 32),
      url: url.value,
      host: parsed.host,
      path: parsed.path,
      query: parsed.query,
      requestHeaders: requestHeaders.value,
      responseHeaders: responseHeaders.value,
      statusText: statusText.value,
      mimeType: mimeType.value,
      resourceType: resourceType.value,
      error: error.value,
      initiator: initiator.value || undefined,
    },
    redactionCount:
      url.redactionCount +
      requestHeaders.redactionCount +
      responseHeaders.redactionCount +
      statusText.redactionCount +
      mimeType.redactionCount +
      resourceType.redactionCount +
      error.redactionCount +
      initiator.redactionCount,
  };
}

export function sanitizeConsoleEvent(event: ConsoleEvent): Sanitized<ConsoleEvent> {
  const message = sanitizeConsoleValue(event.message);
  const source = sanitizeUrlOrString(event.source ?? '');
  return {
    value: { ...event, message: message.value, source: source.value || undefined },
    redactionCount: message.redactionCount + source.redactionCount,
  };
}

export function sanitizeCaptureResult(result: CaptureResult): Sanitized<CaptureResult> {
  let redactionCount = 0;
  const pageUrl = sanitizeUrl(result.metadata.pageUrl);
  const pageTitle = sanitizeString(result.metadata.pageTitle);
  const browserName = sanitizeString(result.metadata.browser.name);
  const browserVersion = sanitizeString(result.metadata.browser.version);
  const browserOs = sanitizeString(result.metadata.browser.os);
  const browserUserAgent = sanitizeString(result.metadata.browser.userAgent);
  const network = result.network.slice(0, 5_000).map((event) => collect(sanitizeNetworkEvent(event)));
  const consoleEvents = result.console.slice(0, 1_000).map((event) => collect(sanitizeConsoleEvent(event)));
  const timeline = result.timeline.slice(0, 6_000).map((event) => sanitizeTimelineEvent(event));
  const baseFilename = sanitizeString(result.baseFilename);

  function collect<T>(sanitized: Sanitized<T>): T {
    redactionCount += sanitized.redactionCount;
    return sanitized.value;
  }

  redactionCount +=
    pageUrl.redactionCount +
    pageTitle.redactionCount +
    browserName.redactionCount +
    browserVersion.redactionCount +
    browserOs.redactionCount +
    browserUserAgent.redactionCount +
    baseFilename.redactionCount;

  return {
    value: {
      ...result,
      metadata: {
        ...result.metadata,
        pageUrl: pageUrl.value,
        pageTitle: pageTitle.value,
        browser: {
          name: browserName.value,
          version: browserVersion.value,
          os: browserOs.value,
          userAgent: browserUserAgent.value,
        },
      },
      network,
      console: consoleEvents,
      timeline,
      redactionCount: result.redactionCount + redactionCount,
      baseFilename: baseFilename.value,
    },
    redactionCount,
  };

  function sanitizeTimelineEvent(event: TimelineEvent): TimelineEvent {
    const text = sanitizeString(event.text);
    redactionCount += text.redactionCount;
    return { ...event, text: text.value };
  }
}

export function safeUrlParts(input: string): { host: string; path: string; query: string } {
  try {
    const url = new URL(input);
    return { host: url.host, path: url.pathname, query: restoreRedactionMarker(url.search.slice(1)) };
  } catch {
    return { host: '', path: input, query: '' };
  }
}

function sanitizeKnownPatterns(input: string): Sanitized<string> {
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

function sanitizeParameters(parameters: URLSearchParams, nestingDepth: number): Sanitized<URLSearchParams> {
  let redactionCount = 0;
  const value = new URLSearchParams();
  for (const [name, rawValue] of parameters.entries()) {
    if (isSensitiveFieldName(name)) {
      value.append(name, REDACTED);
      redactionCount += rawValue === REDACTED ? 0 : 1;
      continue;
    }
    const sanitized = sanitizeParameterValue(rawValue, nestingDepth);
    value.append(name, sanitized.value);
    redactionCount += sanitized.redactionCount;
  }
  return { value, redactionCount };
}

function sanitizeParameterValue(input: string, nestingDepth: number): Sanitized<string> {
  if (nestingDepth < 3) {
    const decoded = decodeRepeatedly(input);
    if (/^https?:\/\//i.test(decoded)) return sanitizeUrl(decoded, nestingDepth + 1);
  }
  return sanitizeString(input);
}

function sanitizeFragment(fragment: string, nestingDepth: number): Sanitized<string> {
  if (!fragment) return { value: '', redactionCount: 0 };
  const decoded = safelyDecode(fragment);
  const questionMark = decoded.indexOf('?');
  if (questionMark >= 0) {
    const prefix = decoded.slice(0, questionMark);
    const query = sanitizeParameters(new URLSearchParams(decoded.slice(questionMark + 1)), nestingDepth + 1);
    const safePrefix = sanitizeString(prefix);
    return {
      value: `${safePrefix.value}?${restoreRedactionMarker(query.value.toString())}`,
      redactionCount: safePrefix.redactionCount + query.redactionCount,
    };
  }
  if (decoded.includes('=')) {
    const parameters = sanitizeParameters(new URLSearchParams(decoded), nestingDepth + 1);
    return { value: restoreRedactionMarker(parameters.value.toString()), redactionCount: parameters.redactionCount };
  }
  return sanitizeString(decoded);
}

function sanitizeUrlOrString(input: string): Sanitized<string> {
  return /^https?:\/\//i.test(input) ? sanitizeUrl(input) : sanitizeString(input);
}

function createState(options: StructuredSanitizerOptions): SanitizerState {
  return {
    seen: new WeakSet(),
    options: {
      maxDepth: options.maxDepth ?? MAX_DEPTH,
      maxCollectionItems: options.maxCollectionItems ?? MAX_COLLECTION_ITEMS,
      maxTotalItems: options.maxTotalItems ?? MAX_TOTAL_ITEMS,
      maxStringLength: options.maxStringLength ?? MAX_STRING_LENGTH,
    },
    safeFieldAllowlist: new Set(options.safeFieldAllowlist ?? SAFE_FIELD_ALLOWLIST),
    redactionCount: 0,
    remainingItems: options.maxTotalItems ?? MAX_TOTAL_ITEMS,
  };
}

function normalizeUnknown(value: unknown, state: SanitizerState, depth: number, fieldName?: string): unknown {
  if (fieldName && isSensitiveFieldName(fieldName, state.safeFieldAllowlist)) {
    if (value !== undefined && value !== null && value !== '' && value !== REDACTED) state.redactionCount += 1;
    return REDACTED;
  }
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol' || typeof value === 'function') return `[${typeof value}]`;
  if (typeof value === 'string') {
    const limited = truncate(value, state.options.maxStringLength);
    if (depth < state.options.maxDepth && looksLikeJson(limited)) {
      try {
        return normalizeUnknown(JSON.parse(limited), state, depth + 1, fieldName);
      } catch {
        // Это обычная строка, а не JSON.
      }
    }
    const sanitized = /^https?:\/\//i.test(limited) ? sanitizeUrl(limited) : sanitizeString(limited);
    state.redactionCount += sanitized.redactionCount;
    return sanitized.value;
  }
  if (depth >= state.options.maxDepth) return '[Max depth]';
  if (state.remainingItems <= 0) return TRUNCATED;
  if (typeof value !== 'object') return String(value);
  if (state.seen.has(value)) return '[Circular]';
  state.seen.add(value);

  if (value instanceof Error) {
    return normalizeUnknown({ name: value.name, message: value.message, stack: value.stack }, state, depth + 1);
  }
  if (value instanceof URL) {
    const sanitized = sanitizeUrl(value.toString());
    state.redactionCount += sanitized.redactionCount;
    return sanitized.value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Object.prototype.toString.call(value) === '[object Promise]') return '[Promise]';
  if (value instanceof Map) {
    return [...value.entries()].slice(0, state.options.maxCollectionItems).map(([key, nested]) => [
      normalizeUnknown(key, state, depth + 1),
      normalizeUnknown(nested, state, depth + 1, typeof key === 'string' ? key : undefined),
    ]);
  }
  if (value instanceof Set) {
    return normalizeUnknown([...value.values()].slice(0, state.options.maxCollectionItems), state, depth + 1);
  }
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (const item of value.slice(0, state.options.maxCollectionItems)) {
      if (state.remainingItems-- <= 0) break;
      result.push(normalizeUnknown(item, state, depth + 1));
    }
    if (value.length > result.length) result.push(TRUNCATED);
    return result;
  }

  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors).slice(0, state.options.maxCollectionItems)) {
    if (state.remainingItems-- <= 0) break;
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    result[key] = 'value' in descriptor ? normalizeUnknown(descriptor.value, state, depth + 1, key) : '[Getter]';
  }
  if (Object.keys(descriptors).length > Object.keys(result).length) result._truncated = TRUNCATED;
  return result;
}

function splitFieldName(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((token) => token !== 'x');
}

function normalizeFieldName(name: string): string {
  return splitFieldName(name).join('-');
}

function looksLikeRandomCredential(value: string): boolean {
  if (/^[0-9a-f]{32,}$/i.test(value)) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return false;
  const classes = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[_+/=-]/.test(value)].filter(Boolean).length;
  return classes >= 3;
}

function safelyDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeRepeatedly(value: string): string {
  let decoded = value;
  for (let index = 0; index < 2; index += 1) {
    const next = safelyDecode(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function restoreRedactionMarker(value: string): string {
  return value.replace(/%5B(?:REDACTED)%5D/gi, REDACTED);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}${TRUNCATED}` : value;
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
