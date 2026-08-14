export type CaptureStatus = 'idle' | 'starting' | 'recording' | 'processing' | 'completed' | 'error';

export interface BrowserTab {
  id: number;
  url: string;
  title: string;
  hostname: string;
  windowId: number;
}

export interface BrowserInfo {
  name: string;
  version: string;
  os: string;
  userAgent: string;
}

export interface HeaderEntry {
  name: string;
  value: string;
}

export interface NetworkEvent {
  requestId: string;
  timestamp: number;
  method: string;
  url: string;
  host: string;
  path: string;
  query: string;
  status: number;
  statusText: string;
  duration: number;
  requestHeaders: HeaderEntry[];
  responseHeaders: HeaderEntry[];
  mimeType: string;
  resourceType: string;
  requestSize: number;
  responseSize: number;
  error: string;
  initiator?: string;
}

export type ConsoleLevel = 'error' | 'warn' | 'page-error' | 'unhandled-rejection';

export interface ConsoleEvent {
  timestamp: number;
  level: ConsoleLevel;
  message: string;
  source?: string;
  line?: number;
  column?: number;
}

export interface TimelineEvent {
  timestamp: number;
  type: 'recording' | 'network' | 'console' | 'marker';
  text: string;
}

export interface SessionMetadata {
  sessionId: string;
  startTime: number;
  endTime: number;
  duration: number;
  pageUrl: string;
  pageTitle: string;
  browser: BrowserInfo;
  viewport: { width: number; height: number; devicePixelRatio: number };
  extensionVersion: string;
}

export interface CaptureResult {
  metadata: SessionMetadata;
  network: NetworkEvent[];
  console: ConsoleEvent[];
  timeline: TimelineEvent[];
  redactionCount: number;
  baseFilename: string;
}

export interface CaptureSummary {
  status: CaptureStatus;
  startedAt?: number;
  duration: number;
  requestCount: number;
  httpErrorCount: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  currentTab?: BrowserTab;
  browser?: BrowserInfo;
  result?: CaptureResult;
  error?: string;
  downloadsStarted?: boolean;
}

export type ArtifactKind = 'video' | 'report' | 'har';

export type RuntimeRequest =
  | { type: 'GET_STATUS' }
  | { type: 'START_CAPTURE' }
  | { type: 'STOP_CAPTURE' }
  | { type: 'MARK_PROBLEM' }
  | { type: 'DOWNLOAD_ARTIFACT'; kind: ArtifactKind }
  | { type: 'DOWNLOAD_ALL' }
  | { type: 'CONTENT_EVENT'; sessionId: string; event: ConsoleEvent }
  | { type: 'OFFSCREEN_READY'; target: 'background' }
  | { type: 'RECORDING_STARTED'; target: 'background' };

export interface RuntimeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
