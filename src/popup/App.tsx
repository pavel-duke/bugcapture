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

  return (
    <main className="app">
      <Header />

      <div className="app-content">
        {loading ? (
          <LoadingView />
        ) : summary.status === 'starting' || summary.status === 'processing' ? (
          <ProcessingView />
        ) : summary.status === 'recording' ? (
          <RecordingView
            summary={summary}
            busy={busy}
            onMark={() => void run(() => client.markProblem())}
            onStop={() => void run(() => client.stop())}
          />
        ) : summary.status === 'completed' && summary.result ? (
          <CompletedView summary={summary} busy={busy} onDownload={() => void download()} />
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

      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="header">
      <div className="brand">
        <BrandIcon />
        <strong>BugCapture</strong>
      </div>
      <span className="version">v{BUGCAPTURE_VERSION}</span>
    </header>
  );
}

function ReadyView({ summary, busy, onStart }: { summary: CaptureSummary; busy: boolean; onStart: () => void }) {
  return (
    <section className="state ready-view">
      <div className="target">
        <span className="target-dot" />
        <span>{summary.currentTab?.hostname || 'Откройте веб-страницу'}</span>
        <span className="sr-only">Браузер: {summary.browser?.name || 'не определён'}</span>
      </div>

      <button className="record-button" disabled={busy || !summary.currentTab} onClick={onStart}>
        <span className="record-dot" />
        <span>{busy ? 'Запускаем…' : 'Начать запись'}</span>
      </button>

      <p className="capture-note">Экран · Network · Console</p>
    </section>
  );
}

function RecordingView({ summary, busy, onMark, onStop }: { summary: CaptureSummary; busy: boolean; onMark: () => void; onStop: () => void }) {
  return (
    <section className="state recording-view" aria-live="polite">
      <div className="recording-status"><span />Запись</div>
      <div className="timer">{formatDuration(summary.duration)}</div>
      <p className="recording-target">{summary.currentTab?.hostname}</p>

      <div className="recording-actions">
        <button className="mark-button" disabled={busy} onClick={onMark}>
          <MarkerIcon />
          <span>{busy ? 'Отмечаем…' : 'Отметить момент'}</span>
        </button>
        <button className="stop-button" disabled={busy} onClick={onStop}>
          <span className="stop-icon" />
          <span>{busy ? 'Останавливаем…' : 'Остановить'}</span>
        </button>
      </div>
    </section>
  );
}

function ProcessingView() {
  return (
    <section className="state processing-view" aria-live="polite">
      <span className="loader" />
      <h2>Готовим файлы</h2>
      <p>Очищаем данные и сохраняем отчёт</p>
    </section>
  );
}

function CompletedView({ summary, busy, onDownload }: { summary: CaptureSummary; busy: boolean; onDownload: () => void }) {
  return (
    <section className="state completed-view">
      <span className="complete-icon"><CheckIcon /></span>
      <h2>Готово</h2>
      <p>{formatDuration(summary.duration)} · {summary.requestCount} запросов</p>
      {summary.downloadsStarted && <span className="download-status">Скачивание началось автоматически</span>}
      <button className="download-button" disabled={busy} onClick={onDownload}>
        <DownloadIcon />
        <span>{busy ? 'Скачиваем…' : 'Скачать пакет повторно'}</span>
      </button>
    </section>
  );
}

function LoadingView() {
  return (
    <section className="state loading-view" aria-live="polite">
      <span className="loader" />
      <p>Подключаемся…</p>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <a href="https://github.com/pavel-duke" target="_blank" rel="noreferrer">
        <GithubIcon />
        <span>github.com/pavel-duke</span>
      </a>
      <span>Данные остаются на устройстве</span>
    </footer>
  );
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
function MarkerIcon() { return <Icon><path d="M6 4.5h12v16L12 17l-6 3.5v-16Z"/></Icon>; }
function AlertIcon() { return <Icon><path d="M12 3.5 21 20H3l9-16.5Z"/><path d="M12 9v5m0 3h.01"/></Icon>; }
function CheckIcon() { return <Icon><path d="m5 12.5 4.3 4.3L19 7"/></Icon>; }
function DownloadIcon() { return <Icon><path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/></Icon>; }
function GithubIcon() { return <Icon><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.4 4 5 5 0 0 0 19.3.5S18.2.1 15 1.8a12 12 0 0 0-6 0C5.8.1 4.7.5 4.7.5A5 5 0 0 0 4.6 4a5.4 5.4 0 0 0-1.4 3.7c0 5.3 3.5 6.5 6.8 6.9a4.8 4.8 0 0 0-1 3.4v4"/><path d="M9 18c-3 .9-3-1.5-4.2-2"/></Icon>; }
