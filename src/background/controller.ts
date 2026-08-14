import { browserAdapter } from '../browser/chromium';
import { createSafeHar } from '../har';
import { NetworkCollector } from '../network/collector';
import { createTextReport } from '../report/text';
import { sanitizeCaptureResult, sanitizeConsoleEvent, sanitizeNetworkEvent, sanitizeString, sanitizeUrl } from '../sanitizer';
import type {
  ArtifactKind,
  BrowserInfo,
  BrowserTab,
  CaptureResult,
  CaptureStatus,
  CaptureSummary,
  ConsoleEvent,
  RuntimeRequest,
  SessionMetadata,
  TimelineEvent,
} from '../types';
import { BUGCAPTURE_VERSION } from '../generated/version';

interface ActiveSession {
  id: string;
  startTime: number;
  tab: BrowserTab;
  browser: BrowserInfo;
  viewport: { width: number; height: number; devicePixelRatio: number };
  console: ConsoleEvent[];
  timeline: TimelineEvent[];
  redactionCount: number;
  baseFilename: string;
}

interface OffscreenResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface PreparedArtifact {
  url: string;
  filename: string;
}

export class CaptureController {
  private status: CaptureStatus = 'idle';
  private session: ActiveSession | null = null;
  private result: CaptureResult | null = null;
  private error = '';
  private downloadsStarted = false;
  private networkWarning = '';
  private readonly network = new NetworkCollector((reason) => {
    this.networkWarning = `Сбор Network был отключён браузером: ${reason}`;
  });

  async getSummary(): Promise<CaptureSummary> {
    let currentTab = this.session?.tab;
    let browser = this.session?.browser;
    if (!currentTab) {
      try {
        [currentTab, browser] = await Promise.all([browserAdapter.getCurrentTab(), browserAdapter.getBrowserInfo()]);
      } catch (error) {
        this.error = errorMessage(error);
      }
    }
    const networkStats = this.network.getStats();
    const now = Date.now();
    return {
      status: this.status,
      startedAt: this.session?.startTime,
      duration: this.result?.metadata.duration ?? (this.session ? now - this.session.startTime : 0),
      requestCount: this.result?.network.length ?? networkStats.requestCount,
      httpErrorCount: this.result?.network.filter((event) => event.status >= 400 || event.error).length ?? networkStats.httpErrorCount,
      consoleErrorCount:
        this.result?.console.filter((event) => event.level !== 'warn').length ??
        this.session?.console.filter((event) => event.level !== 'warn').length ??
        0,
      consoleWarningCount:
        this.result?.console.filter((event) => event.level === 'warn').length ??
        this.session?.console.filter((event) => event.level === 'warn').length ??
        0,
      currentTab,
      browser,
      result: this.result ?? undefined,
      error: this.networkWarning || this.error || undefined,
      downloadsStarted: this.downloadsStarted,
    };
  }

  async start(): Promise<CaptureSummary> {
    if (this.status === 'starting' || this.status === 'recording' || this.status === 'processing') {
      throw new Error('Запись уже запущена.');
    }
    this.status = 'starting';
    this.error = '';
    this.networkWarning = '';
    this.result = null;
    this.downloadsStarted = false;
    await this.updateBadge();

    let tab: BrowserTab | undefined;
    try {
      tab = await browserAdapter.getCurrentTab();
      const [browser, viewport] = await Promise.all([
        browserAdapter.getBrowserInfo(),
        browserAdapter.getViewport(tab.id),
        browserAdapter.ensureOffscreenDocument(),
      ]).then(([browserInfo, viewportInfo]) => [browserInfo, viewportInfo] as const);
      const startTime = Date.now();
      const session: ActiveSession = {
        id: crypto.randomUUID(),
        startTime,
        tab,
        browser,
        viewport,
        console: [],
        timeline: [{ timestamp: startTime, type: 'recording', text: 'Запись началась' }],
        redactionCount: 0,
        baseFilename: createBaseFilename(startTime),
      };
      this.session = session;

      await this.ensureContentCapture(tab.id, session.id);
      await this.network.start(tab.id);
      const streamId = await browserAdapter.getMediaStreamId(tab.id);
      await this.sendOffscreen('START_RECORDING', {
        streamId,
        baseFilename: session.baseFilename,
      });

      this.status = 'recording';
      await this.updateBadge();
      return this.getSummary();
    } catch (error) {
      await this.cleanupFailedStart(tab?.id);
      this.status = 'error';
      this.error = errorMessage(error);
      this.session = null;
      await this.updateBadge();
      throw error;
    }
  }

  async stop(): Promise<CaptureSummary> {
    if (!this.session || this.status !== 'recording') throw new Error('Активная запись не найдена.');
    this.status = 'processing';
    await this.updateBadge();
    const session = this.session;
    const endTime = Date.now();

    try {
      await this.stopContentCapture(session.tab.id);
      const [rawNetwork] = await Promise.all([
        this.network.stop(),
        this.sendOffscreen('STOP_RECORDING'),
      ]);

      const safeNetwork = rawNetwork.map((event) => {
        const sanitized = sanitizeNetworkEvent(event);
        session.redactionCount += sanitized.redactionCount;
        return sanitized.value;
      });
      session.redactionCount += this.network.getRedactionCount();
      const pageUrl = sanitizeUrl(session.tab.url);
      const pageTitle = sanitizeString(session.tab.title);
      session.redactionCount += pageUrl.redactionCount + pageTitle.redactionCount;

      if (this.networkWarning) {
        const warning = sanitizeString(this.networkWarning);
        session.console.push({ timestamp: endTime, level: 'warn', message: warning.value });
        session.redactionCount += warning.redactionCount;
      }

      const metadata: SessionMetadata = {
        sessionId: session.id,
        startTime: session.startTime,
        endTime,
        duration: endTime - session.startTime,
        pageUrl: pageUrl.value,
        pageTitle: pageTitle.value,
        browser: session.browser,
        viewport: session.viewport,
        extensionVersion: BUGCAPTURE_VERSION,
      };
      const timeline = [
        ...session.timeline,
        ...safeNetwork
          .filter((event) => event.status >= 400 || event.error)
          .map<TimelineEvent>((event) => ({
            timestamp: event.timestamp,
            type: 'network',
            text: `${event.method} ${event.path} → ${event.status || event.error}`,
          })),
        { timestamp: endTime, type: 'recording' as const, text: 'Запись остановлена' },
      ].sort((a, b) => a.timestamp - b.timestamp);

      const finalResult = sanitizeCaptureResult({
        metadata,
        network: safeNetwork,
        console: session.console,
        timeline,
        redactionCount: session.redactionCount,
        baseFilename: session.baseFilename,
      });
      this.result = finalResult.value;
      const report = createTextReport(this.result);
      const har = createSafeHar(this.result);
      await this.sendOffscreen('STORE_TEXT_ARTIFACTS', {
        baseFilename: session.baseFilename,
        report,
        har,
      });

      this.status = 'completed';
      this.session = null;
      await this.updateBadge();
      return this.getSummary();
    } catch (error) {
      this.status = 'error';
      this.error = errorMessage(error);
      this.session = null;
      await this.updateBadge();
      throw error;
    }
  }

  addContentEvent(sessionId: string, event: ConsoleEvent): void {
    if (!this.session || this.status !== 'recording' || sessionId !== this.session.id) return;
    if (this.session.console.length >= 1_000) return;
    const sanitized = sanitizeConsoleEvent(event);
    this.session.console.push(sanitized.value);
    this.session.redactionCount += sanitized.redactionCount;
    this.session.timeline.push({
      timestamp: sanitized.value.timestamp,
      type: 'console',
      text: sanitized.value.level === 'warn' ? 'Console warning' : 'Console error',
    });
  }

  markProblem(): void {
    if (!this.session || this.status !== 'recording') throw new Error('Сначала начните запись.');
    this.session.timeline.push({ timestamp: Date.now(), type: 'marker', text: 'Пользователь отметил проблему' });
  }

  async download(kind?: ArtifactKind): Promise<void> {
    if (!this.result || this.status !== 'completed') throw new Error('Сначала завершите запись.');
    if (kind) {
      await this.downloadArtifact(kind);
      return;
    }
    await this.downloadAllArtifacts();
    this.downloadsStarted = true;
  }

  async handleTabUpdated(tabId: number): Promise<void> {
    if (this.status !== 'recording' || this.session?.tab.id !== tabId) return;
    try {
      await this.ensureContentCapture(tabId, this.session.id);
    } catch (error) {
      this.networkWarning = `После перехода на новую страницу Console не подключена: ${errorMessage(error)}`;
    }
  }

  getActiveTabId(): number | null {
    return this.session?.tab.id ?? null;
  }

  private async ensureContentCapture(tabId: number, sessionId: string): Promise<void> {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['assets/page-bridge.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['assets/content.js'], world: 'ISOLATED' });
    const response = await chrome.tabs.sendMessage(tabId, { type: 'CONTENT_START', sessionId });
    if (!response?.ok) throw new Error('Не удалось подключить сбор Console к странице.');
  }

  private async stopContentCapture(tabId: number): Promise<void> {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'CONTENT_STOP' });
    } catch {
      // Вкладка могла быть закрыта до остановки записи.
    }
  }

  private async cleanupFailedStart(tabId?: number): Promise<void> {
    if (tabId !== undefined) await this.stopContentCapture(tabId);
    await this.network.stop();
    try {
      await this.sendOffscreen('STOP_RECORDING');
    } catch {
      // MediaRecorder мог ещё не успеть запуститься.
    }
  }

  private async sendOffscreen(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    await browserAdapter.ensureOffscreenDocument();
    const response = (await chrome.runtime.sendMessage({ target: 'offscreen', action, ...payload })) as OffscreenResponse;
    if (!response?.ok) throw new Error(response?.error || `Offscreen command ${action} failed.`);
    return response.data;
  }

  private async downloadAllArtifacts(): Promise<void> {
    for (const kind of ['video', 'report', 'har'] as const) {
      await this.downloadArtifact(kind);
    }
  }

  private async downloadArtifact(kind: ArtifactKind): Promise<void> {
    const artifact = (await this.sendOffscreen('PREPARE_ARTIFACT', { kind })) as PreparedArtifact;
    if (!artifact?.url || !artifact.filename) throw new Error('Не удалось подготовить файл для скачивания.');
    await browserAdapter.downloadUrl(artifact.url, artifact.filename);
  }

  private async updateBadge(): Promise<void> {
    if (this.status === 'recording') {
      await chrome.action.setBadgeBackgroundColor({ color: '#e24b63' });
      await chrome.action.setBadgeText({ text: 'REC' });
      return;
    }
    await chrome.action.setBadgeText({ text: '' });
  }
}

export function isRuntimeRequest(message: unknown): message is RuntimeRequest {
  return typeof message === 'object' && message !== null && 'type' in message;
}

function createBaseFilename(timestamp: number): string {
  const date = new Date(timestamp);
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ];
  const time = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('');
  return `bugcapture-${parts.join('-')}-${time}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
