import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BUGCAPTURE_VERSION } from '../generated/version';
import type { ArtifactKind, CaptureSummary } from '../types';
import { popupClient, type PopupClient } from './client';

const EMPTY_SUMMARY: CaptureSummary = {
  status: 'idle',
  duration: 0,
  requestCount: 0,
  httpErrorCount: 0,
  consoleErrorCount: 0,
  consoleWarningCount: 0,
};

export interface AppProps {
  client?: PopupClient;
}

export function App({ client = popupClient }: AppProps) {
  const [summary, setSummary] = useState<CaptureSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSummary(await client.getStatus());
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    void client.getStatus()
      .then((nextSummary) => {
        if (active) setSummary(nextSummary);
      })
      .catch((error: unknown) => {
        if (active) setActionError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (summary.status !== 'recording' && summary.status !== 'processing') return;
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [refresh, summary.status]);

  const run = async (action: () => Promise<CaptureSummary>) => {
    setBusy(true);
    setActionError('');
    try {
      setSummary(await action());
    } catch (error) {
      setActionError(errorMessage(error));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const download = async (kind?: ArtifactKind) => {
    setBusy(true);
    setActionError('');
    try {
      await client.download(kind);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const isCaptureScreen = ['starting', 'recording', 'processing'].includes(summary.status);

  return (
    <main className="app">
      <Header recording={summary.status === 'recording'} />

      <div className="app-content">
        {loading ? (
          <LoadingView />
        ) : isCaptureScreen ? (
          <RecordingView
            summary={summary}
            busy={busy}
            onMark={() => void run(() => client.markProblem())}
            onStop={() => void run(() => client.stop())}
          />
        ) : summary.status === 'completed' && summary.result ? (
          <CompletedView summary={summary} busy={busy} onDownload={download} />
        ) : (
          <ReadyView summary={summary} busy={busy} onStart={() => void run(() => client.start())} />
        )}

        {(actionError || summary.error) && (
          <div className="alert" role="alert">
            <AlertIcon />
            <span>{actionError || summary.error}</span>
          </div>
        )}
      </div>

      <footer>
        <span className="local-indicator"><i />Локальная обработка</span>
        <span>v{BUGCAPTURE_VERSION}</span>
      </footer>
    </main>
  );
}

function Header({ recording }: { recording: boolean }) {
  return (
    <header className="header">
      <div className="brand">
        <BrandIcon />
        <div>
          <h1>BugCapture</h1>
          <p>DIAGNOSTIC RECORDER</p>
        </div>
      </div>
      <div className={recording ? 'header-status is-recording' : 'header-status'}>
        <i />{recording ? 'REC' : 'READY'}
      </div>
    </header>
  );
}

function LoadingView() {
  return (
    <section className="loading-view" aria-live="polite">
      <span className="loader" />
      <strong>Подключаемся к вкладке</strong>
      <p>Это займёт пару секунд</p>
    </section>
  );
}

function ReadyView({ summary, busy, onStart }: { summary: CaptureSummary; busy: boolean; onStart: () => void }) {
  return (
    <div className="ready-view">
      <section className="target-card">
        <div className="target-icon"><GlobeIcon /></div>
        <div className="target-copy">
          <span>ТЕКУЩАЯ ВКЛАДКА</span>
          <strong>{summary.currentTab?.hostname || 'Вкладка недоступна'}</strong>
          <p>{summary.currentTab?.title || 'Откройте обычную веб-страницу'}</p>
        </div>
        <div className="browser-chip">
          <span className="sr-only">Браузер: {summary.browser?.name || 'не определён'}</span>
          <span>{shortBrowserName(summary.browser?.name)}</span>
          <small>{shortVersion(summary.browser?.version)}</small>
        </div>
      </section>

      <div className="section-label">
        <span>ДИАГНОСТИЧЕСКИЙ ПАКЕТ</span>
        <span>3 ИСТОЧНИКА</span>
      </div>

      <section className="capture-grid">
        <CaptureSource icon={<ScreenIcon />} title="Экран" subtitle="WEBM" tone="violet" />
        <CaptureSource icon={<NetworkIcon />} title="Network" subtitle="HAR 1.2" tone="cyan" />
        <CaptureSource icon={<ConsoleIcon />} title="Console" subtitle="ERRORS" tone="amber" />
      </section>

      <section className="privacy-card">
        <div className="privacy-icon"><ShieldIcon /></div>
        <div>
          <strong>Конфиденциальные данные защищены</strong>
          <p>Токены, cookie и авторизация будут скрыты до сохранения.</p>
        </div>
        <span className="privacy-status">ON</span>
      </section>

      <button className="primary start-button" disabled={busy || !summary.currentTab} onClick={onStart}>
        <span className="record-button-icon" />
        <span>{busy ? 'Запускаем запись' : 'Начать запись'}</span>
        <ArrowIcon />
      </button>

      <p className="system-note">Браузер включит режим диагностики только для этой вкладки</p>
    </div>
  );
}

function CaptureSource({ icon, title, subtitle, tone }: { icon: ReactNode; title: string; subtitle: string; tone: string }) {
  return (
    <article className={`capture-source ${tone}`}>
      <div className="source-top">
        <span className="source-icon">{icon}</span>
        <span className="source-check"><CheckSmallIcon /></span>
      </div>
      <strong>{title}</strong>
      <small>{subtitle}</small>
    </article>
  );
}

function RecordingView({ summary, busy, onMark, onStop }: { summary: CaptureSummary; busy: boolean; onMark: () => void; onStop: () => void }) {
  const isProcessing = summary.status === 'processing' || summary.status === 'starting';
  return (
    <section className="recording-view" aria-live="polite">
      <div className="recording-heading">
        <span className={isProcessing ? 'recording-orb processing' : 'recording-orb'}><i /></span>
        <div>
          <span>{isProcessing ? 'ПОДГОТОВКА ФАЙЛОВ' : 'ЗАПИСЬ ИДЁТ'}</span>
          <strong>{summary.currentTab?.hostname}</strong>
        </div>
      </div>

      <div className="timer-block">
        <span className="scan-line" />
        <div className="timer">{formatDuration(summary.duration)}</div>
        <p>{isProcessing ? 'Очищаем и собираем отчёт' : 'Воспроизведите проблему во вкладке'}</p>
      </div>

      <div className="stats-grid">
        <LiveStat label="Запросы" value={summary.requestCount} icon={<NetworkIcon />} />
        <LiveStat label="HTTP ошибки" value={summary.httpErrorCount} icon={<AlertIcon />} danger />
        <LiveStat label="Console" value={summary.consoleErrorCount} icon={<ConsoleIcon />} danger />
      </div>

      {isProcessing ? (
        <div className="processing-panel"><span className="loader" /><span>Сохраняем безопасную копию</span></div>
      ) : (
        <div className="recording-actions">
          <button className="marker-button" disabled={busy} onClick={onMark}>
            <MarkerIcon />
            Отметить момент
          </button>
          <button className="stop-button" disabled={busy} onClick={onStop}>
            <span />
            {busy ? 'Останавливаем' : 'Завершить запись'}
          </button>
        </div>
      )}
    </section>
  );
}

function LiveStat({ label, value, icon, danger = false }: { label: string; value: number; icon: ReactNode; danger?: boolean }) {
  return (
    <article className={danger && value > 0 ? 'live-stat has-error' : 'live-stat'}>
      <div>{icon}<span>{label}</span></div>
      <strong>{value}</strong>
    </article>
  );
}

function CompletedView({ summary, busy, onDownload }: { summary: CaptureSummary; busy: boolean; onDownload: (kind?: ArtifactKind) => void }) {
  const result = summary.result!;
  return (
    <section className="completed-view">
      <div className="complete-heading">
        <div className="complete-icon"><CheckIcon /></div>
        <div>
          <span>СЕССИЯ ЗАВЕРШЕНА</span>
          <h2>Диагностика готова</h2>
        </div>
      </div>

      <div className="summary-strip">
        <SummaryItem value={formatDuration(summary.duration)} label="Длительность" />
        <SummaryItem value={summary.requestCount} label="Запросы" />
        <SummaryItem value={summary.httpErrorCount} label="HTTP ошибки" danger />
      </div>

      <div className="sanitized-row">
        <ShieldIcon />
        <span>Скрыто чувствительных значений</span>
        <strong>{result.redactionCount}</strong>
      </div>

      <div className="section-label files-label">
        <span>ГОТОВЫЕ ФАЙЛЫ</span>
        {summary.downloadsStarted && <span className="auto-badge">СКАЧИВАНИЕ НАЧАТО</span>}
      </div>

      <div className="artifact-list">
        <ArtifactButton kind="video" name="Запись экрана" format="WEBM" icon={<VideoIcon />} tone="violet" busy={busy} onDownload={onDownload} />
        <ArtifactButton kind="report" name="Отчёт с таймлайном" format="TXT" icon={<ReportIcon />} tone="cyan" busy={busy} onDownload={onDownload} />
        <ArtifactButton kind="har" name="Безопасный Network" format="SAFE HAR" icon={<NetworkIcon />} tone="amber" busy={busy} onDownload={onDownload} />
      </div>

      <button className="primary download-all" disabled={busy} onClick={() => onDownload()}>
        <DownloadIcon />
        <span>{busy ? 'Скачиваем файлы' : 'Скачать весь пакет'}</span>
      </button>
    </section>
  );
}

function SummaryItem({ value, label, danger = false }: { value: string | number; label: string; danger?: boolean }) {
  return <div><strong className={danger && Number(value) > 0 ? 'danger' : ''}>{value}</strong><span>{label}</span></div>;
}

function ArtifactButton({ kind, name, format, icon, tone, busy, onDownload }: {
  kind: ArtifactKind;
  name: string;
  format: string;
  icon: ReactNode;
  tone: string;
  busy: boolean;
  onDownload: (kind?: ArtifactKind) => void;
}) {
  return (
    <button className="artifact-row" disabled={busy} onClick={() => onDownload(kind)} aria-label={`Скачать ${name}`}>
      <span className={`artifact-icon ${tone}`}>{icon}</span>
      <span className="artifact-copy"><strong>{name}</strong><small>{format}</small></span>
      <span className="artifact-download"><DownloadIcon /></span>
    </button>
  );
}

function shortBrowserName(name?: string): string {
  if (!name) return 'BROWSER';
  if (name.includes('Яндекс')) return 'YANDEX';
  if (name.includes('Edge')) return 'EDGE';
  if (name.includes('Chrome')) return 'CHROME';
  return 'CHROMIUM';
}

function shortVersion(version?: string): string {
  return version ? `v${version.split('.').slice(0, 2).join('.')}` : '';
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>
);

function BrandIcon() { return <span className="brand-icon"><Icon><path d="M8.3 5.5 6.8 3.7M15.7 5.5l1.5-1.8M5.7 9H3.2m15.1 0h2.5M5.5 14H3m15.5 0H21M8.1 19.2 6.5 21m9.4-1.8 1.6 1.8"/><path d="M7 8.8A5 5 0 0 1 12 4a5 5 0 0 1 5 4.8v5.7a5 5 0 0 1-10 0V8.8Z"/><path d="M7 11h10M12 4v15.3"/></Icon></span>; }
function GlobeIcon() { return <Icon><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.4 2.3 3.6 5 3.6 8S14.4 17.7 12 20c-2.4-2.3-3.6-5-3.6-8S9.6 6.3 12 4Z"/></Icon>; }
function ScreenIcon() { return <Icon><rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/></Icon>; }
function NetworkIcon() { return <Icon><circle cx="6" cy="17" r="2.2"/><circle cx="18" cy="7" r="2.2"/><path d="m7.8 15.6 8.4-7.2M7.5 7.5h4v4"/></Icon>; }
function ConsoleIcon() { return <Icon><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m7 9 2.5 2.5L7 14m5.5 0h4"/></Icon>; }
function ShieldIcon() { return <Icon><path d="M12 3.2 19 6v5.2c0 4.4-2.8 7.8-7 9.6-4.2-1.8-7-5.2-7-9.6V6l7-2.8Z"/><path d="m8.8 12 2 2 4.5-4.6"/></Icon>; }
function CheckSmallIcon() { return <Icon><path d="m7.5 12.2 2.8 2.8 6.4-6.5"/></Icon>; }
function ArrowIcon() { return <Icon><path d="M5 12h14m-5-5 5 5-5 5"/></Icon>; }
function MarkerIcon() { return <Icon><path d="M6 4.5h12v16L12 17l-6 3.5v-16Z"/></Icon>; }
function AlertIcon() { return <Icon><path d="M12 3.5 21 20H3l9-16.5Z"/><path d="M12 9v5m0 3h.01"/></Icon>; }
function CheckIcon() { return <Icon><path d="m5 12.5 4.3 4.3L19 7"/></Icon>; }
function VideoIcon() { return <Icon><rect x="3.5" y="6" width="12.5" height="12" rx="2"/><path d="m16 10 4.5-2v8L16 14"/></Icon>; }
function ReportIcon() { return <Icon><path d="M6 3.5h8l4 4V20H6V3.5Z"/><path d="M14 3.5V8h4M9 12h6m-6 3h6"/></Icon>; }
function DownloadIcon() { return <Icon><path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/></Icon>; }
